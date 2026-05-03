import { describe, expect, it } from "vitest";
import { orchestratorNeedsBearer } from "./orchestratorAuth.js";

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
