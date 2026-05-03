/**
 * 빌드/런타임에서 API 오리진을 일관되게 쓴다.
 * 프로덕션 게이트·Vite dev 프록시 모두 같은 상대 경로(/api…)를 전제한다.
 */

export function viteNonEmpty(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  return s === "" ? null : s.replace(/\/$/, "");
}

/** 브라우저 → 오케스트레이터(compose 내부 18080) 직통은 게이트/프록시와 어긋나 실패하기 쉬움 */
export function isLocalOrchestratorPort18080(origin) {
  if (!origin || typeof origin !== "string") return false;
  try {
    const u = new URL(origin);
    const port = u.port;
    const h = u.hostname.toLowerCase();
    const localHost = h === "localhost" || h === "127.0.0.1" || h === "::1";
    return localHost && port === "18080";
  } catch {
    return false;
  }
}

function isViteDevEnv(env) {
  if (env.DEV === true) return true;
  if (env.DEV === false) return false;
  return env.MODE === "development";
}

/** @param {{ DEV?: boolean, MODE?: string, VITE_API_BASE_URL?: string }} env import.meta.env 대체 가능 */
export function apiOriginFromEnv(env) {
  const raw = viteNonEmpty(env.VITE_API_BASE_URL);
  if (raw && isViteDevEnv(env) && isLocalOrchestratorPort18080(raw)) {
    console.warn(
      "[Momently] 개발 모드에서 VITE_API_BASE_URL 이 로컬 :18080(오케스트레이터)을 가리킵니다. 브라우저는 게이트(:18580) 경유(/api 프록시)를 씁니다. .env 에서 해당 변수를 비우거나 제거하세요."
    );
    return "";
  }
  return raw ?? "";
}

/** @param {{ DEV?: boolean, MODE?: string, VITE_VOICE_API_BASE_URL?: string }} env import.meta.env 대체 가능 */
export function voiceOriginFromEnv(env) {
  const raw = viteNonEmpty(env.VITE_VOICE_API_BASE_URL);
  if (raw && isViteDevEnv(env) && isLocalOrchestratorPort18080(raw)) {
    console.warn(
      "[Momently] VITE_VOICE_API_BASE_URL 이 로컬 :18080을 가리킵니다. 콘솔은 보통 게이트/프록시 경로를 씁니다. .env 에서 수정하세요."
    );
    return "";
  }
  return raw ?? "";
}
