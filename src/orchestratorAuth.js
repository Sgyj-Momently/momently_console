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
