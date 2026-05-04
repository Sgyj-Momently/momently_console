/**
 * 오케스트레이터(/api, 동일 게이트 포함) 호출에 Bearer를 붙일지 판단한다.
 * 말투 API는 경로로만 구분해, VOICE와 API 베이스 URL이 같아도 워크플로 요청에 JWT가 빠지지 않게 한다.
 *
 * @param {string} url
 * @param {string} [baseOrigin] 테스트용 파싱 베이스(생략 시 window.location.origin 또는 fallback)
 */
export function orchestratorNeedsBearer(url, baseOrigin) {
  if (typeof url !== "string") return false;
  try {
    const origin =
      typeof baseOrigin === "string" && baseOrigin.length > 0
        ? baseOrigin
        : typeof globalThis.window !== "undefined" && globalThis.window?.location?.origin
          ? globalThis.window.location.origin
          : "http://localhost";
    const pathname = url.startsWith("http://") || url.startsWith("https://")
      ? new URL(url, origin).pathname
      : (url.startsWith("/") ? url : `/${url}`).split("?")[0];
    if (pathname.startsWith("/api/v1/voice-profiles")) return false;
    return pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function bearerFromHeaders(headers) {
  if (headers == null) return "";
  if (headers instanceof Headers) return headers.get("Authorization") ?? "";
  return headers.Authorization ?? headers.authorization ?? "";
}

function bearerToken(headers) {
  const raw = bearerFromHeaders(headers);
  if (typeof raw !== "string") return "";
  const matched = raw.match(/^Bearer\s+(\S+)$/i);
  return matched?.[1] ?? "";
}

function base64UrlJson(part) {
  try {
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function jwtExpired(token, nowMs = Date.now()) {
  if (typeof token !== "string" || token.trim() === "") return false;
  const payload = base64UrlJson(token.split(".")[1] ?? "");
  if (!payload || typeof payload.exp !== "number") return false;
  return payload.exp * 1000 <= nowMs;
}

/**
 * 401이 와도 무조건 세션을 지우지 않는다.
 * 작업 기록의 이미지/아티팩트 같은 부가 호출이 401을 낼 수 있으므로, 클라이언트가 확인 가능한 만료 토큰일 때만 자동 로그아웃한다.
 */
export function shouldClearSessionOnUnauthorized(headers, nowMs = Date.now()) {
  const token = bearerToken(headers);
  return token !== "" && jwtExpired(token, nowMs);
}
