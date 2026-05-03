import { describe, expect, it, vi } from "vitest";
import {
  apiOriginFromEnv,
  isLocalOrchestratorPort18080,
  voiceOriginFromEnv,
  viteNonEmpty,
} from "./apiOrigin.js";

describe("viteNonEmpty", () => {
  it("공백·미설정은 null", () => {
    expect(viteNonEmpty(undefined)).toBeNull();
    expect(viteNonEmpty(null)).toBeNull();
    expect(viteNonEmpty("  ")).toBeNull();
  });
  it("끝 슬래시 제거", () => {
    expect(viteNonEmpty("http://h/")).toBe("http://h");
  });
});

describe("apiOriginFromEnv", () => {
  it("VITE 미지정 시 상대 경로(빈 오리진) — Docker 게이트·Vite 프록시와 계약 유지", () => {
    expect(apiOriginFromEnv({})).toBe("");
    expect(apiOriginFromEnv({ VITE_API_BASE_URL: "" })).toBe("");
  });
  it("직접 지정 우선", () => {
    expect(apiOriginFromEnv({ VITE_API_BASE_URL: "http://legacy:8080" })).toBe("http://legacy:8080");
  });
  it("개발 모드에서 로컬 :18080 은 무시(오케스트레이터 직통 회귀 방지)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      apiOriginFromEnv({ DEV: true, VITE_API_BASE_URL: "http://127.0.0.1:18080" })
    ).toBe("");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  it("프로덕션 빌드에서는 로컬 :18080 도 env 그대로(드문 호스트 전용 빌드)", () => {
    expect(
      apiOriginFromEnv({ DEV: false, MODE: "production", VITE_API_BASE_URL: "http://127.0.0.1:18080" })
    ).toBe("http://127.0.0.1:18080");
  });
});

describe("isLocalOrchestratorPort18080", () => {
  it("localhost · 127 · ::1 + 18080 만 해당", () => {
    expect(isLocalOrchestratorPort18080("http://127.0.0.1:18080")).toBe(true);
    expect(isLocalOrchestratorPort18080("http://localhost:18080/api")).toBe(true);
    expect(isLocalOrchestratorPort18080("http://127.0.0.1:18580")).toBe(false);
    expect(isLocalOrchestratorPort18080("http://gateway:18080")).toBe(false);
  });
});

describe("voiceOriginFromEnv", () => {
  it("미지정 시 빈 문자열", () => {
    expect(voiceOriginFromEnv({})).toBe("");
  });
});
