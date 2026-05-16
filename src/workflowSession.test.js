import { describe, expect, it, vi } from "vitest";
import {
  ACTIVE_WORKFLOW_KEY,
  clearActiveWorkflowId,
  loadActiveWorkflowId,
  saveActiveWorkflowId,
  validWorkflowId,
} from "./workflowSession.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, value)),
    removeItem: vi.fn((key) => values.delete(key)),
  };
}

describe("workflow session helpers", () => {
  const workflowId = "01964e72-4f4b-7d35-9a07-f9c7ef4b0f10";

  it("UUID 형식 워크플로 ID만 유효하게 본다", () => {
    expect(validWorkflowId(workflowId)).toBe(true);
    expect(validWorkflowId("sample_images")).toBe(false);
    expect(validWorkflowId("")).toBe(false);
    expect(validWorkflowId(null)).toBe(false);
  });

  it("세션에 남은 유효한 워크플로 ID를 불러온다", () => {
    const storage = memoryStorage({ [ACTIVE_WORKFLOW_KEY]: workflowId });

    expect(loadActiveWorkflowId(storage)).toBe(workflowId);
  });

  it("깨진 값은 복구 대상으로 쓰지 않는다", () => {
    const storage = memoryStorage({ [ACTIVE_WORKFLOW_KEY]: "not-a-workflow-id" });

    expect(loadActiveWorkflowId(storage)).toBe("");
  });

  it("유효한 워크플로 ID만 저장하고 삭제할 수 있다", () => {
    const storage = memoryStorage();

    saveActiveWorkflowId("not-a-workflow-id", storage);
    expect(storage.setItem).not.toHaveBeenCalled();

    saveActiveWorkflowId(workflowId, storage);
    expect(storage.setItem).toHaveBeenCalledWith(ACTIVE_WORKFLOW_KEY, workflowId);

    clearActiveWorkflowId(storage);
    expect(storage.removeItem).toHaveBeenCalledWith(ACTIVE_WORKFLOW_KEY);
  });
});
