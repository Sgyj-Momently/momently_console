import React, { useCallback, useEffect, useRef, useState } from "react";
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
  Copy,
  Download,
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
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import "./styles.css";
import { apiOriginFromEnv, voiceOriginFromEnv } from "./apiOrigin.js";
import { orchestratorNeedsBearer, shouldClearSessionOnUnauthorized } from "./orchestratorAuth.js";
import VoiceSampleEditor from "./VoiceSampleEditor.jsx";

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

function clearExpiredSessionFromUnauthorized(headers) {
  if (!shouldClearSessionOnUnauthorized(headers)) return false;
  clearOrchestratorSession();
  redirectToLoginIfNeeded();
  return true;
}

function parseErrorDetail(text) {
  if (!text) return "";
  try {
    const parsed = JSON.parse(text);
    if (parsed?.error && typeof parsed.error === "string") return parsed.error;
    if (parsed?.message && typeof parsed.message === "string") return parsed.message;
    if (parsed?.detail && typeof parsed.detail === "string") return parsed.detail;
  } catch {
    //
  }
  return text;
}

function httpErrorMessage(response, detail) {
  const suffix = detail ? `: ${detail}` : "";
  if (response.status === 401) {
    return `로그인이 필요하거나 세션이 만료되었습니다. 다시 로그인해 주세요.${suffix}`;
  }
  if (response.status === 403) {
    return `접근 권한이 없습니다. 로그인 계정과 게이트 설정을 확인해 주세요.${suffix}`;
  }
  if (response.status === 404) {
    return `요청한 리소스를 찾을 수 없습니다.${suffix}`;
  }
  if (response.status >= 500) {
    return `서버 처리 중 오류가 발생했습니다.${suffix}`;
  }
  return `${response.status} ${response.statusText}${suffix}`;
}

/** 서버 업로드 API와 동일한 확장자(대소문자 무시). */
const UPLOAD_MEDIA_EXT_RE = /\.(jpe?g|png|heic|heif|webp|mp4|mov|m4v)$/i;
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

function clearHistory() {
  try {
    localStorage.removeItem("momently_history");
  } catch {
    //
  }
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

  let response;
  try {
    response = await fetch(url, {
      ...fetchOptions,
      ...(headers !== undefined ? { headers } : {}),
    });
  } catch (err) {
    console.error("[Momently] API 요청 실패:", url, err);
    throw new Error("서버에 연결하지 못했습니다. 게이트와 오케스트레이터 상태를 확인해 주세요.");
  }

  if (response.status === 401 && needsOrcAuth && requestCarriesOrcAuthorization(headers)) {
    clearExpiredSessionFromUnauthorized(headers);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(httpErrorMessage(response, parseErrorDetail(body)));
  }
  if (!expectJson || response.status === 202 || response.status === 204) return null;
  const data = await response.json();
  // JSON 이 null 이거나 본문이 비어 있을 때 data.content 접근으로 TypeError 나는 것을 막는다.
  return data?.content ?? data;
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
    clearExpiredSessionFromUnauthorized(authHeaders);
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

async function uploadMediaApi(files) {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }
  return uploadMultipartJson(orchPath("/api/v1/uploads/media"), form);
}

async function createWorkflowApi(
  projectId,
  groupingStrategy,
  timeWindowMinutes,
  voiceProfileId,
  contentType,
  writingInstructions
) {
  return apiRequest(orchPath("/api/v1/workflows"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      groupingStrategy,
      timeWindowMinutes: Number(timeWindowMinutes),
      voiceProfileId: voiceProfileId === "기본" ? null : voiceProfileId,
      contentType: contentType || null,
      writingInstructions: writingInstructions || null,
    }),
  });
}

async function runWorkflowApi(workflowId) {
  return apiRequest(orchPath(`/api/v1/workflows/${workflowId}/run`), {
    method: "POST",
    expectJson: false,
  });
}

async function retryWorkflowApi(workflowId) {
  return apiRequest(orchPath(`/api/v1/workflows/${workflowId}/retry`), {
    method: "POST",
    expectJson: false,
  });
}

async function fetchWorkflow(workflowId) {
  return apiRequest(orchPath(`/api/v1/workflows/${workflowId}`));
}

function workflowFromEventPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  return {
    workflowId: payload.workflowId,
    projectId: payload.projectId,
    contentType: payload.contentType,
    writingInstructions: payload.writingInstructions,
    status: payload.status,
    photoCount: payload.photoCount,
    privacyExcludedCount: payload.privacyExcludedCount,
    averageQualityScore: payload.averageQualityScore,
    groupCount: payload.groupCount,
    heroPhotoCount: payload.heroPhotoCount,
    outlineSectionCount: payload.outlineSectionCount,
    draftSectionCount: payload.draftSectionCount,
    styledWordCount: payload.styledWordCount,
    reviewIssueCount: payload.reviewIssueCount,
    lastFailedStep: payload.lastFailedStep,
    lastErrorMessage: payload.lastErrorMessage,
  };
}

function startWorkflowEventStream(workflowId, onWorkflow, onError) {
  const controller = new AbortController();
  const headers = orchestratorAuthHeaders({ Accept: "text/event-stream" });

  function handleBlock(block) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!data) return;
    const workflow = workflowFromEventPayload(JSON.parse(data));
    if (workflow) onWorkflow(workflow);
  }

  (async () => {
    const response = await fetch(orchPath(`/api/v1/workflows/${workflowId}/events`), {
      headers,
      signal: controller.signal,
    });
    if (response.status === 401 && requestCarriesOrcAuthorization(headers)) {
      clearExpiredSessionFromUnauthorized(headers);
    }
    if (!response.ok) {
      const body = await response.text();
      throw new Error(httpErrorMessage(response, parseErrorDetail(body)));
    }
    if (!response.body) {
      throw new Error("SSE 스트림을 열 수 없습니다.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
      blocks.forEach(handleBlock);
    }
    if (buffer.trim()) handleBlock(buffer);
    if (!controller.signal.aborted) {
      throw new Error("SSE 스트림이 종료되었습니다.");
    }
  })().catch((error) => {
    if (!controller.signal.aborted) onError(error);
  });

  return () => controller.abort();
}

async function fetchWorkflows() {
  const data = await apiRequest(orchPath("/api/v1/workflows"));
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.workflows)) return data.workflows;
  if (Array.isArray(data?._embedded?.workflows)) return data._embedded.workflows;
  if (data && typeof data === "object") {
    const embedded = data._embedded;
    if (embedded && typeof embedded === "object") {
      const firstArray = Object.values(embedded).find((v) => Array.isArray(v));
      if (firstArray) return firstArray;
    }
  }
  return [];
}

async function deleteWorkflowHistoryApi() {
  return apiRequest(orchPath("/api/v1/workflows"), {
    method: "DELETE",
    expectJson: false,
  });
}

async function fetchArtifact(workflowId, type) {
  return apiRequest(orchPath(`/api/v1/workflows/${workflowId}/artifacts/${type}`));
}

async function fetchLatestArtifactEdit(workflowId, type) {
  const url = orchPath(`/api/v1/workflows/${workflowId}/artifacts/${type}/edits/latest`);
  const headers = orchestratorAuthHeaders();
  const response = await fetch(url, { headers });
  if (response.status === 401 && requestCarriesOrcAuthorization(headers)) {
    clearExpiredSessionFromUnauthorized(headers);
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text();
    throw new Error(httpErrorMessage(response, parseErrorDetail(body)));
  }
  const data = await response.json();
  return data?.content ?? data;
}

async function saveArtifactEditApi(workflowId, type, markdown) {
  return apiRequest(orchPath(`/api/v1/workflows/${workflowId}/artifacts/${type}/edits`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ markdown }),
  });
}

