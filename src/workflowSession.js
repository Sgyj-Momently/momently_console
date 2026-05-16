export const ACTIVE_WORKFLOW_KEY = "momently_active_workflow_id";
export const WORKFLOW_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validWorkflowId(value) {
  return typeof value === "string" && WORKFLOW_ID_RE.test(value);
}

export function loadActiveWorkflowId(storage = globalThis.sessionStorage) {
  try {
    const value = storage?.getItem?.(ACTIVE_WORKFLOW_KEY) || "";
    return validWorkflowId(value) ? value : "";
  } catch {
    return "";
  }
}

export function saveActiveWorkflowId(workflowId, storage = globalThis.sessionStorage) {
  if (!validWorkflowId(workflowId)) return;
  try {
    storage?.setItem?.(ACTIVE_WORKFLOW_KEY, workflowId);
  } catch {
    //
  }
}

export function clearActiveWorkflowId(storage = globalThis.sessionStorage) {
  try {
    storage?.removeItem?.(ACTIVE_WORKFLOW_KEY);
  } catch {
    //
  }
}
