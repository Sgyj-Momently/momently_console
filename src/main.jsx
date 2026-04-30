import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  FileText,
  Image,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import "./styles.css";

const STEPS = [
  ["CREATED", "준비"],
  ["PHOTO_INFO_EXTRACTED", "사진 정보"],
  ["PHOTO_GROUPED", "그룹화"],
  ["HERO_PHOTO_SELECTED", "대표 사진"],
  ["OUTLINE_CREATED", "개요"],
  ["DRAFT_CREATED", "초안"],
  ["STYLE_APPLIED", "문체"],
  ["REVIEW_COMPLETED", "검수"],
  ["COMPLETED", "완료"],
];

const ARTIFACTS = [
  ["bundle", "Bundle"],
  ["grouping", "Groups"],
  ["hero", "Hero"],
  ["outline", "Outline"],
  ["draft", "Draft"],
  ["style", "Styled"],
  ["review", "Final"],
  ["blog", "Blog"],
];

function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState("http://127.0.0.1:18080");
  const [projectId, setProjectId] = useState("sample_images");
  const [groupingStrategy, setGroupingStrategy] = useState("LOCATION_BASED");
  const [timeWindowMinutes, setTimeWindowMinutes] = useState(90);
  const [workflow, setWorkflow] = useState(null);
  const [artifactType, setArtifactType] = useState("review");
  const [artifact, setArtifact] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const workflowId = workflow?.workflowId;
  const status = workflow?.status || "IDLE";
  const completedIndex = useMemo(() => currentStepIndex(status), [status]);

  useEffect(() => {
    if (!autoRefresh || !workflowId || ["COMPLETED", "FAILED"].includes(status)) {
      return undefined;
    }
    const timer = window.setInterval(() => refreshWorkflow(false), 1800);
    return () => window.clearInterval(timer);
  }, [autoRefresh, workflowId, status, apiBaseUrl]);

  async function createWorkflow() {
    setBusy(true);
    setMessage("");
    setArtifact(null);
    try {
      const response = await request(`${apiBaseUrl}/api/v1/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          groupingStrategy,
          timeWindowMinutes: Number(timeWindowMinutes),
        }),
      });
      setWorkflow(response);
      setMessage("워크플로가 생성됐습니다.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function runWorkflow() {
    if (!workflowId) {
      await createWorkflow();
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await request(`${apiBaseUrl}/api/v1/workflows/${workflowId}/run`, { method: "POST", expectJson: false });
      setMessage("실행을 시작했습니다.");
      await refreshWorkflow(false);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function refreshWorkflow(showMessage = true) {
    if (!workflowId) return;
    try {
      const response = await request(`${apiBaseUrl}/api/v1/workflows/${workflowId}`);
      setWorkflow(response);
      if (showMessage) setMessage("상태를 갱신했습니다.");
    } catch (error) {
      if (showMessage) setMessage(error.message);
    }
  }

  async function loadArtifact(nextType = artifactType) {
    if (!workflowId) return;
    setBusy(true);
    setMessage("");
    setArtifactType(nextType);
    try {
      const response = await request(`${apiBaseUrl}/api/v1/workflows/${workflowId}/artifacts/${nextType}`);
      setArtifact(response);
    } catch (error) {
      setArtifact(null);
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  const finalMarkdown =
    artifact?.json?.final_markdown ||
    artifact?.json?.markdown ||
    artifact?.text ||
    "";

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <h1>Momently Console</h1>
          <p>{workflowId ? workflowId : "새 워크플로를 만들고 전체 파이프라인을 실행합니다."}</p>
        </div>
        <div className={`status-pill status-${status.toLowerCase()}`}>{status}</div>
      </section>

      <section className="workspace">
        <aside className="panel controls">
          <div className="panel-title">
            <Settings size={18} />
            <span>Run Config</span>
          </div>
          <label>
            API Base URL
            <input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} />
          </label>
          <label>
            Project ID
            <input value={projectId} onChange={(event) => setProjectId(event.target.value)} />
          </label>
          <label>
            Grouping Strategy
            <select value={groupingStrategy} onChange={(event) => setGroupingStrategy(event.target.value)}>
              <option>LOCATION_BASED</option>
              <option>TIME_BASED</option>
            </select>
          </label>
          <label>
            Time Window
            <input
              type="number"
              min="1"
              value={timeWindowMinutes}
              onChange={(event) => setTimeWindowMinutes(event.target.value)}
            />
          </label>
          <div className="button-row">
            <button onClick={createWorkflow} disabled={busy}>
              <Sparkles size={16} /> Create
            </button>
            <button className="primary" onClick={runWorkflow} disabled={busy}>
              {busy ? <Loader2 className="spin" size={16} /> : <Play size={16} />} Run
            </button>
          </div>
          <div className="button-row">
            <button onClick={() => refreshWorkflow()} disabled={!workflowId}>
              <RefreshCw size={16} /> Refresh
            </button>
            <label className="toggle">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(event) => setAutoRefresh(event.target.checked)}
              />
              Auto
            </label>
          </div>
          {message ? <div className="message">{message}</div> : null}
        </aside>

        <section className="main-column">
          <section className="panel">
            <div className="panel-title">
              <Search size={18} />
              <span>Pipeline</span>
            </div>
            <div className="timeline">
              {STEPS.map(([key, label], index) => (
                <div className={`step ${index <= completedIndex ? "done" : ""}`} key={key}>
                  <span>{index + 1}</span>
                  <strong>{label}</strong>
                </div>
              ))}
            </div>
            <div className="metrics">
              <Metric label="Photos" value={workflow?.photoCount} />
              <Metric label="Groups" value={workflow?.groupCount} />
              <Metric label="Heroes" value={workflow?.heroPhotoCount} />
              <Metric label="Sections" value={workflow?.outlineSectionCount} />
              <Metric label="Words" value={workflow?.styledWordCount} />
              <Metric label="Issues" value={workflow?.reviewIssueCount} />
            </div>
          </section>

          <section className="panel artifact-panel">
            <div className="panel-title">
              <FileText size={18} />
              <span>Artifacts</span>
            </div>
            <div className="tabs">
              {ARTIFACTS.map(([key, label]) => (
                <button
                  key={key}
                  className={artifactType === key ? "active" : ""}
                  onClick={() => loadArtifact(key)}
                  disabled={!workflowId || busy}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="artifact-grid">
              <article>
                <div className="article-head">
                  <Image size={17} />
                  <span>Preview</span>
                </div>
                <MarkdownPreview markdown={finalMarkdown} />
              </article>
              <article>
                <div className="article-head">
                  <FileText size={17} />
                  <span>Raw</span>
                </div>
                <pre>{artifact ? formatArtifact(artifact) : "아티팩트를 선택하면 내용이 표시됩니다."}</pre>
              </article>
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value ?? "-"}</strong>
    </div>
  );
}

function MarkdownPreview({ markdown }) {
  if (!markdown) return <div className="empty">최종 Markdown을 불러오면 여기에 미리보기가 표시됩니다.</div>;
  return (
    <div className="markdown">
      {markdown.split("\n").map((line, index) => {
        if (line.startsWith("# ")) return <h2 key={index}>{line.replace("# ", "")}</h2>;
        if (line.startsWith("## ")) return <h3 key={index}>{line.replace("## ", "")}</h3>;
        if (line.startsWith("- ")) return <p className="bullet" key={index}>{line}</p>;
        if (line.startsWith("![")) return <p className="image-line" key={index}>{line}</p>;
        return line ? <p key={index}>{line}</p> : <br key={index} />;
      })}
    </div>
  );
}

function currentStepIndex(status) {
  const exact = STEPS.findIndex(([key]) => key === status);
  if (exact >= 0) return exact;
  const inProgressMap = {
    PHOTO_INFO_EXTRACTING: 0,
    PHOTO_GROUPING: 1,
    HERO_PHOTO_SELECTING: 2,
    OUTLINE_CREATING: 3,
    DRAFT_CREATING: 4,
    STYLE_APPLYING: 5,
    REVIEWING: 6,
  };
  return inProgressMap[status] ?? -1;
}

function formatArtifact(artifact) {
  if (artifact.json) return JSON.stringify(artifact.json, null, 2);
  return artifact.text || "";
}

async function request(url, options = {}) {
  const { expectJson = true, ...fetchOptions } = options;
  const response = await fetch(url, fetchOptions);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}${body ? `: ${body}` : ""}`);
  }
  if (!expectJson || response.status === 202 || response.status === 204) return null;
  const data = await response.json();
  return data.content ? data.content : data;
}

createRoot(document.getElementById("root")).render(<App />);