async function fetchWorkflowFileBlob(workflowId, fileName) {
  const headers = orchestratorAuthHeaders();
  const response = await fetch(orchPath(`/api/v1/workflows/${workflowId}/files/${encodeURIComponent(fileName)}`), {
    headers,
  });
  if (response.status === 401 && getAccessToken()) {
    clearExpiredSessionFromUnauthorized(headers);
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.blob();
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

/** 서버가 보내는 워크플로 상태 → 사용자에게 보여 줄 현재 단계 설명 */
const PIPELINE_LIVE_CAPTIONS = {
  CREATED: "워크플로가 준비됐습니다. 실행을 시작하면 파이프라인이 돌아갑니다.",
  PHOTO_INFO_EXTRACTING: "사진·동영상을 읽고, EXIF·썸네일·LLM 비전으로 장면마다 요약하는 중입니다.",
  PRIVACY_REVIEWING: "민감 정보(얼굴·번호판 등)를 검사하고 안전한 사진만 남기는 중입니다.",
  QUALITY_SCORING: "품질 점수를 매기고, 이후 단계에 넘길 사진을 고르는 중입니다.",
  PHOTO_GROUPING: "시간·장소 기준으로 사진 묶음(그룹)을 만드는 중입니다.",
  HERO_PHOTO_SELECTING: "각 그룹에서 대표 사진을 고르는 중입니다.",
  OUTLINE_CREATING: "글의 목차(섹션 구조)를 짜는 중입니다.",
  DRAFT_CREATING: "목차에 맞춰 초안 문단을 쓰는 중입니다.",
  STYLE_APPLYING: "선택한 말투로 문장을 다듬는 중입니다.",
  REVIEWING: "검수 에이전트가 톤·사실·형식을 점검하는 중입니다.",
};

function pipelineLiveCaption(status) {
  if (PIPELINE_LIVE_CAPTIONS[status]) return PIPELINE_LIVE_CAPTIONS[status];
  const i = currentStepIndex(status);
  if (i >= 0 && PIPELINE_STEPS[i]) {
    return `「${PIPELINE_STEPS[i][1]}」 단계까지 완료됐습니다. 다음 단계를 기다리는 중입니다.`;
  }
  return "파이프라인 상태를 불러오는 중입니다.";
}

function pipelineProgressPercent(status) {
  if (status === "COMPLETED") return 100;
  if (status === "FAILED") return 100;
  const index = currentStepIndex(status);
  if (index < 0) return 3;
  const active = IN_PROGRESS_MAP[status] !== undefined;
  const completedUnits = active ? index : index + 1;
  return Math.max(3, Math.min(99, Math.round((completedUnits / (PIPELINE_STEPS.length - 1)) * 100)));
}

/** 줄 단위 LCS 기반 diff (문체 재적용 후 어디가 바뀌었는지 표시용) */
function diffLinesByLcs(oldText, newText) {
  const a = oldText === "" ? [] : oldText.split("\n");
  const b = newText === "" ? [] : newText.split("\n");
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const segments = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      segments.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      segments.push({ type: "remove", text: a[i] });
      i++;
    } else {
      segments.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < m) {
    segments.push({ type: "remove", text: a[i] });
    i++;
  }
  while (j < n) {
    segments.push({ type: "add", text: b[j] });
    j++;
  }
  return segments;
}

function PipelineLiveRail({ status }) {
  if (status === "COMPLETED" || status === "FAILED") return null;
  const percent = pipelineProgressPercent(status);
  return (
    <div className="pipeline-live-rail" aria-live="polite">
      <div className="pipeline-progress-head">
        <strong>{workflowStatusLabel(status)}</strong>
        <span>{percent}%</span>
      </div>
      <div className="pipeline-progress-track" aria-hidden>
        <div className="pipeline-progress-bar" style={{ width: `${percent}%` }} />
      </div>
      <p className="pipeline-live-caption">{pipelineLiveCaption(status)}</p>
    </div>
  );
}

const RESTYLE_HINT_ROTATION_MS = 2800;
const RESTYLE_STAGE_HINTS = [
  "스타일 에이전트가 초안 마크다운을 읽고, 말투 규칙에 맞게 문장을 바꿉니다.",
  "검수 에이전트가 톤·반복·어색한 표현을 다시 점검합니다.",
  "LLM 호출이므로 수 분 걸릴 수 있습니다. 아래 미리보기에서 진행 상황을 표시합니다.",
];

function RestyleScanningPreview({ markdown, workflowId, active }) {
  return (
    <div className={`restyle-scan-wrap ${active ? "restyle-scan-wrap--active" : ""}`}>
      <div className="restyle-scan-shimmer" aria-hidden />
      <div className="restyle-scan-content">
        <MarkdownPreview markdown={markdown || " "} workflowId={workflowId} />
      </div>
    </div>
  );
}

function RestyleCrossfadePreview({ workflowId, fromMd, toMd, durationMs, onComplete }) {
  const [progress, setProgress] = useState(0);
  const doneRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    doneRef.current = false;
    const start = performance.now();
    let frame;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / durationMs);
      setProgress(p);
      if (p < 1) {
        frame = requestAnimationFrame(tick);
      } else if (!doneRef.current) {
        doneRef.current = true;
        onCompleteRef.current?.();
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [fromMd, toMd, durationMs]);

  const topOp = 1 - progress;
  const botOp = progress;
  return (
    <div className="restyle-crossfade">
      <div className="restyle-crossfade-layer" style={{ gridArea: "1 / 1", opacity: topOp }}>
        <MarkdownPreview markdown={fromMd || " "} workflowId={workflowId} />
      </div>
      <div
        className="restyle-crossfade-layer restyle-crossfade-layer--new"
        style={{ gridArea: "1 / 1", opacity: botOp }}
      >
        <MarkdownPreview markdown={toMd || " "} workflowId={workflowId} />
      </div>
    </div>
  );
}

