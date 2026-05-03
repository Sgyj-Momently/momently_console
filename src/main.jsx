import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  NavLink,
  Navigate,
  Outlet,
  RouterProvider,
  useNavigate,
} from "react-router-dom";
import {
  Activity,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Image,
  Loader2,
  LogOut,
  Palette,
  PenLine,
  Play,
  RefreshCw,
  Settings,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import "./styles.css";
import { apiOriginFromEnv, voiceOriginFromEnv } from "./apiOrigin.js";
import { orchestratorNeedsBearer } from "./orchestratorAuth.js";

// ── Constants ─────────────────────────────────────────────────────────────────

// 상대 경로(/api…) 기본값. vite dev 에서는 vite.config.js 의 /api 프록시 → 게이트(기본 18580).
const API_ORIGIN = apiOriginFromEnv(import.meta.env);
const VOICE_ORIGIN = voiceOriginFromEnv(import.meta.env);

function orchPath(rel) {
  const path = rel.startsWith("/") ? rel : `/${rel}`;
  return API_ORIGIN ? `${API_ORIGIN}${path}` : path;
}

function voicePath(rel) {
  const path = rel.startsWith("/") ? rel : `/${rel}`;
  return VOICE_ORIGIN ? `${VOICE_ORIGIN}${path}` : path;
}

const STORAGE_TOKEN_KEY = "momently_access_token";

function getAccessToken() {
  try {
    return sessionStorage.getItem(STORAGE_TOKEN_KEY) ?? localStorage.getItem(STORAGE_TOKEN_KEY);
  } catch {
    return null;
  }
}

function persistAccessToken(token) {
  try {
    sessionStorage.setItem(STORAGE_TOKEN_KEY, token);
    localStorage.setItem(STORAGE_TOKEN_KEY, token);
  } catch {
    //
  }
}

function orchestratorAuthHeaders(existing = {}) {
  const token = getAccessToken();
  if (!token) return existing;
  return { ...existing, Authorization: `Bearer ${token}` };
}

function clearOrchestratorSession() {
  try {
    sessionStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
  } catch {
    //
  }
}

function redirectToLoginIfNeeded() {
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.assign("/login");
  }
}

/** Authorization Bearer가 요청에 실렸을 때만 401 처리에서 세션 종료한다(헤더 누락 버그와 구분). */
function requestCarriesOrcAuthorization(headers) {
  if (headers == null) return false;
  if (headers instanceof Headers) {
    const raw = headers.get("Authorization") ?? "";
    return /^Bearer\s+\S/im.test(raw);
  }
  const raw = headers.Authorization ?? "";
  return typeof raw === "string" && /^Bearer\s+\S/im.test(raw);
}

/** 서버 업로드 API와 동일한 확장자(대소문자 무시). */
const UPLOAD_IMAGE_EXT_RE = /\.(jpe?g|png|heic|heif|webp)$/i;
const UPLOAD_MAX_FILES = 40;

const PIPELINE_STEPS = [
  ["CREATED", "준비"],
  ["PHOTO_INFO_EXTRACTED", "사진 분석"],
  ["PRIVACY_REVIEWED", "민감정보"],
  ["QUALITY_SCORED", "품질"],
  ["PHOTO_GROUPED", "그룹화"],
  ["HERO_PHOTO_SELECTED", "대표 사진"],
  ["OUTLINE_CREATED", "개요"],
  ["DRAFT_CREATED", "초안"],
  ["STYLE_APPLIED", "문체"],
  ["REVIEW_COMPLETED", "검수"],
  ["COMPLETED", "완료"],
];

const IN_PROGRESS_MAP = {
  PHOTO_INFO_EXTRACTING: 0,
  PRIVACY_REVIEWING: 1,
  QUALITY_SCORING: 2,
  PHOTO_GROUPING: 3,
  HERO_PHOTO_SELECTING: 4,
  OUTLINE_CREATING: 5,
  DRAFT_CREATING: 6,
  STYLE_APPLYING: 7,
  REVIEWING: 8,
};

const CONTENT_TYPES = ["블로그", "여행후기", "음식후기", "체험단", "이벤트"];

const ARTIFACT_TABS = [
  ["review", "최종 블로그"],
  ["style", "문체 적용"],
  ["draft", "초안"],
  ["outline", "개요"],
];

const ALL_ARTIFACT_TABS = [
  ["bundle", "Bundle"],
  ["privacy", "Privacy"],
  ["quality", "Quality"],
  ["grouping", "Groups"],
  ["hero", "Hero"],
  ["outline", "Outline"],
  ["draft", "Draft"],
  ["style", "Styled"],
  ["review", "Final"],
  ["blog", "Blog"],
];

const BUILTIN_VOICE_PROFILES = [
  {
    id: "preset_mz",
    name: "MZ 말투",
    description: "친근하고 캐주얼한 MZ세대 스타일",
    sample_preview: "오늘 다녀온 곳 진짜 대박... 갬성 터지는 분위기에 음식도 맛있어서 또 가고 싶음",
    style_prompt: "짧고 캐주얼하게 쓴다. 감탄사, 줄임말, 생생한 반응을 자연스럽게 섞고 너무 격식 차리지 않는다.",
  },
  {
    id: "preset_manager",
    name: "부장님 말투",
    description: "약간 격식 있고 넉살 좋은 회식 후기 스타일",
    sample_preview: "역시 이런 곳은 함께 와야 제맛입니다. 분위기도 좋고 음식도 아주 실하게 나왔습니다.",
    style_prompt: "정중하지만 살짝 넉살 있게 쓴다. 칭찬은 큼직하게 하고, 문장은 안정적인 존댓말로 마무리한다.",
  },
  {
    id: "preset_retro",
    name: "레트로 말투",
    description: "어른 세대 온라인 후기처럼 구수하고 담백한 문체",
    sample_preview: "간만에 좋은 데 다녀왔습니다. 사진으로 보니 그때 생각이 또 나네요.",
    style_prompt: "구수하고 담백한 존댓말로 쓴다. 과한 유행어는 피하고, 차분한 감상과 소박한 칭찬을 섞는다.",
  },
  {
    id: "preset_formal",
    name: "정중한 말투",
    description: "격식 있고 품격 있는 문체",
    sample_preview: "오늘 방문한 곳은 분위기가 매우 아늑하였으며 음식의 완성도 또한 높았습니다.",
    style_prompt: "격식 있고 정돈된 존댓말로 쓴다. 감정보다는 관찰과 평가를 차분하게 전달한다.",
  },
  {
    id: "preset_emotional",
    name: "감성 글",
    description: "서정적이고 감성적인 문체",
    sample_preview: "햇살이 내려앉은 오후, 그 공간은 마치 시간이 멈춘 듯 고요했다...",
    style_prompt: "서정적인 묘사와 감각적인 표현을 사용한다. 문장은 부드럽고 여운 있게 마무리한다.",
  },
  {
    id: "preset_info",
    name: "정보형",
    description: "사실 위주의 깔끔한 정보 전달",
    sample_preview: "위치: 서울 강남구. 영업시간: 11:00-22:00. 가격대: 1인 15,000~25,000원.",
    style_prompt: "핵심 정보를 먼저 정리하고 사실 위주로 간결하게 쓴다. 감상은 짧게 덧붙인다.",
  },
];

