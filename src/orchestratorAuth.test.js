import { describe, expect, it } from "vitest";
import {
  jwtExpired,
  orchestratorNeedsBearer,
  shouldClearSessionOnUnauthorized,
} from "./orchestratorAuth.js";

function fakeJwt(payload) {
  const encode = (value) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${encode({ alg: "none" })}.${encode(payload)}.sig`;
}

describe("orchestratorNeedsBearer", () => {
  const gate = "https://momently.example";

  it("동일 게이트 절대 URL의 워크플로에는 Bearer 필요(말투 오리진과 공유 시 회귀 방지)", () => {
    expect(
      orchestratorNeedsBearer(`${gate}/api/v1/workflows/01964e72-4f4b-7d35-9a07-f9c7ef4b0faa`, gate)
    ).toBe(true);
  });

  it("동일 호스트의 말투 프로필 경로는 Bearer 불필요", () => {
    expect(orchestratorNeedsBearer(`${gate}/api/v1/voice-profiles`, gate)).toBe(false);
    expect(orchestratorNeedsBearer(`${gate}/api/v1/voice-profiles/abc`, gate)).toBe(false);
  });

  it("상대 경로 /api 는 Bearer 필요", () => {
    expect(orchestratorNeedsBearer("/api/v1/workflows/x")).toBe(true);
  });

  it("/api 밖은 Bearer 불필요", () => {
    expect(orchestratorNeedsBearer("/assets/app.js")).toBe(false);
  });

  it("비문자열은 false", () => {
    expect(orchestratorNeedsBearer(null)).toBe(false);
  });
});

describe("401 세션 정리 판단", () => {
  const now = 1_700_000_000_000;

  it("만료된 JWT면 자동 세션 정리 대상", () => {
    const token = fakeJwt({ sub: "console", exp: 1_699_999_999 });

    expect(jwtExpired(token, now)).toBe(true);
    expect(shouldClearSessionOnUnauthorized({ Authorization: `Bearer ${token}` }, now)).toBe(true);
  });

  it("아직 유효한 JWT의 401은 화면별 오류로 남기고 세션은 유지", () => {
    const token = fakeJwt({ sub: "console", exp: 1_700_000_100 });

    expect(jwtExpired(token, now)).toBe(false);
    expect(shouldClearSessionOnUnauthorized({ Authorization: `Bearer ${token}` }, now)).toBe(false);
  });

  it("Bearer가 없거나 해석 불가한 토큰은 자동 로그아웃하지 않는다", () => {
    expect(shouldClearSessionOnUnauthorized({}, now)).toBe(false);
    expect(shouldClearSessionOnUnauthorized({ Authorization: "Bearer not-a-jwt" }, now)).toBe(false);
  });
});