function RestyleDiffPanel({ oldText, newText }) {
  const [open, setOpen] = useState(true);
  const segments = diffLinesByLcs(oldText ?? "", newText ?? "");
  const addN = segments.filter((s) => s.type === "add").length;
  const delN = segments.filter((s) => s.type === "remove").length;
  if (addN === 0 && delN === 0) {
    return (
      <div className="restyle-diff-panel restyle-diff-panel--empty">
        줄 단위로는 동일하게 보입니다. (표현·띄어쓰기 등 미세한 차이는 있을 수 있습니다.)
      </div>
    );
  }
  return (
    <div className="restyle-diff-panel">
      <button type="button" className="restyle-diff-toggle" onClick={() => setOpen(!open)}>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        변경 줄 보기
        <span className="restyle-diff-badge">
          +{addN} / −{delN}
        </span>
      </button>
      {open && (
        <div className="restyle-diff-lines">
          {segments.map((seg, idx) => {
            if (seg.type === "same") {
              return (
                <pre key={`s-${idx}-${seg.text?.slice(0, 12)}`} className="restyle-diff-line restyle-diff-line--same">
                  {seg.text}
                </pre>
              );
            }
            if (seg.type === "remove") {
              return (
                <pre key={`r-${idx}`} className="restyle-diff-line restyle-diff-line--remove">
                  − {seg.text}
                </pre>
              );
            }
            return (
              <pre key={`a-${idx}`} className="restyle-diff-line restyle-diff-line--add">
                + {seg.text}
              </pre>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function workflowStatusLabel(status) {
  if (!status || status === "IDLE") return "대기";
  if (status === "COMPLETED") return "완료";
  if (status === "FAILED") return "실패";
  if (status === "CREATED") return "준비됨";
  const activeIndex = IN_PROGRESS_MAP[status];
  if (activeIndex !== undefined) return `${PIPELINE_STEPS[activeIndex]?.[1] ?? "처리"} 중`;
  const exact = PIPELINE_STEPS.find((step) => step[0] === status);
  return exact ? `${exact[1]} 완료` : status;
}

function workflowTitle(workflow) {
  if (!workflow) return "글쓰기 작업";
  return workflow.projectId || workflow.contentType || "글쓰기 작업";
}

function mediaSummary(files) {
  const images = files.filter((item) => item.kind === "image").length;
  const videos = files.filter((item) => item.kind === "video").length;
  const totalBytes = files.reduce((sum, item) => sum + (item.file?.size || 0), 0);
  return { images, videos, totalBytes };
}

function downloadTextFile(fileName, text) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function editedArtifactKey(workflowId, tab) {
  return `momently_edited_artifact_${workflowId}_${tab}`;
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

function MarkdownImage({ workflowId, alt, fileName }) {
  const [src, setSrc] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!workflowId || !fileName) return undefined;
    let cancelled = false;
    let objectUrl = "";
    setSrc("");
    setError("");
    fetchWorkflowFileBlob(workflowId, fileName)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [workflowId, fileName]);

  if (error) {
    return <span className="image-line image-error">이미지를 불러오지 못했습니다: {fileName}</span>;
  }
  if (!src) {
    return <span className="image-line">이미지 불러오는 중: {fileName}</span>;
  }
  return <img className="markdown-image" src={src} alt={alt || fileName} />;
}

function markdownImage(line) {
  const match = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
  if (!match) return null;
  const rawTarget = match[2].trim();
  if (/^https?:\/\//i.test(rawTarget) || rawTarget.startsWith("data:")) {
    return { alt: match[1], src: rawTarget, fileName: "" };
  }
  const cleanTarget = rawTarget.replace(/^file:/i, "").split("#")[0].split("?")[0];
  const fileName = cleanTarget.split(/[\\/]/).filter(Boolean).pop() || cleanTarget;
  return { alt: match[1], fileName };
}

function MarkdownPreview({ markdown, workflowId }) {
  if (!markdown) {
    return <div className="text-muted" style={{ padding: "20px 0" }}>미리보기가 없습니다.</div>;
  }
  return (
    <div className="markdown">
      {markdown.split("\n").map((line, i) => {
        if (line.startsWith("# ")) return <h2 key={i}>{line.slice(2)}</h2>;
        if (line.startsWith("## ")) return <h3 key={i}>{line.slice(3)}</h3>;
        if (line.startsWith("- ")) return <p className="bullet" key={i}>{line}</p>;
        if (line.startsWith("![")) {
          const image = markdownImage(line);
          if (!image) return <p className="image-line" key={i}>{line}</p>;
          if (image.src) return <img className="markdown-image" key={i} src={image.src} alt={image.alt} />;
          return (
            <p className="image-line" key={i}>
              <MarkdownImage workflowId={workflowId} alt={image.alt} fileName={image.fileName} />
            </p>
          );
        }
        return line ? <p key={i}>{line}</p> : <br key={i} />;
      })}
    </div>
  );
}

function PipelineSteps({ status, showActivityRail = false }) {
  const doneIndex = currentStepIndex(status);
  const rail =
    showActivityRail && status !== "COMPLETED" && status !== "FAILED" ? (
      <PipelineLiveRail status={status} />
    ) : null;
  return (
    <div className="pipeline-steps-wrapper">
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
      {rail}
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
  const [showRaw, setShowRaw] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedMarkdown, setEditedMarkdown] = useState("");
  const [serverMarkdown, setServerMarkdown] = useState("");
  const [serverEditPath, setServerEditPath] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  async function load(type) {
    setActiveTab(type);
    setLoading(true);
    setError("");
    try {
      const data = await fetchArtifact(workflowId, type);
      const latestEdit = await fetchLatestArtifactEdit(workflowId, type);
      setArtifact(data);
      setServerMarkdown(latestEdit?.text || "");
      setServerEditPath(latestEdit?.path || "");
      setShowRaw(false);
      setEditMode(false);
      setActionMsg("");
    } catch (e) {
      setArtifact(null);
      setServerMarkdown("");
      setServerEditPath("");
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (workflowId) load(tabs[0]?.[0] ?? "blog");
  }, [workflowId]);

  const originalMarkdown = extractMarkdown(artifact);
  const markdown = serverMarkdown || originalMarkdown;
  const raw = formatArtifactText(artifact);
  const visibleMarkdown = editMode ? editedMarkdown : markdown;
  const hasLocalEdit = editedMarkdown !== markdown;
  const hasServerEdit = Boolean(serverMarkdown);

  useEffect(() => {
    const key = editedArtifactKey(workflowId, activeTab);
    let saved = "";
    try {
      saved = localStorage.getItem(key) || "";
    } catch {
      //
    }
    setEditedMarkdown(saved || markdown);
  }, [workflowId, activeTab, markdown]);

  useEffect(() => {
    if (!workflowId || !activeTab || !editedMarkdown || editedMarkdown === markdown) return;
    try {
      localStorage.setItem(editedArtifactKey(workflowId, activeTab), editedMarkdown);
    } catch {
      //
    }
  }, [workflowId, activeTab, editedMarkdown, markdown]);

  async function copyMarkdown() {
    if (!visibleMarkdown.trim()) return;
    try {
      await navigator.clipboard.writeText(visibleMarkdown);
      setActionMsg("본문을 클립보드에 복사했습니다.");
    } catch {
      setActionMsg("브라우저 권한 때문에 복사하지 못했습니다. 수정 모드에서 직접 선택해 복사해 주세요.");
    }
  }

  function downloadMarkdown() {
    if (!visibleMarkdown.trim()) return;
    downloadTextFile(`momently-${activeTab || "post"}.md`, visibleMarkdown);
    setActionMsg("마크다운 파일을 저장했습니다.");
  }

  async function saveEditedMarkdown() {
    if (!editedMarkdown.trim()) return;
    setSavingEdit(true);
    setActionMsg("");
    try {
      const saved = await saveArtifactEditApi(workflowId, activeTab, editedMarkdown);
      setServerMarkdown(saved?.text || editedMarkdown);
      setServerEditPath(saved?.path || "");
      try {
        localStorage.removeItem(editedArtifactKey(workflowId, activeTab));
      } catch {
        //
      }
      setEditMode(false);
      setActionMsg("수정본을 서버에 저장했습니다.");
    } catch (e) {
      setActionMsg(e.message || "수정본 저장에 실패했습니다.");
    } finally {
      setSavingEdit(false);
    }
  }

  function discardLocalEdit() {
    try {
      localStorage.removeItem(editedArtifactKey(workflowId, activeTab));
    } catch {
      //
    }
    setEditedMarkdown(markdown);
    setActionMsg("화면에 저장된 수정본을 원본으로 되돌렸습니다.");
  }

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
      <div className="artifact-reader">
        <div className="artifact-toolbar">
          <div>
            <strong>{tabs.find(([key]) => key === activeTab)?.[1] ?? "결과물"}</strong>
            <span>
              {editMode
                ? "수정 내용은 브라우저에 임시 저장되고, 서버 저장을 누르면 다른 기기에서도 이어볼 수 있습니다."
                : hasLocalEdit
                  ? "브라우저에 임시 저장된 수정본을 보고 있습니다."
                  : hasServerEdit
                    ? "서버에 저장된 최신 수정본을 보고 있습니다."
                    : "완성 글을 바로 확인하고 복사할 수 있습니다."}
            </span>
          </div>
          <div className="artifact-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditMode((value) => !value)} disabled={loading || !markdown}>
              <PenLine size={13} /> {editMode ? "미리보기" : "수정"}
            </button>
            {editMode && (
              <button type="button" className="btn btn-primary btn-sm" onClick={saveEditedMarkdown} disabled={loading || savingEdit || !editedMarkdown.trim() || !hasLocalEdit}>
                {savingEdit ? <Loader2 className="spin" size={13} /> : <Download size={13} />}
                서버 저장
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={copyMarkdown} disabled={loading || !visibleMarkdown.trim()}>
              <Copy size={13} /> 복사
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={downloadMarkdown} disabled={loading || !visibleMarkdown.trim()}>
              <Download size={13} /> 저장
            </button>
            {hasLocalEdit && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={discardLocalEdit} disabled={loading}>
                <RefreshCw size={13} /> 원본
              </button>
            )}
          </div>
        </div>
        {hasServerEdit && !hasLocalEdit && (
          <div className="artifact-edit-note mt-8">서버 저장본: {serverEditPath || "latest"}</div>
        )}
        {hasLocalEdit && <div className="alert alert-warn mt-8">아직 서버에 저장하지 않은 임시 수정본이 표시되고 있습니다.</div>}
        {actionMsg && <div className="alert alert-success mt-8">{actionMsg}</div>}
        <div className="artifact-pane artifact-pane-main">
          <div className="artifact-pane-header">
            <Image size={13} /> {editMode ? "본문 수정" : "글 미리보기"}
          </div>
          <div className="artifact-pane markdown-wrap">
            {loading ? (
              <div className="flex-row text-muted" style={{ padding: "20px 0" }}>
                <Loader2 className="spin" size={16} /> 불러오는 중...
              </div>
            ) : editMode ? (
              <textarea
                className="artifact-editor"
                value={editedMarkdown}
                onChange={(event) => setEditedMarkdown(event.target.value)}
                spellCheck={false}
              />
            ) : (
              <MarkdownPreview markdown={visibleMarkdown} workflowId={workflowId} />
            )}
          </div>
        </div>
        <button
          type="button"
          className="raw-toggle"
          onClick={() => setShowRaw((value) => !value)}
        >
          {showRaw ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          상세 데이터 보기
        </button>
        {showRaw && (
          <div className="artifact-pane artifact-pane-raw">
            <div className="artifact-pane-header">
              <FileText size={13} /> Raw JSON
            </div>
            <pre>{loading ? "..." : raw || "아티팩트를 선택하면 내용이 표시됩니다."}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

async function restyleWorkflowApi(workflowId, voiceProfileId, extraInstructions) {
  // 202 반환 — LLM이 백그라운드에서 처리하므로 expectJson false
  await apiRequest(orchPath(`/api/v1/workflows/${workflowId}/restyle`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      voiceProfileId: voiceProfileId === "기본" ? null : voiceProfileId || null,
      extraInstructions: extraInstructions || null,
    }),
    expectJson: false,
  });
}

function RestylePanel({ workflowId, onRestyleComplete }) {
  const [voiceProfiles, setVoiceProfiles] = useState(loadCachedVoiceProfiles);
  const [selectedVoiceProfileId, setSelectedVoiceProfileId] = useState("기본");
  const [extraInstructions, setExtraInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState("");
  const [appliedMeta, setAppliedMeta] = useState("");
  const pollRef = useRef(null);
  const hintTimerRef = useRef(null);
  const [pollTick, setPollTick] = useState(0);
  const [hintIndex, setHintIndex] = useState(0);
  /** idle | polling | fade | summary */
  const [visualPhase, setVisualPhase] = useState("idle");
  const [baselineMd, setBaselineMd] = useState("");
  const [fadeFrom, setFadeFrom] = useState("");
  const [fadeTo, setFadeTo] = useState("");

  const allVoiceProfiles = [
    { id: "기본", name: "기본", description: "기본 warm_blog 스타일" },
    ...BUILTIN_VOICE_PROFILES,
    ...voiceProfiles,
  ];

  useEffect(() => {
    fetchVoiceProfilesApi()
      .then(setVoiceProfiles)
      .catch(() => setVoiceProfiles(loadCachedVoiceProfiles()));
    return () => {
      if (pollRef.current) {
        if (typeof pollRef.current === "function") {
          pollRef.current();
        } else {
          clearInterval(pollRef.current);
        }
      }
      if (hintTimerRef.current) clearInterval(hintTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (visualPhase !== "polling") {
      if (hintTimerRef.current) clearInterval(hintTimerRef.current);
      hintTimerRef.current = null;
      return undefined;
    }
    hintTimerRef.current = setInterval(() => {
      setHintIndex((i) => (i + 1) % RESTYLE_STAGE_HINTS.length);
    }, RESTYLE_HINT_ROTATION_MS);
    return () => {
      if (hintTimerRef.current) clearInterval(hintTimerRef.current);
    };
  }, [visualPhase]);

  const handleFadeDone = useCallback(() => {
    setVisualPhase("summary");
    setStatusMsg("문체가 다시 적용되었습니다.");
    setBusy(false);
    if (onRestyleComplete) onRestyleComplete();
  }, [onRestyleComplete]);

  async function handleRestyle() {
    const chosenVoiceProfileId = selectedVoiceProfileId;
    setBusy(true);
    setError("");
    setAppliedMeta("");
    setVisualPhase("polling");
    setPollTick(0);
    setHintIndex(0);
    setFadeTo("");
    setStatusMsg("요청 전송 중...");
    try {
      let prevMarkdown = "";
      try {
        const prev = await fetchArtifact(workflowId, "review");
        prevMarkdown = prev?.json?.final_markdown ?? prev?.text ?? "";
      } catch {
        prevMarkdown = "";
      }
      setBaselineMd(prevMarkdown);
      setFadeFrom(prevMarkdown);

      await restyleWorkflowApi(workflowId, chosenVoiceProfileId, extraInstructions);
      setStatusMsg(`서버에서 문체·검수를 다시 실행하는 중입니다. (선택: ${chosenVoiceProfileId})`);

      const MAX_ATTEMPTS = 120;
      let attempts = 0;

      const finishWithArtifacts = async ({ allowSameMarkdown = false } = {}) => {
        // 1) 스타일 아티팩트에서 실제로 어떤 voice_profile_id가 적용됐는지 먼저 확인(“적용 안 됐다” 오해 방지)
        try {
          const styled = await fetchArtifact(workflowId, "style");
          const vid = styled?.json?.voice_profile_id;
          const summary = styled?.json?.voice_profile_summary;
          if (vid) {
            setAppliedMeta(`적용된 말투: ${vid}${summary ? ` · ${String(summary).slice(0, 120)}` : ""}`);
          } else if (chosenVoiceProfileId && chosenVoiceProfileId !== "기본") {
            setAppliedMeta("주의: 스타일 결과에 voice_profile_id가 없어 기본 문체로 처리됐을 수 있습니다.");
          }
        } catch {
          // ignore
        }

        // 2) 리뷰(최종) 마크다운을 가져와서 “적용 전/후”를 보여준다.
        const next = await fetchArtifact(workflowId, "review");
        const nextMarkdown = next?.json?.final_markdown ?? next?.text ?? null;
        if (nextMarkdown == null) return false;

        // 내용이 아주 비슷하면 diff가 거의 없을 수 있음. 그래도 “완료/적용됨”은 표시한다.
        if (!allowSameMarkdown && nextMarkdown === prevMarkdown) {
          return false;
        }

        if (pollRef.current) {
          if (typeof pollRef.current === "function") {
            pollRef.current();
          } else {
            clearInterval(pollRef.current);
          }
          pollRef.current = null;
        }

        // 완전히 동일하면 페이드 대신 바로 summary로 (사용자는 “원래대로 돌아갔다”고 느끼기 쉬움)
        if (nextMarkdown === prevMarkdown) {
          setFadeTo(nextMarkdown);
          setVisualPhase("summary");
          setStatusMsg("문체가 적용되었지만 본문 변화가 거의 없습니다. (말투/규칙이 약하거나 이미 비슷한 문체일 수 있어요)");
          setBusy(false);
          if (onRestyleComplete) onRestyleComplete();
          return true;
        }

        setFadeTo(nextMarkdown);
        setVisualPhase("fade");
        return true;
      };

      const startArtifactPollingFallback = () => {
        pollRef.current = setInterval(async () => {
          attempts++;
          setPollTick(attempts);
          if (attempts > MAX_ATTEMPTS) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setError("시간 초과: 결과를 직접 새로고침해 주세요.");
            setBusy(false);
            setStatusMsg("");
            setVisualPhase("idle");
            return;
          }
          try {
            await finishWithArtifacts();
          } catch {
            //
          }
        }, 3000);
      };

      pollRef.current = startWorkflowEventStream(workflowId, (nextWorkflow) => {
        attempts++;
        setPollTick(attempts);
        if (nextWorkflow.status === "STYLE_APPLYING") {
          setStatusMsg("선택한 말투로 문장을 다시 다듬는 중입니다.");
        } else if (nextWorkflow.status === "REVIEWING") {
          setStatusMsg("검수 에이전트가 새 문체 결과를 확인하는 중입니다.");
        } else if (nextWorkflow.status === "FAILED") {
          if (pollRef.current) pollRef.current();
          pollRef.current = null;
          setError(nextWorkflow.lastErrorMessage || "문체 재적용에 실패했습니다.");
          setBusy(false);
          setStatusMsg("");
          setVisualPhase("idle");
          return;
        }
        if (nextWorkflow.status === "COMPLETED") {
          // COMPLETED인데 최종 본문이 크게 안 바뀌는 경우가 있다. 이때도 “적용됨/미미”를 표시한다.
          finishWithArtifacts({ allowSameMarkdown: true }).catch(() => {
            //
          });
        }
      }, () => {
        startArtifactPollingFallback();
      });
    } catch (e) {
      setError(e.message);
      setBusy(false);
      setStatusMsg("");
      setVisualPhase("idle");
    }
  }

  const showVisual = visualPhase === "polling" || visualPhase === "fade" || visualPhase === "summary";

  return (
    <div className="card">
      <div className="card-title"><Palette size={14} /> 문체 다시 적용</div>
      <div className="chip-group">
        {allVoiceProfiles.map((profile) => (
          <button
            key={profile.id}
            className={`chip ${selectedVoiceProfileId === profile.id ? "active" : ""}`}
            onClick={() => setSelectedVoiceProfileId(profile.id)}
            disabled={busy}
          >
            {profile.name}
          </button>
        ))}
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <textarea
          value={extraInstructions}
          onChange={(e) => setExtraInstructions(e.target.value)}
          placeholder="추가로 넣고 싶은 내용이나 수정 방향을 입력하세요"
          rows={3}
          disabled={busy}
        />
      </div>
      {error && <div className="alert alert-error mt-8">{error}</div>}
      {statusMsg && !error && (
        <div className="flex-row text-muted mt-8" style={{ fontSize: 13 }}>
          {(busy || visualPhase === "fade") && <Loader2 className="spin" size={13} />}
          {statusMsg}
        </div>
      )}
      {appliedMeta && !error && (
        <div className="text-muted mt-6" style={{ fontSize: 12, lineHeight: 1.45 }}>
          {appliedMeta}
        </div>
      )}
      <button
        className="btn btn-primary btn-sm"
        style={{ marginTop: 10 }}
        onClick={handleRestyle}
        disabled={busy}
      >
        {busy ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
        {busy ? "처리 중..." : "문체 다시 적용"}
      </button>

      {showVisual && (
        <div className="restyle-visual-card mt-12">
          <div className="restyle-visual-head">
            <Sparkles size={15} style={{ color: "var(--brand)" }} />
            <span>문체 반영 미리보기</span>
            {visualPhase === "polling" && (
              <span className="restyle-visual-meta">
                확인 {pollTick}회 · 약 3초마다 서버와 동기화
              </span>
            )}
          </div>

          {visualPhase === "polling" && (
            <>
              <p key={hintIndex} className="restyle-hint-rotate">
                {RESTYLE_STAGE_HINTS[hintIndex]}
              </p>
              <p className="restyle-hint-sub">
                아래는 적용 전 글입니다. 스캔 라인은 &quot;서버가 같은 글을 읽고 있다&quot;는 시각적 힌트이며,
                실제 문장 치환은 서버에서 끝난 뒤 한 번에 반영됩니다.
              </p>
              <div className="restyle-dual-grid">
                <div>
                  <div className="restyle-pane-title">적용 전</div>
                  <div className="restyle-pane markdown-wrap">
                    <MarkdownPreview markdown={baselineMd || " "} workflowId={workflowId} />
                  </div>
                </div>
                <div>
                  <div className="restyle-pane-title">서버 처리 중 (동일 본문 · 스캔)</div>
                  <div className="restyle-pane markdown-wrap">
                    <RestyleScanningPreview markdown={baselineMd} workflowId={workflowId} active />
                  </div>
                </div>
              </div>
            </>
          )}

          {visualPhase === "fade" && fadeTo && (
            <>
              <p className="restyle-hint-sub">
                새 버전을 받았습니다. 이전 글에서 새 글로 <strong>페이드</strong>합니다.
              </p>
              <div className="restyle-pane markdown-wrap restyle-pane--tall">
                <RestyleCrossfadePreview
                  workflowId={workflowId}
                  fromMd={fadeFrom}
                  toMd={fadeTo}
                  durationMs={1600}
                  onComplete={handleFadeDone}
                />
              </div>
            </>
          )}

          {visualPhase === "summary" && fadeTo && (
            <>
              <div className="restyle-pane-title">적용 후</div>
              <div className="restyle-pane markdown-wrap restyle-pane--tall">
                <MarkdownPreview markdown={fadeTo} workflowId={workflowId} />
              </div>
              <RestyleDiffPanel oldText={fadeFrom} newText={fadeTo} />
              <button
                type="button"
                className="btn btn-ghost btn-sm mt-8"
                onClick={() => {
                  setVisualPhase("idle");
                  setStatusMsg("");
                  setFadeFrom("");
                  setFadeTo("");
                  setBaselineMd("");
                }}
              >
                미리보기 닫기
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }) {
  const cls =
    status === "COMPLETED" ? "completed" : status === "FAILED" ? "failed" : "";
  return <span className={`status-pill ${cls}`}>{workflowStatusLabel(status)}</span>;
}

// ── Write Page ────────────────────────────────────────────────────────────────

function WritePage() {
  const [photoMode, setPhotoMode] = useState("upload"); // "upload" | "id"
  const [projectId, setProjectId] = useState("");
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
  const [writeStep, setWriteStep] = useState(1);
  const [workflow, setWorkflow] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [artifactKey, setArtifactKey] = useState(0);
  const [connectionMode, setConnectionMode] = useState("idle");

  const fileInputRef = useRef(null);
  const pollRef = useRef(null);

  const allVoiceProfiles = [
    { id: "기본", name: "기본", description: "기본 warm_blog 스타일", sample_preview: "" },
    ...BUILTIN_VOICE_PROFILES,
    ...voiceProfiles,
  ];
  const activeVoiceProfile = allVoiceProfiles.find((profile) => profile.id === selectedVoiceProfileId);
  const selectedMedia = mediaSummary(uploadedFiles);
  const startDisabled =
    busy
    || (photoMode === "id" && !projectId.trim())
    || (photoMode === "upload" && uploadedFiles.length === 0);
  const canContinueFromMedia =
    (photoMode === "upload" && uploadedFiles.length > 0)
    || (photoMode === "id" && projectId.trim());

  useEffect(() => {
    fetchVoiceProfilesApi()
      .then(setVoiceProfiles)
      .catch(() => {
        setVoiceProfiles(loadCachedVoiceProfiles());
      });
  }, []);

  function stopPolling() {
    if (pollRef.current) {
      if (typeof pollRef.current === "function") {
        pollRef.current();
      } else {
        clearInterval(pollRef.current);
      }
      pollRef.current = null;
    }
    setConnectionMode("idle");
  }

  function startPolling(wfId) {
    stopPolling();
    let active = true;
    setConnectionMode("live");

    const handleWorkflow = (data) => {
      setWorkflow(data);
      if (["COMPLETED", "FAILED"].includes(data.status)) {
        stopPolling();
        setPhase("done");
      }
    };

    const startFallbackPolling = () => {
      if (!active) return;
      setConnectionMode("polling");
      const id = setInterval(async () => {
        try {
          const data = await fetchWorkflow(wfId);
          handleWorkflow(data);
        } catch {
          // keep polling
        }
      }, 2000);
      pollRef.current = () => {
        active = false;
        clearInterval(id);
      };
    };

    const stopStream = startWorkflowEventStream(
      wfId,
      handleWorkflow,
      () => {
        if (!active) return;
        stopStream();
        startFallbackPolling();
      }
    );
    pollRef.current = () => {
      active = false;
      stopStream();
    };
  }

  useEffect(() => () => stopPolling(), []);

  function handleFiles(files) {
    const list = Array.from(files || []).filter(Boolean);
    setUploadedFiles((prev) => {
      const capped = [...prev];
      for (const f of list) {
        const mimeOk = typeof f.type === "string" && f.type.startsWith("image/");
        const videoMimeOk = typeof f.type === "string" && f.type.startsWith("video/");
        const extOk = typeof f.name === "string" && UPLOAD_MEDIA_EXT_RE.test(f.name);
        if (!mimeOk && !videoMimeOk && !extOk) {
          continue;
        }
        if (capped.length >= UPLOAD_MAX_FILES) break;
        const kind = mimeOk || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name || "") ? "image" : "video";
        capped.push({ file: f, url: URL.createObjectURL(f), kind });
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
          setError("한 개 이상의 사진 또는 동영상을 선택해 주세요.");
          setBusy(false);
          return;
        }
        const thumbnails = uploadedFiles.slice();
        const up = await uploadMediaApi(uploadedFiles.map((entry) => entry.file));
        effectiveProjectId = up.projectId;
        thumbnails.forEach((item) => URL.revokeObjectURL(item.url));
        setUploadedFiles([]);
      }

      const writingInstructions = [
        contentType ? `글 종류: ${contentType}` : "",
        direction.trim() ? `작성 방향: ${direction.trim()}` : "",
        contentType === "체험단" ? `체험단 조건: 최소 사진 ${minPhotos}개${includeSignage ? ", 간판 사진 포함" : ""}${mentionBrand && brandName.trim() ? `, 상호명 ${brandName.trim()} 언급` : ""}${extraRules.trim() ? `, ${extraRules.trim()}` : ""}` : "",
      ].filter(Boolean).join("\n");
      const wf = await createWorkflowApi(
        effectiveProjectId,
        groupingStrategy,
        timeWindowMinutes,
        selectedVoiceProfileId,
        contentType,
        writingInstructions
      );
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

  async function handleRetry() {
    if (!workflow?.workflowId) return;
    setBusy(true);
    setError("");
    try {
      await retryWorkflowApi(workflow.workflowId);
      const updated = await fetchWorkflow(workflow.workflowId);
      setWorkflow(updated);
      setPhase("running");
      startPolling(workflow.workflowId);
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
    setWriteStep(1);
    setWorkflow(null);
    setError("");
  }

  if (phase !== "form") {
    return (
      <div className="page">
        <title>새 글 쓰기 | Momently</title>
        <div className="page-header page-header-row">
          <div className="flex-row" style={{ justifyContent: "space-between", width: "100%" }}>
            <div>
              <h2>{workflow?.status === "COMPLETED" ? "글이 완성됐습니다" : workflow?.status === "FAILED" ? "다시 시도할 수 있습니다" : "글을 만들고 있습니다"}</h2>
              <p className="mono-muted">
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
          {workflow && (
            <div className="workflow-summary-strip">
              <div>
                <span>현재 상태</span>
                <strong>{workflowStatusLabel(workflow.status)}</strong>
              </div>
              <div>
                <span>입력 묶음</span>
                <strong>{workflow.projectId || "-"}</strong>
              </div>
              <div>
                <span>그룹</span>
                <strong>{workflow.groupCount ?? "-"}</strong>
              </div>
            </div>
          )}
          <PipelineSteps
            status={workflow?.status ?? "CREATED"}
            showActivityRail={
              phase === "running" &&
              !!workflow &&
              !["COMPLETED", "FAILED"].includes(workflow.status)
            }
          />
          <MetricsRow workflow={workflow} />
        </div>

        {phase === "done" && workflow?.status === "COMPLETED" && (
          <>
            <div className="card">
              <div className="card-title">
                <FileText size={14} /> 결과물
              </div>
              <ArtifactViewer key={artifactKey} workflowId={workflow.workflowId} tabs={ARTIFACT_TABS} />
            </div>
            <RestylePanel
              workflowId={workflow.workflowId}
              onRestyleComplete={() => setArtifactKey((k) => k + 1)}
            />
          </>
        )}

        {phase === "done" && workflow?.status === "FAILED" && (
          <div className="alert alert-error mt-12">
            <div><strong>파이프라인 실행에 실패했습니다.</strong></div>
            {workflow.lastFailedStep && (
              <div className="text-muted mt-4">실패 단계: {workflowStatusLabel(workflow.lastFailedStep)}</div>
            )}
            {workflow.lastErrorMessage && (
              <div className="text-muted mt-4">{workflow.lastErrorMessage}</div>
            )}
            <div className="flex-row mt-8">
              <button className="btn btn-primary" type="button" onClick={handleRetry} disabled={busy}>
                {busy ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />} 재시도
              </button>
              <button className="btn btn-ghost" type="button" onClick={handleReset} disabled={busy}>
                새로 작성
              </button>
            </div>
          </div>
        )}

        {phase === "running" && (
          <div className="pipeline-running-foot mt-12">
            <div className="flex-row text-muted">
              <Loader2 className="spin" size={16} />
              {connectionMode === "polling"
                ? "실시간 연결이 끊겨 2초마다 상태를 확인하고 있습니다."
                : "실시간으로 상태를 확인하고 있습니다."}
            </div>
            {workflow && (
              <p className="pipeline-running-caption">{pipelineLiveCaption(workflow.status)}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <title>새 글 쓰기 | Momently</title>
      <meta name="description" content="사진과 동영상을 업로드하고 AI가 블로그 글을 자동으로 작성합니다." />
      <div className="write-hero">
        <div>
          <h2>사진과 동영상으로 글 만들기</h2>
          <p>미디어를 고르고, 원하는 느낌만 선택하면 AI가 블로그 글을 완성합니다.</p>
        </div>
        <div className="write-stepper" aria-label="글쓰기 단계">
          {[
            [1, "미디어"],
            [2, "스타일"],
            [3, "확인"],
          ].map(([step, label]) => (
            <button
              key={step}
              type="button"
              className={`write-step ${writeStep === step ? "active" : writeStep > step ? "done" : ""}`}
              onClick={() => {
                if (step === 1 || canContinueFromMedia || step < writeStep) setWriteStep(step);
              }}
            >
              <span>{step}</span>
              {label}
            </button>
          ))}
        </div>
      </div>

      {writeStep === 1 && (
        <div className="write-stage">
          <div className="stage-copy">
            <span>1단계</span>
            <h3>글에 넣을 사진이나 동영상을 올려주세요</h3>
            <p>프로젝트 ID는 서버가 자동으로 만들어요. 보통은 이 화면에서 파일만 선택하면 됩니다.</p>
          </div>

          <div className="card">
            <div className="section-heading">
              <div>
                <div className="card-title"><Image size={14} /> 미디어 업로드</div>
                <p>분위기, 장소, 음식, 메뉴판처럼 글에 필요한 장면을 넉넉히 올려주세요.</p>
              </div>
              {uploadedFiles.length > 0 && (
                <span className="media-count-badge">
                  {uploadedFiles.length}개 · {formatBytes(selectedMedia.totalBytes)}
                </span>
              )}
            </div>

            {photoMode === "upload" ? (
              <>
                <div
                  className={`dropzone ${dragOver ? "drag-over" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={32} color="var(--brand)" />
                  <p>여기로 끌어오거나 클릭해서 선택</p>
                  <span>JPG · PNG · WEBP · HEIC/HEIF · MP4 · MOV · M4V 지원</span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.mp4,.mov,.m4v,image/*,video/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => handleFiles(e.target.files)}
                />
                {uploadedFiles.length > 0 && (
                  <div className="media-review">
                    <div className="media-review-head">
                      <div>
                        <strong>선택한 미디어</strong>
                        <span>사진 {selectedMedia.images}개 · 동영상 {selectedMedia.videos}개</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setUploadedFiles((prev) => {
                          prev.forEach((item) => URL.revokeObjectURL(item.url));
                          return [];
                        })}
                      >
                        <Trash2 size={13} /> 비우기
                      </button>
                    </div>
                    <div className="photo-thumbs">
                      {uploadedFiles.map((item, i) => (
                        <div key={`${item.file.name}-${i}`} className="photo-thumb">
                          {item.kind === "image" ? (
                            <img src={item.url} alt="" />
                          ) : (
                            <div className="video-thumb">
                              <Video size={22} />
                              <span>{item.file.name}</span>
                            </div>
                          )}
                          <button
                            type="button"
                            className="photo-thumb-remove"
                            aria-label={`${item.file.name} 제거`}
                            onClick={(e) => { e.stopPropagation(); removePhoto(i); }}
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="media-file-list">
                      {uploadedFiles.slice(0, 6).map((item, i) => (
                        <div key={`${item.file.name}-row-${i}`} className="media-file-row">
                          {item.kind === "image" ? <Image size={14} /> : <Video size={14} />}
                          <span>{item.file.name}</span>
                          <em>{formatBytes(item.file.size)}</em>
                        </div>
                      ))}
                      {uploadedFiles.length > 6 && (
                        <div className="media-file-row media-file-row-muted">
                          <span>외 {uploadedFiles.length - 6}개</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="field">
                <label>서버 미디어 묶음 ID</label>
                <input
                  type="text"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  placeholder="예: sample_images"
                />
              </div>
            )}

            <button
              className="collapsible-header"
              style={{ borderTop: "none" }}
              onClick={() => setAdvancedOpen((v) => !v)}
              type="button"
            >
              <span className="flex-row" style={{ gap: 6 }}>
                <Settings size={14} /> 서버에 준비된 미디어 묶음 쓰기
              </span>
              {advancedOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {advancedOpen && (
              <div className="collapsible-body">
                <div className="alert alert-warn mt-8">
                  이미 서버 입력 폴더에 파일이 올라가 있는 경우에만 사용하세요.
                </div>
                <div className="mode-toggle">
                  <button
                    type="button"
                    className={photoMode === "upload" ? "active" : ""}
                    onClick={() => setPhotoMode("upload")}
                  >
                    파일 업로드
                  </button>
                  <button
                    type="button"
                    className={photoMode === "id" ? "active" : ""}
                    onClick={() => setPhotoMode("id")}
                  >
                    서버 묶음 ID
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {writeStep === 2 && (
        <div className="write-stage">
          <div className="stage-copy">
            <span>2단계</span>
            <h3>어떤 글로 만들까요?</h3>
            <p>잘 모르겠으면 기본값 그대로 진행해도 됩니다. 나중에 문체는 다시 적용할 수 있어요.</p>
          </div>

          <div className="card">
            <div className="card-title"><PenLine size={14} /> 글 종류</div>
            <div className="option-card-grid">
              {CONTENT_TYPES.map((ct) => (
                <button
                  key={ct}
                  type="button"
                  className={`option-card ${contentType === ct ? "active" : ""}`}
                  onClick={() => setContentType(ct)}
                >
                  <strong>{ct}</strong>
                  <span>
                    {ct === "블로그" && "일상적인 후기 글"}
                    {ct === "여행후기" && "장소와 동선을 살린 기록"}
                    {ct === "음식후기" && "메뉴와 분위기 중심"}
                    {ct === "체험단" && "필수 조건을 챙기는 글"}
                    {ct === "이벤트" && "홍보성 안내 글"}
                  </span>
                </button>
              ))}
            </div>

            {contentType === "체험단" && (
              <div className="rule-panel">
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

          <div className="card">
            <div className="card-title"><Palette size={14} /> 말투</div>
            <div className="option-card-grid tone-option-grid">
              {allVoiceProfiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  className={`option-card ${selectedVoiceProfileId === profile.id ? "active" : ""}`}
                  onClick={() => setSelectedVoiceProfileId(profile.id)}
                >
                  <strong>{profile.name}</strong>
                  <span>{profile.description || profile.sample_preview || "기본 문체로 작성"}</span>
                </button>
              ))}
            </div>
            {activeVoiceProfile?.sample_preview && (
              <div className="tone-preview">&ldquo;{activeVoiceProfile.sample_preview}&rdquo;</div>
            )}
          </div>

          <div className="card">
            <div className="card-title"><Sparkles size={14} /> 꼭 넣고 싶은 내용</div>
            <textarea
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              placeholder="예: 메뉴 이름을 자연스럽게 넣어줘. 너무 광고처럼 보이지 않게 써줘."
              rows={4}
            />
          </div>

          <div className="card">
            <button
              className="collapsible-header"
              style={{ borderTop: "none", paddingTop: 0 }}
              onClick={() => setAdvancedOpen((v) => !v)}
              type="button"
            >
              <span className="flex-row" style={{ gap: 6 }}>
                <Settings size={14} /> 분석 기준 조정
              </span>
              {advancedOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {advancedOpen && (
              <div className="collapsible-body advanced-grid">
                <div className="field">
                  <label>사진 그룹화 기준</label>
                  <select value={groupingStrategy} onChange={(e) => setGroupingStrategy(e.target.value)}>
                    <option value="LOCATION_BASED">장소 중심</option>
                    <option value="TIME_BASED">시간 중심</option>
                    <option value="SCENE_BASED">장면 중심</option>
                  </select>
                </div>
                <div className="field">
                  <label>시간 간격</label>
                  <input
                    type="number"
                    min={1}
                    value={timeWindowMinutes}
                    onChange={(e) => setTimeWindowMinutes(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {writeStep === 3 && (
        <div className="write-stage">
          <div className="stage-copy">
            <span>3단계</span>
            <h3>확인하고 시작하세요</h3>
            <p>시작하면 업로드, 사진·동영상 분석, 글 작성까지 자동으로 진행됩니다.</p>
          </div>

          <div className="review-summary-card">
            <div>
              <span>미디어</span>
              <strong>
                {photoMode === "upload"
                  ? `${uploadedFiles.length}개 · 사진 ${selectedMedia.images} / 동영상 ${selectedMedia.videos}`
                  : projectId.trim() || "서버 묶음 ID 미입력"}
              </strong>
            </div>
            <div>
              <span>글 종류</span>
              <strong>{contentType}</strong>
            </div>
            <div>
              <span>말투</span>
              <strong>{activeVoiceProfile?.name || "기본"}</strong>
            </div>
            <div>
              <span>작성 방향</span>
              <strong>{direction.trim() || "AI가 사진을 보고 자연스럽게 구성"}</strong>
            </div>
          </div>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div className="start-panel">
        <div>
          <strong>
            {writeStep === 1 && "먼저 미디어를 선택하세요"}
            {writeStep === 2 && "글 스타일을 골라주세요"}
            {writeStep === 3 && (photoMode === "upload" ? `${uploadedFiles.length}개 미디어로 시작` : "서버 묶음 ID로 시작")}
          </strong>
          <span>
            {writeStep === 1 && "사진이나 동영상을 올리면 다음 단계로 갈 수 있습니다."}
            {writeStep === 2 && "기본값으로도 충분합니다. 필요한 것만 바꾸세요."}
            {writeStep === 3 && "업로드 후 자동으로 프로젝트 ID를 만들고 워크플로를 실행합니다."}
          </span>
        </div>
        <div className="start-actions">
          {writeStep > 1 && (
            <button className="btn btn-ghost btn-lg" type="button" onClick={() => setWriteStep((step) => Math.max(1, step - 1))}>
              이전
            </button>
          )}
          {writeStep < 3 ? (
            <button
              className="btn btn-primary btn-lg"
              type="button"
              onClick={() => setWriteStep((step) => Math.min(3, step + 1))}
              disabled={writeStep === 1 && !canContinueFromMedia}
            >
              다음
            </button>
          ) : (
            <button
              className="btn btn-primary btn-lg"
              type="button"
              onClick={handleStart}
              disabled={startDisabled}
            >
              {busy ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
              {busy ? "시작 중..." : "글쓰기 시작"}
            </button>
          )}
        </div>
      </div>
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
  const [sampleMarkdown, setSampleMarkdown] = useState("");
  const sampleEditorRef = useRef(null);
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

  useEffect(() => {
    setSampleMarkdown("");
  }, [selectedProfileId]);

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
    const body = sampleEditorRef.current?.getMarkdown?.()?.trim() ?? sampleMarkdown.trim();
    if (!selectedProfile || !body) return;
    setLoading(true);
    setError("");
    try {
      const updated = await addVoiceSampleApi(selectedProfile.id, sampleTitle, body);
      const next = profiles.map((profile) => profile.id === updated.id ? updated : profile);
      setProfiles(next);
      saveCachedVoiceProfiles(next);
      setSampleTitle("");
      setSampleMarkdown("");
      sampleEditorRef.current?.clear?.();
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
              <p className="field-hint">
                TipTap 에디터에서 블로그 글을 붙여 넣을 수 있습니다. 사진·캡처는 JPEG로 줄여{" "}
                <code>![](data:…)</code> 마크다운으로 변환된 뒤 서버에 저장됩니다. 외부 URL 이미지는 그대로 링크로
                남습니다.
              </p>
              <VoiceSampleEditor
                ref={sampleEditorRef}
                disabled={loading}
                resetKey={selectedProfileId}
                onMarkdownChange={setSampleMarkdown}
              />
            </div>
            <div className="flex-row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={handleAnalyze} disabled={loading}>
                <RefreshCw size={13} /> 다시 분석
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleAddSample} disabled={!sampleMarkdown.trim() || loading}>
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
  const [history, setHistory] = useState([]);
  const [selected, setSelected] = useState(null);
  const [workflow, setWorkflow] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [historyArtifactKey, setHistoryArtifactKey] = useState(0);

  async function loadServerHistory() {
    setLoadingHistory(true);
    setHistoryError("");
    try {
      const data = await fetchWorkflows();
      setHistory(Array.isArray(data) ? data : []);
      clearHistory();
    } catch (e) {
      setHistoryError(e.message);
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    loadServerHistory();
  }, []);

  async function clearAllHistory() {
    setHistoryError("");
    try {
      await deleteWorkflowHistoryApi();
      clearHistory();
      setHistory([]);
      setSelected(null);
      setWorkflow(null);
      setDetailError("");
    } catch (e) {
      setHistoryError(e.message);
    }
  }

  async function openItem(item) {
    setSelected(item);
    setWorkflow(null);
    setDetailError("");
    setLoadingDetail(true);
    try {
      const rawId = item.workflowId ?? item.workflow_id;
      const wid = typeof rawId === "string" ? rawId.trim() : rawId != null ? String(rawId).trim() : "";
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
              <h2>{workflowTitle(workflow || selected)}</h2>
              <p>
                <span className="mono-muted">{selected.workflowId}</span>
                {selected.groupingStrategy ? <> · {selected.groupingStrategy}</> : null}
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
              <PipelineSteps
                status={workflow.status}
                showActivityRail={!["COMPLETED", "FAILED"].includes(workflow.status)}
              />
              <MetricsRow workflow={workflow} />
            </div>

            {["COMPLETED"].includes(workflow.status) && (
              <>
                <div className="card">
                  <div className="card-title"><FileText size={14} /> 결과물</div>
                  <ArtifactViewer
                    key={historyArtifactKey}
                    workflowId={workflow.workflowId}
                    tabs={[
                      ["review", "최종 블로그"],
                      ["style", "문체 적용"],
                      ["draft", "초안"],
                    ]}
                  />
                </div>
                <RestylePanel
                  workflowId={workflow.workflowId}
                  onRestyleComplete={() => setHistoryArtifactKey((k) => k + 1)}
                />
              </>
            )}

            {workflow.status === "FAILED" && (
              <div className="alert alert-error mt-12">
                <strong>작업이 실패했습니다.</strong>
                {workflow.lastFailedStep && (
                  <div className="text-muted mt-4">실패 단계: {workflowStatusLabel(workflow.lastFailedStep)}</div>
                )}
                {workflow.lastErrorMessage && (
                  <div className="text-muted mt-4">{workflow.lastErrorMessage}</div>
                )}
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
        <div className="history-header">
          <div>
            <h2>작업 기록</h2>
            <p>완성된 글을 다시 열거나 실패한 작업의 원인을 확인할 수 있습니다.</p>
          </div>
          <div className="flex-row">
            <button type="button" className="btn btn-secondary btn-sm" onClick={loadServerHistory} disabled={loadingHistory}>
              {loadingHistory ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
              새로고침
            </button>
            {history.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearAllHistory}>
                <Trash2 size={14} /> 전체 삭제
              </button>
            )}
          </div>
        </div>
      </div>

      {historyError && <div className="alert alert-error">{historyError}</div>}

      {loadingHistory ? (
        <div className="flex-row text-muted">
          <Loader2 className="spin" size={16} /> 불러오는 중...
        </div>
      ) : history.length === 0 ? (
        <div className="history-empty">
          <FileText size={28} />
          <strong>아직 작업 기록이 없습니다</strong>
          <span>새 글 쓰기에서 사진이나 동영상을 올리면 이곳에 작업이 쌓입니다.</span>
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
                <div className="history-item-id">{workflowTitle(item)}</div>
                <div className="history-item-meta">
                  <span className="mono-muted">{item.workflowId}</span>
                  {item.groupingStrategy ? <> · {item.groupingStrategy}</> : null}
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
      if (status === "FAILED") {
        await retryWorkflowApi(workflowId);
        msg("재시도를 시작했습니다.", "success");
      } else {
        await runWorkflowApi(workflowId);
        msg("실행을 시작했습니다.", "success");
      }
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
            {busy ? <Loader2 className="spin" size={15} /> : status === "FAILED" ? <RefreshCw size={15} /> : <Play size={15} />}
            {status === "FAILED" ? "Retry" : "Run"}
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
          <PipelineSteps
            status={status}
            showActivityRail={!["COMPLETED", "FAILED"].includes(status)}
          />
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
                <MarkdownPreview markdown={markdown} workflowId={workflowId} />
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