// ── localStorage helpers ──────────────────────────────────────────────────────

function loadCachedVoiceProfiles() {
  try {
    return JSON.parse(localStorage.getItem("momently_voice_profiles") || "[]");
  } catch {
    return [];
  }
}

function saveCachedVoiceProfiles(profiles) {
  localStorage.setItem("momently_voice_profiles", JSON.stringify(profiles));
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem("momently_history") || "[]");
  } catch {
    return [];
  }
}

function addToHistory(entry) {
  const history = loadHistory();
  const exists = history.findIndex((h) => h.workflowId === entry.workflowId);
  if (exists >= 0) {
    history[exists] = { ...history[exists], ...entry };
  } else {
    history.unshift(entry);
  }
  localStorage.setItem("momently_history", JSON.stringify(history.slice(0, 50)));
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiRequest(url, options = {}) {
  const { expectJson = true, ...fetchOptions } = options;
  const needsOrcAuth = orchestratorNeedsBearer(url);

  let headers =
    typeof fetchOptions.headers === "object" &&
    fetchOptions.headers !== null &&
    !(fetchOptions.headers instanceof Headers)
      ? { ...fetchOptions.headers }
      : fetchOptions.headers;

  if (needsOrcAuth) {
    const token = getAccessToken();
    if (headers instanceof Headers) {
      if (token) headers.set("Authorization", `Bearer ${token}`);
    } else if (headers != null && typeof headers === "object") {
      headers = orchestratorAuthHeaders(headers);
    } else if (headers === undefined) {
      headers = orchestratorAuthHeaders();
    }
  }

  const response = await fetch(url, {
    ...fetchOptions,
    ...(headers !== undefined ? { headers } : {}),
  });

  if (response.status === 401 && needsOrcAuth && requestCarriesOrcAuthorization(headers)) {
    clearOrchestratorSession();
    redirectToLoginIfNeeded();
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}${body ? `: ${body}` : ""}`);
  }
  if (!expectJson || response.status === 202 || response.status === 204) return null;
  const data = await response.json();
  return data.content ?? data;
}

/**
 * multipart 전용 요청이다. 브라우저가 multipart boundary 헤더를 붙일 수 있게 Content-Type은 넣지 않는다.
 * 실패 시 JSON 본문 { error } 우선 노출한다.
 */
async function uploadMultipartJson(url, formData) {
  const needsOrcAuth = orchestratorNeedsBearer(url);
  const authHeaders =
    needsOrcAuth && getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : undefined;

  const response = await fetch(url, {
    method: "POST",
    body: formData,
    ...(authHeaders ? { headers: authHeaders } : {}),
  });
  const text = await response.text();

  if (response.status === 401 && needsOrcAuth && requestCarriesOrcAuthorization(authHeaders ?? null)) {
    clearOrchestratorSession();
    redirectToLoginIfNeeded();
  }

  if (!response.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error && typeof parsed.error === "string") {
        detail = parsed.error;
      }
    } catch {
      //
    }
    throw new Error(detail ? `${response.status}: ${detail}` : `${response.status} ${response.statusText}`);
  }
  return JSON.parse(text);
}

async function loginApi(username, password) {
  const path = orchPath("/api/v1/auth/login");
  const resolved =
    typeof window !== "undefined" && typeof path === "string" && path.startsWith("/")
      ? `${window.location.origin}${path}`
      : path;

  let response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
  } catch (err) {
    console.error("[Momently] 로그인 요청 실패:", resolved, err);
    const devHint = import.meta.env.DEV ? " 게이트(기본 :18580)·`vite.config.js` /api 프록시를 확인하세요." : "";
    throw new Error(
      `서버에 연결하지 못했습니다. (${resolved}) 게이트와 오케스트레이터 상태, 브라우저 네트워크 탭을 확인하세요.${devHint}`
    );
  }
  const text = await response.text();
  if (!response.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error && typeof parsed.error === "string") {
        detail = parsed.error;
      }
    } catch {
      //
    }
    throw new Error(detail || `${response.status} ${response.statusText}`);
  }
  return JSON.parse(text);
}

async function uploadImagesApi(files) {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }
  return uploadMultipartJson(orchPath("/api/v1/uploads/images"), form);
}

async function createWorkflowApi(projectId, groupingStrategy, timeWindowMinutes, voiceProfileId) {
  return apiRequest(orchPath("/api/v1/workflows"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      groupingStrategy,
      timeWindowMinutes: Number(timeWindowMinutes),
      voiceProfileId: voiceProfileId === "기본" ? null : voiceProfileId,
    }),
  });
}

async function runWorkflowApi(workflowId) {
  return apiRequest(orchPath(`/api/v1/workflows/${workflowId}/run`), {
    method: "POST",
    expectJson: false,
  });
}

async function fetchWorkflow(workflowId) {
  return apiRequest(orchPath(`/api/v1/workflows/${workflowId}`));
}

async function fetchArtifact(workflowId, type) {
  return apiRequest(orchPath(`/api/v1/workflows/${workflowId}/artifacts/${type}`));
}

async function fetchVoiceProfilesApi() {
  const data = await apiRequest(voicePath("/api/v1/voice-profiles"));
  const profiles = data.profiles ?? [];
  saveCachedVoiceProfiles(profiles);
  return profiles;
}

async function createVoiceProfileApi(name, description) {
  return apiRequest(voicePath("/api/v1/voice-profiles"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description }),
  });
}

async function addVoiceSampleApi(profileId, title, content) {
  return apiRequest(voicePath(`/api/v1/voice-profiles/${profileId}/samples`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, content }),
  });
}

async function analyzeVoiceProfileApi(profileId) {
  return apiRequest(voicePath(`/api/v1/voice-profiles/${profileId}/analyze`), {
    method: "POST",
  });
}

// ── Shared utilities ──────────────────────────────────────────────────────────

function currentStepIndex(status) {
  const exact = PIPELINE_STEPS.findIndex(([key]) => key === status);
  if (exact >= 0) return exact;
  return IN_PROGRESS_MAP[status] ?? -1;
}

function isActiveStep(status, index) {
  const exact = PIPELINE_STEPS.findIndex(([key]) => key === status);
  if (exact >= 0) return false;
  return IN_PROGRESS_MAP[status] === index;
}

function formatScore(value) {
  if (value === null || value === undefined) return undefined;
  return Number(value).toFixed(2);
}

function formatArtifactText(artifact) {
  if (!artifact) return "";
  if (artifact.json) return JSON.stringify(artifact.json, null, 2);
  return artifact.text || "";
}

function extractMarkdown(artifact) {
  if (!artifact) return "";
  return artifact?.json?.final_markdown || artifact?.json?.markdown || artifact?.text || "";
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

// ── Auth shell ─────────────────────────────────────────────────────────────────

function RequireAuth({ children }) {
  if (!getAccessToken()) return <Navigate to="/login" replace />;
  return children;
}

function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await loginApi(username.trim(), password);
      persistAccessToken(data.accessToken);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err?.message || "로그인에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <title>로그인 | Momently</title>

      {/* Left panel — branding */}
      <div className="login-left">
        <div className="login-left-inner">
          <div className="login-logo">
            <Sparkles size={22} />
            <span>Momently</span>
          </div>
          <div className="login-hero">
            <h2>사진 한 장에서<br />블로그 한 편으로</h2>
            <p>AI가 사진을 분석하고 그룹화해<br />나만의 말투로 글을 완성합니다.</p>
          </div>
          <div className="login-features">
            {[
              ["사진 분석", "EXIF · 장면 · 품질 자동 추출"],
              ["말투 학습", "내 문체를 기억해서 적용"],
              ["전체 파이프라인", "그룹화 → 초안 → 검수 자동화"],
            ].map(([title, desc]) => (
              <div key={title} className="login-feature-item">
                <div className="login-feature-dot" />
                <div>
                  <strong>{title}</strong>
                  <span>{desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="login-right">
        <div className="login-form-wrap">
          <h3 className="login-form-title">콘솔 로그인</h3>
          <p className="login-form-sub">계정 정보를 입력해 주세요</p>

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="login-user">아이디</label>
              <input
                id="login-user"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="아이디"
                disabled={busy}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="login-pass">비밀번호</label>
              <input
                id="login-pass"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호"
                disabled={busy}
                required
              />
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <button
              type="submit"
              className="btn btn-primary btn-lg login-submit"
              disabled={busy}
            >
              {busy ? <Loader2 className="spin" size={18} /> : null}
              {busy ? "로그인 중..." : "로그인"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MarkdownPreview({ markdown }) {
  if (!markdown) {
    return <div className="text-muted" style={{ padding: "20px 0" }}>미리보기가 없습니다.</div>;
  }
  return (
    <div className="markdown">
      {markdown.split("\n").map((line, i) => {
        if (line.startsWith("# ")) return <h2 key={i}>{line.slice(2)}</h2>;
        if (line.startsWith("## ")) return <h3 key={i}>{line.slice(3)}</h3>;
        if (line.startsWith("- ")) return <p className="bullet" key={i}>{line}</p>;
        if (line.startsWith("![")) return <p className="image-line" key={i}>{line}</p>;
        return line ? <p key={i}>{line}</p> : <br key={i} />;
      })}
    </div>
  );
}

function PipelineSteps({ status }) {
  const doneIndex = currentStepIndex(status);
  return (
    <div className="pipeline-steps">
      {PIPELINE_STEPS.map(([key, label], i) => {
        const done = i < doneIndex || key === status;
        const active = isActiveStep(status, i);
        const cls = done ? "done" : active ? "active" : "pending";
        return (
          <div key={key} className={`pipeline-step ${cls}`}>
            <div className={`step-dot ${cls}`}>
              {done && <Check size={11} strokeWidth={3} />}
            </div>
            <div className="step-label">{label}</div>
          </div>
        );
      })}
    </div>
  );
}

function MetricsRow({ workflow }) {
  const metrics = [
    ["사진", workflow?.photoCount],
    ["제외", workflow?.privacyExcludedCount],
    ["품질", formatScore(workflow?.averageQualityScore)],
    ["그룹", workflow?.groupCount],
    ["대표", workflow?.heroPhotoCount],
    ["섹션", workflow?.outlineSectionCount],
    ["단어", workflow?.styledWordCount],
    ["이슈", workflow?.reviewIssueCount],
  ];
  return (
    <div className="pipeline-metrics">
      {metrics.map(([label, val]) => (
        <div key={label} className="metric-card">
          <span>{label}</span>
          <strong>{val ?? "-"}</strong>
        </div>
      ))}
    </div>
  );
}

function ArtifactViewer({ workflowId, tabs = ARTIFACT_TABS }) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.[0] ?? "blog");
  const [artifact, setArtifact] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(type) {
    setActiveTab(type);
    setLoading(true);
    setError("");
    try {
      const data = await fetchArtifact(workflowId, type);
      setArtifact(data);
    } catch (e) {
      setArtifact(null);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (workflowId) load(tabs[0]?.[0] ?? "blog");
  }, [workflowId]);

  const markdown = extractMarkdown(artifact);
  const raw = formatArtifactText(artifact);

  return (
    <div>
      <div className="tab-row">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            className={`tab-btn ${activeTab === key ? "active" : ""}`}
            onClick={() => load(key)}
            disabled={loading}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <div className="alert alert-error mt-8">{error}</div>}
      <div className="artifact-body">
        <div className="artifact-pane">
          <div className="artifact-pane-header">
            <Image size={13} /> 미리보기
          </div>
          <div className="artifact-pane markdown-wrap">
            {loading ? (
              <div className="flex-row text-muted" style={{ padding: "20px 0" }}>
                <Loader2 className="spin" size={16} /> 불러오는 중...
              </div>
            ) : (
              <MarkdownPreview markdown={markdown} />
            )}
          </div>
        </div>
        <div className="artifact-pane">
          <div className="artifact-pane-header">
            <FileText size={13} /> Raw JSON
          </div>
          <pre>{loading ? "..." : raw || "아티팩트를 선택하면 내용이 표시됩니다."}</pre>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const cls =
    status === "COMPLETED" ? "completed" : status === "FAILED" ? "failed" : "";
  return <span className={`status-pill ${cls}`}>{status}</span>;
}

// ── Write Page ────────────────────────────────────────────────────────────────

function WritePage() {
  const [photoMode, setPhotoMode] = useState("id"); // "id" | "upload"
  const [projectId, setProjectId] = useState("sample_images");
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [contentType, setContentType] = useState("블로그");
  const [direction, setDirection] = useState("");
  const [selectedVoiceProfileId, setSelectedVoiceProfileId] = useState("기본");
  const [voiceProfiles, setVoiceProfiles] = useState(loadCachedVoiceProfiles);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [groupingStrategy, setGroupingStrategy] = useState("LOCATION_BASED");
  const [timeWindowMinutes, setTimeWindowMinutes] = useState(90);

  // 체험단 rules
  const [minPhotos, setMinPhotos] = useState(5);
  const [includeSignage, setIncludeSignage] = useState(false);
  const [mentionBrand, setMentionBrand] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [extraRules, setExtraRules] = useState("");

  // Running state
  const [phase, setPhase] = useState("form"); // "form" | "running" | "done"
  const [workflow, setWorkflow] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const fileInputRef = useRef(null);
  const pollRef = useRef(null);

  const allVoiceProfiles = [
    { id: "기본", name: "기본", description: "기본 warm_blog 스타일", sample_preview: "" },
    ...BUILTIN_VOICE_PROFILES,
    ...voiceProfiles,
  ];
  const activeVoiceProfile = allVoiceProfiles.find((profile) => profile.id === selectedVoiceProfileId);

  useEffect(() => {
    fetchVoiceProfilesApi()
      .then(setVoiceProfiles)
      .catch(() => {
        setVoiceProfiles(loadCachedVoiceProfiles());
      });
  }, []);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling(wfId) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const data = await fetchWorkflow(wfId);
        setWorkflow(data);
        addToHistory({
          workflowId: data.workflowId,
          contentType,
          createdAt: new Date().toISOString(),
          status: data.status,
        });
        if (["COMPLETED", "FAILED"].includes(data.status)) {
          stopPolling();
          setPhase("done");
        }
      } catch {
        // keep polling
      }
    }, 2000);
  }

  useEffect(() => () => stopPolling(), []);

  function handleFiles(files) {
    const list = Array.from(files || []).filter(Boolean);
    setUploadedFiles((prev) => {
      const capped = [...prev];
      for (const f of list) {
        const mimeOk = typeof f.type === "string" && f.type.startsWith("image/");
        const extOk = typeof f.name === "string" && UPLOAD_IMAGE_EXT_RE.test(f.name);
        if (!mimeOk && !extOk) {
          continue;
        }
        if (capped.length >= UPLOAD_MAX_FILES) break;
        capped.push({ file: f, url: URL.createObjectURL(f) });
      }
      return capped;
    });
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  function removePhoto(index) {
    setUploadedFiles((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleStart() {
    setBusy(true);
    setError("");
    try {
      let effectiveProjectId = projectId.trim();
      if (photoMode === "upload") {
        if (uploadedFiles.length === 0) {
          setError("한 장 이상의 사진을 선택해 주세요.");
          setBusy(false);
          return;
        }
        const thumbnails = uploadedFiles.slice();
        const up = await uploadImagesApi(uploadedFiles.map((entry) => entry.file));
        effectiveProjectId = up.projectId;
        thumbnails.forEach((item) => URL.revokeObjectURL(item.url));
        setUploadedFiles([]);
      }

      const wf = await createWorkflowApi(effectiveProjectId, groupingStrategy, timeWindowMinutes, selectedVoiceProfileId);
      addToHistory({
        workflowId: wf.workflowId,
        contentType,
        voiceProfileId: selectedVoiceProfileId,
        createdAt: new Date().toISOString(),
        status: wf.status,
      });
      await runWorkflowApi(wf.workflowId);
      const updated = await fetchWorkflow(wf.workflowId);
      setWorkflow(updated);
      setPhase("running");
      startPolling(wf.workflowId);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function handleReset() {
    stopPolling();
    setUploadedFiles((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.url));
      return [];
    });
    setPhase("form");
    setWorkflow(null);
    setError("");
  }

  if (phase !== "form") {
    return (
      <div className="page">
        <title>새 글 쓰기 | Momently</title>
        <div className="page-header">
          <div className="flex-row" style={{ justifyContent: "space-between" }}>
            <div>
              <h2>글쓰기 진행 중</h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
                {workflow?.workflowId}
              </p>
            </div>
            <div className="flex-row">
              <StatusPill status={workflow?.status ?? "..."} />
              <button className="btn btn-secondary btn-sm" onClick={handleReset}>
                새 글
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <Activity size={14} /> 파이프라인
          </div>
          <PipelineSteps status={workflow?.status ?? "CREATED"} />
          <MetricsRow workflow={workflow} />
        </div>

        {phase === "done" && workflow?.status === "COMPLETED" && (
          <div className="card">
            <div className="card-title">
              <FileText size={14} /> 결과물
            </div>
            <ArtifactViewer workflowId={workflow.workflowId} tabs={ARTIFACT_TABS} />
          </div>
        )}

        {phase === "done" && workflow?.status === "FAILED" && (
          <div className="alert alert-error mt-12">파이프라인 실행에 실패했습니다.</div>
        )}

        {phase === "running" && (
          <div className="flex-row text-muted mt-12">
            <Loader2 className="spin" size={16} /> 자동으로 상태를 확인하고 있습니다...
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <title>새 글 쓰기 | Momently</title>
      <meta name="description" content="사진을 업로드하고 AI가 블로그 글을 자동으로 작성합니다." />
      <div className="page-header">
        <h2>새 글 쓰기</h2>
        <p>사진과 콘텐츠 유형을 선택하고 AI가 블로그 글을 작성합니다.</p>
      </div>

      {/* Photo section */}
      <div className="card">
        <div className="card-title"><Image size={14} /> 사진</div>
        <div className="mode-toggle">
          <button
            className={photoMode === "id" ? "active" : ""}
            onClick={() => setPhotoMode("id")}
          >
            프로젝트 ID
          </button>
          <button
            className={photoMode === "upload" ? "active" : ""}
            onClick={() => setPhotoMode("upload")}
          >
            파일 업로드
          </button>
        </div>

        {photoMode === "id" ? (
          <div className="field">
            <label>프로젝트 ID</label>
            <input
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="sample_images"
            />
          </div>
        ) : (
          <>
            <div
              className={`dropzone ${dragOver ? "drag-over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={28} color="#8aa898" />
              <p>사진을 드래그하거나 클릭해서 선택하세요</p>
              <span>JPG · PNG · WEBP · HEIC/HEIF 지원 (최대 {UPLOAD_MAX_FILES}장)</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.heic,.heif,image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => handleFiles(e.target.files)}
            />
            {uploadedFiles.length > 0 && (
              <div className="photo-thumbs">
                {uploadedFiles.map((item, i) => (
                  <div key={i} className="photo-thumb">
                    <img src={item.url} alt="" />
                    <button
                      className="photo-thumb-remove"
                      onClick={(e) => { e.stopPropagation(); removePhoto(i); }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-muted mt-8" style={{ fontSize: 12, lineHeight: 1.55 }}>
              서버에 올린 뒤 자동으로 새 프로젝트 ID가 만들어지며, 사진은 설정된 입력 폴더에만 저장됩니다.
              한 장당 최대 25MB, 전체 최대 약 120MB(스프링 설정 기준)까지입니다. 업로드 API는 로그인(JWT) 후에만
              호출됩니다.
            </p>
          </>
        )}
      </div>

      {/* Content type */}
      <div className="card">
        <div className="card-title"><PenLine size={14} /> 콘텐츠 유형</div>
        <div className="chip-group">
          {CONTENT_TYPES.map((ct) => (
            <button
              key={ct}
              className={`chip ${contentType === ct ? "active" : ""}`}
              onClick={() => setContentType(ct)}
            >
              {ct}
            </button>
          ))}
        </div>

        {contentType === "체험단" && (
          <div className="card" style={{ marginTop: 14, marginBottom: 0 }}>
            <div className="card-title"><Settings size={13} /> 체험단 규칙</div>
            <div className="field">
              <label>최소 사진 수</label>
              <input
                type="number"
                min={1}
                value={minPhotos}
                onChange={(e) => setMinPhotos(e.target.value)}
                style={{ width: 100 }}
              />
            </div>
            <label className="flex-row" style={{ gap: 8, marginBottom: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={includeSignage}
                onChange={(e) => setIncludeSignage(e.target.checked)}
              />
              <span style={{ fontSize: 13 }}>간판이 잘 보이는 사진 포함</span>
            </label>
            <label className="flex-row" style={{ gap: 8, marginBottom: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={mentionBrand}
                onChange={(e) => setMentionBrand(e.target.checked)}
              />
              <span style={{ fontSize: 13 }}>상호명 언급 필수</span>
            </label>
            {mentionBrand && (
              <div className="field">
                <label>상호명</label>
                <input
                  type="text"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="상호명을 입력하세요"
                />
              </div>
            )}
            <div className="field">
              <label>추가 규칙</label>
              <textarea
                value={extraRules}
                onChange={(e) => setExtraRules(e.target.value)}
                placeholder="추가 규칙을 자유롭게 입력하세요."
                rows={3}
              />
            </div>
          </div>
        )}
      </div>

      {/* Direction */}
      <div className="card">
        <div className="card-title"><Sparkles size={14} /> 작성 방향</div>
        <div className="field">
          <textarea
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            placeholder="어떤 내용이 들어갔으면 좋겠는지 자유롭게 입력해주세요."
            rows={3}
          />
        </div>
      </div>

      {/* Tone */}
      <div className="card">
        <div className="card-title"><Palette size={14} /> 말투 프로필</div>
        <div className="chip-group">
          {allVoiceProfiles.map((profile) => (
            <button
              key={profile.id}
              className={`chip ${selectedVoiceProfileId === profile.id ? "active" : ""}`}
              onClick={() => setSelectedVoiceProfileId(profile.id)}
            >
              {profile.name}
            </button>
          ))}
        </div>
        {activeVoiceProfile?.sample_preview && (
          <div className="tone-preview">&ldquo;{activeVoiceProfile.sample_preview}&rdquo;</div>
        )}
        {activeVoiceProfile?.style_prompt && (
          <div className="tone-preview">{activeVoiceProfile.style_prompt}</div>
        )}
      </div>

      {/* Advanced */}
      <div className="card">
        <button
          className="collapsible-header"
          style={{ borderTop: "none", paddingTop: 0 }}
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          <span className="flex-row" style={{ gap: 6 }}>
            <Settings size={14} /> 고급 옵션
          </span>
          {advancedOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {advancedOpen && (
          <div className="collapsible-body">
            <div className="field">
              <label>그룹화 전략</label>
              <select value={groupingStrategy} onChange={(e) => setGroupingStrategy(e.target.value)}>
                <option value="LOCATION_BASED">LOCATION_BASED</option>
                <option value="TIME_BASED">TIME_BASED</option>
                <option value="SCENE_BASED">SCENE_BASED</option>
              </select>
            </div>
            <div className="field">
              <label>Time Window (분)</label>
              <input
                type="number"
                min={1}
                value={timeWindowMinutes}
                onChange={(e) => setTimeWindowMinutes(e.target.value)}
                style={{ width: 120 }}
              />
            </div>
          </div>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <button
        className="btn btn-primary btn-lg"
        style={{ width: "100%", marginTop: 8 }}
        onClick={handleStart}
        disabled={
          busy
          || (photoMode === "id" && !projectId.trim())
          || (photoMode === "upload" && uploadedFiles.length === 0)
        }
      >
        {busy ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
        글쓰기 시작
      </button>
    </div>
  );
}

// ── Tone Page ─────────────────────────────────────────────────────────────────

function TonePage() {
  const [profiles, setProfiles] = useState(loadCachedVoiceProfiles);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [sampleTitle, setSampleTitle] = useState("");
  const [sampleContent, setSampleContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0];

  async function refreshProfiles() {
    setLoading(true);
    setError("");
    try {
      const next = await fetchVoiceProfilesApi();
      setProfiles(next);
      if (!selectedProfileId && next.length > 0) {
        setSelectedProfileId(next[0].id);
      }
    } catch (e) {
      setError(`voice_profile_agent 연결 실패: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshProfiles();
  }, []);

  async function handleSave() {
    if (!formName.trim()) return;
    setLoading(true);
    setError("");
    try {
      const profile = await createVoiceProfileApi(formName.trim(), formDesc.trim());
      const next = await fetchVoiceProfilesApi();
      setProfiles(next);
      setSelectedProfileId(profile.id);
      setFormName("");
      setFormDesc("");
      setShowForm(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddSample() {
    if (!selectedProfile || !sampleContent.trim()) return;
    setLoading(true);
    setError("");
    try {
      const updated = await addVoiceSampleApi(selectedProfile.id, sampleTitle, sampleContent);
      const next = profiles.map((profile) => profile.id === updated.id ? updated : profile);
      setProfiles(next);
      saveCachedVoiceProfiles(next);
      setSampleTitle("");
      setSampleContent("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyze() {
    if (!selectedProfile) return;
    setLoading(true);
    setError("");
    try {
      const updated = await analyzeVoiceProfileApi(selectedProfile.id);
      const next = profiles.map((profile) => profile.id === updated.id ? updated : profile);
      setProfiles(next);
      saveCachedVoiceProfiles(next);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <title>말투 설정 | Momently</title>
      <meta name="description" content="나만의 말투 프로필을 만들고 AI 글쓰기에 적용하세요." />
      <div className="page-header">
        <h2>말투 학습</h2>
        <p>
          평소에 쓴 글을 붙여 넣어 분석하면, AI가 <strong>방금 학습한 말투</strong>만 골라서 짧은 블로그 예시 글을 새로 써서 이 화면에 보여 줍니다 (가상 소재·내용입니다).
        </p>
      </div>

      <div className="card">
        <div className="card-title"><Palette size={14} /> 기본 말투 프리셋</div>
        <div className="tone-grid">
          {BUILTIN_VOICE_PROFILES.map((profile) => (
            <div key={profile.id} className="tone-card readonly">
              <div className="flex-row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                <h4>{profile.name}</h4>
                <span className="tone-badge">기본</span>
              </div>
              <div className="tone-desc">{profile.description}</div>
              <blockquote>{profile.sample_preview}</blockquote>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="flex-row" style={{ justifyContent: "space-between", marginBottom: profiles.length > 0 || showForm ? 14 : 0 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>
            <Sparkles size={14} /> 말투 프로필
          </div>
          <div className="flex-row">
            <button className="btn btn-secondary btn-sm" onClick={refreshProfiles} disabled={loading}>
              <RefreshCw size={13} /> 새로고침
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowForm((v) => !v)}
              disabled={loading}
            >
              {showForm ? <X size={13} /> : <Sparkles size={13} />}
              {showForm ? "취소" : "프로필 추가"}
            </button>
          </div>
        </div>

        {showForm && (
          <div className="tone-card" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>이름</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="예: 내 블로그 말투"
              />
            </div>
            <div className="field">
              <label>설명 (선택)</label>
              <input
                type="text"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="어떤 글에서 가져온 말투인지 남겨두세요"
              />
            </div>
            <div className="flex-row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>
                취소
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSave}
                disabled={!formName.trim() || loading}
              >
                {loading ? <Loader2 className="spin" size={13} /> : <Check size={13} />}
                저장
              </button>
            </div>
          </div>
        )}

        {profiles.length === 0 && !showForm ? (
          <div className="text-muted" style={{ padding: "12px 0" }}>
            아직 학습된 말투 프로필이 없습니다.
          </div>
        ) : (
          <div className="tone-grid">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                className={`tone-card tone-select ${selectedProfile?.id === profile.id ? "active" : ""}`}
                onClick={() => setSelectedProfileId(profile.id)}
              >
                <div className="flex-row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                  <h4>{profile.name}</h4>
                  <span className="tone-badge">{profile.sample_count ?? 0} samples</span>
                </div>
                {profile.description && <div className="tone-desc">{profile.description}</div>}
                {profile.sample_preview && <blockquote>{profile.sample_preview}</blockquote>}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedProfile && (
        <>
          <div className="card">
            <div className="card-title"><FileText size={14} /> 학습 데이터 추가</div>
            <div className="field">
              <label>샘플 제목</label>
              <input
                type="text"
                value={sampleTitle}
                onChange={(e) => setSampleTitle(e.target.value)}
                placeholder="예: 2026 제주 카페 후기"
              />
            </div>
            <div className="field">
              <label>평소에 쓴 글</label>
              <textarea
                value={sampleContent}
                onChange={(e) => setSampleContent(e.target.value)}
                placeholder="블로그, 일기, 리뷰, 캡션처럼 평소 말투가 드러나는 글을 붙여넣으세요. 분석 후 아래에 그 말투로 쓴 가상 예시 글이 나옵니다."
                rows={8}
              />
            </div>
            <div className="flex-row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={handleAnalyze} disabled={loading}>
                <RefreshCw size={13} /> 다시 분석
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleAddSample} disabled={!sampleContent.trim() || loading}>
                {loading ? <Loader2 className="spin" size={13} /> : <Sparkles size={13} />}
                학습하기
              </button>
            </div>
          </div>

          <div className="card tone-voice-sample-card">
            <div className="card-title"><Sparkles size={14} /> 학습된 말투 예시 글</div>
            {selectedProfile.example_paragraph ? (
              <>
                <p className="tone-voice-sample-lead">
                  아래 글은 샘플과 분석 결과를 바탕으로, <strong>가상의 소재</strong>만 잡아서 학습된 말투로 새로 생성한 미리보기입니다.
                </p>
                <blockquote className="tone-voice-sample-body">{selectedProfile.example_paragraph}</blockquote>
                <p className="tone-voice-sample-meta">
                  Ollama가 켜져 있어야 만들어집니다. 내용이 마음에 안 들면 샘플을 더 넣고 「다시 분석」을 눌러 보세요.
                </p>
              </>
            ) : (
              <div className="text-muted tone-voice-sample-empty">
                {(selectedProfile.sample_count ?? 0) > 0 ? (
                  <>
                    아직 예시 글이 없습니다. Ollama가 떠 있는지 확인한 뒤 「다시 분석」을 눌러 보세요. 환경 변수 <code>VOICE_EXAMPLE_AUTOGEN</code>
                    로 자동 생성을 끌 수 있습니다.
                  </>
                ) : (
                  <>샘플 글을 한 편 이상 추가한 뒤 「학습하기」로 저장하면, 이어서 예시 생성이 가능합니다.</>
                )}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title"><Palette size={14} /> 분석 요약</div>
            {selectedProfile.style_prompt ? (
              <>
                <div className="tone-preview">{selectedProfile.style_prompt}</div>
                <div className="tone-feature-grid">
                  <div><strong>샘플</strong><span>{selectedProfile.sample_count ?? 0}</span></div>
                  <div><strong>글자</strong><span>{selectedProfile.total_chars ?? 0}</span></div>
                  <div><strong>문장 길이</strong><span>{selectedProfile.features?.avg_sentence_length ?? "-"}</span></div>
                  <div><strong>태그</strong><span>{(selectedProfile.features?.tone_tags ?? []).join(", ") || "-"}</span></div>
                </div>
              </>
            ) : (
              <div className="text-muted" style={{ padding: "12px 0" }}>
                샘플을 추가하면 자주 쓰는 어미와 문장 리듬을 분석합니다.
              </div>
            )}
          </div>
        </>
      )}

      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}

// ── History Page ──────────────────────────────────────────────────────────────

/** 서버(UUID) 워크플로 id; 로컬 기록 깨짐 시 401/400 혼선을 줄이기 위해 검사한다 */
const HISTORY_WORKFLOW_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function HistoryPage() {
  const [history] = useState(loadHistory);
  const [selected, setSelected] = useState(null);
  const [workflow, setWorkflow] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState("");

  async function openItem(item) {
    setSelected(item);
    setWorkflow(null);
    setDetailError("");
    setLoadingDetail(true);
    try {
      const wid = typeof item.workflowId === "string" ? item.workflowId.trim() : "";
      if (!HISTORY_WORKFLOW_ID_RE.test(wid)) {
        throw new Error("저장된 작업 ID가 올바르지 않습니다. 브라우저 작업 기록을 비우거나 새 작업부터 다시 시도해 주세요.");
      }
      const data = await fetchWorkflow(wid);
      setWorkflow(data);
    } catch (e) {
      setDetailError(e.message);
    } finally {
      setLoadingDetail(false);
    }
  }

  if (selected) {
    return (
      <div className="page">
        <div className="flex-row" style={{ marginBottom: 20 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>
            ← 목록
          </button>
        </div>

        <div className="page-header">
          <div className="flex-row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div>
              <h2 style={{ fontSize: 17, fontFamily: "ui-monospace, monospace", fontWeight: 700 }}>
                {selected.workflowId}
              </h2>
              <p>
                {selected.contentType} &middot; {formatDate(selected.createdAt)}
              </p>
            </div>
            {workflow && <StatusPill status={workflow.status} />}
          </div>
        </div>

        {loadingDetail && (
          <div className="flex-row text-muted">
            <Loader2 className="spin" size={16} /> 불러오는 중...
          </div>
        )}

        {detailError && <div className="alert alert-error">{detailError}</div>}

        {workflow && (
          <>
            <div className="card">
              <div className="card-title"><Activity size={14} /> 파이프라인</div>
              <PipelineSteps status={workflow.status} />
              <MetricsRow workflow={workflow} />
            </div>

            {["COMPLETED"].includes(workflow.status) && (
              <div className="card">
                <div className="card-title"><FileText size={14} /> 결과물</div>
                <ArtifactViewer
                  workflowId={workflow.workflowId}
                  tabs={[
                    ["review", "최종 블로그"],
                    ["style", "문체 적용"],
                    ["draft", "초안"],
                  ]}
                />
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <title>작업 기록 | Momently</title>
      <meta name="description" content="이전에 생성한 블로그 글 작업 기록을 확인합니다." />
      <div className="page-header">
        <h2>작업 기록</h2>
        <p>이전에 실행한 글쓰기 작업 목록입니다.</p>
      </div>

      {history.length === 0 ? (
        <div className="history-empty">
          아직 작업 기록이 없습니다. 새 글 쓰기 페이지에서 시작해보세요.
        </div>
      ) : (
        <div className="history-list">
          {history.map((item) => (
            <button
              key={item.workflowId}
              className="history-item"
              onClick={() => openItem(item)}
            >
              <div className="history-item-icon">
                <FileText size={18} />
              </div>
              <div className="history-item-info">
                <div className="history-item-id">{item.workflowId}</div>
                <div className="history-item-meta">
                  {item.contentType} &middot; {formatDate(item.createdAt)}
                </div>
              </div>
              <StatusPill status={item.status ?? "UNKNOWN"} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Monitor Page ──────────────────────────────────────────────────────────────

function MonitorPage() {
  const [projectId, setProjectId] = useState("sample_images");
  const [groupingStrategy, setGroupingStrategy] = useState("LOCATION_BASED");
  const [timeWindowMinutes, setTimeWindowMinutes] = useState(90);
  const [workflow, setWorkflow] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("warn");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [artifactType, setArtifactType] = useState("review");
  const [artifact, setArtifact] = useState(null);

  const workflowId = workflow?.workflowId;
  const status = workflow?.status ?? "IDLE";

  useEffect(() => {
    if (!autoRefresh || !workflowId || ["COMPLETED", "FAILED"].includes(status)) {
      return;
    }
    const timer = setInterval(() => doRefresh(false), 2000);
    return () => clearInterval(timer);
  }, [autoRefresh, workflowId, status]);

  function msg(text, type = "warn") {
    setMessage(text);
    setMessageType(type);
  }

  async function doCreate() {
    setBusy(true);
    msg("");
    setArtifact(null);
    try {
      const data = await createWorkflowApi(projectId, groupingStrategy, timeWindowMinutes);
      setWorkflow(data);
      msg("워크플로가 생성됐습니다.", "success");
    } catch (e) {
      msg(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function doRun() {
    if (!workflowId) { await doCreate(); return; }
    setBusy(true);
    msg("");
    try {
      await runWorkflowApi(workflowId);
      msg("실행을 시작했습니다.", "success");
      await doRefresh(false);
    } catch (e) {
      msg(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function doRefresh(showMsg = true) {
    if (!workflowId) return;
    try {
      const data = await fetchWorkflow(workflowId);
      setWorkflow(data);
      if (showMsg) msg("상태를 갱신했습니다.", "success");
    } catch (e) {
      if (showMsg) msg(e.message, "error");
    }
  }

  async function doLoadArtifact(type = artifactType) {
    if (!workflowId) return;
    setBusy(true);
    msg("");
    setArtifactType(type);
    try {
      const data = await fetchArtifact(workflowId, type);
      setArtifact(data);
    } catch (e) {
      setArtifact(null);
      msg(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  const markdown = extractMarkdown(artifact);
  const raw = formatArtifactText(artifact);

  return (
    <div className="page-wide">
      <title>파이프라인 모니터 | Momently</title>
      <meta name="description" content="워크플로를 직접 생성하고 파이프라인 실행 상태를 모니터링합니다." />
      <div className="page-header">
        <h2>파이프라인 모니터</h2>
        <p>워크플로를 직접 생성하고 실행 상태를 확인합니다.</p>
      </div>

      <div className="card">
        <div className="card-title"><Settings size={14} /> 실행 설정</div>
        <div className="monitor-controls">
          <div className="field" style={{ minWidth: 200 }}>
            <label>Project ID</label>
            <input type="text" value={projectId} onChange={(e) => setProjectId(e.target.value)} />
          </div>
          <div className="field" style={{ minWidth: 180 }}>
            <label>그룹화 전략</label>
            <select value={groupingStrategy} onChange={(e) => setGroupingStrategy(e.target.value)}>
              <option value="LOCATION_BASED">LOCATION_BASED</option>
              <option value="TIME_BASED">TIME_BASED</option>
              <option value="SCENE_BASED">SCENE_BASED</option>
            </select>
          </div>
          <div className="field" style={{ width: 120 }}>
            <label>Time Window</label>
            <input
              type="number"
              min={1}
              value={timeWindowMinutes}
              onChange={(e) => setTimeWindowMinutes(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-row" style={{ flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={doCreate} disabled={busy}>
            <Sparkles size={15} /> Create
          </button>
          <button className="btn btn-primary" onClick={doRun} disabled={busy}>
            {busy ? <Loader2 className="spin" size={15} /> : <Play size={15} />} Run
          </button>
          <button className="btn btn-ghost" onClick={() => doRefresh()} disabled={!workflowId || busy}>
            <RefreshCw size={15} /> Refresh
          </button>
          <label className="flex-row" style={{ cursor: "pointer", fontSize: 13, gap: 6, color: "var(--text-muted)" }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto refresh
          </label>
          {workflow && <StatusPill status={status} />}
        </div>

        {message && (
          <div className={`alert alert-${messageType} mt-8`}>{message}</div>
        )}
      </div>

      {workflow && (
        <div className="card">
          <div className="card-title"><Activity size={14} /> 파이프라인</div>
          <div className="text-muted" style={{ marginBottom: 12, fontSize: 12 }}>
            ID: {workflowId}
          </div>
          <PipelineSteps status={status} />
          <MetricsRow workflow={workflow} />
        </div>
      )}

      {workflow && (
        <div className="card">
          <div className="card-title"><FileText size={14} /> Artifacts</div>
          <div className="tab-row">
            {ALL_ARTIFACT_TABS.map(([key, label]) => (
              <button
                key={key}
                className={`tab-btn ${artifactType === key ? "active" : ""}`}
                onClick={() => doLoadArtifact(key)}
                disabled={!workflowId || busy}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="artifact-body">
            <div className="artifact-pane">
              <div className="artifact-pane-header"><Image size={13} /> Preview</div>
              <div className="artifact-pane markdown-wrap">
                <MarkdownPreview markdown={markdown} />
              </div>
            </div>
            <div className="artifact-pane">
              <div className="artifact-pane-header"><FileText size={13} /> Raw</div>
              <pre>{raw || "아티팩트를 선택하면 내용이 표시됩니다."}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── App Shell ─────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { path: "/", label: "새 글 쓰기", icon: PenLine, end: true },
  { path: "/tone", label: "말투 설정", icon: Palette },
  { path: "/history", label: "작업 기록", icon: Clock },
  { path: "/monitor", label: "파이프라인 모니터", icon: Activity },
];

function Layout() {
  const navigate = useNavigate();

  function logout() {
    clearOrchestratorSession();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="sidebar-logo">
          <Sparkles size={20} color="#fff" />
          <div>
            <h1>Momently</h1>
            <span>AI 블로그 작성 도우미</span>
          </div>
        </div>
        <div className="sidebar-nav">
          {NAV_ITEMS.map(({ path, label, icon: Icon, end }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              <Icon size={17} />
              <span>{label}</span>
            </NavLink>
          ))}
          <button type="button" className="nav-item nav-logout" onClick={logout}>
            <LogOut size={17} />
            <span>로그아웃</span>
          </button>
        </div>
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <WritePage /> },
      { path: "tone", element: <TonePage /> },
      { path: "history", element: <HistoryPage /> },
      { path: "monitor", element: <MonitorPage /> },
    ],
  },
]);

createRoot(document.getElementById("root")).render(<RouterProvider router={router} />);
