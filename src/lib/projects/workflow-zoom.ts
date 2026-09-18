export const MIN_WORKFLOW_ZOOM = 25;
export const MAX_WORKFLOW_ZOOM = 150;
export const DEFAULT_WORKFLOW_ZOOM = 100;
export const WORKFLOW_ZOOM_STEP = 10;

export function clampWorkflowZoom(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_WORKFLOW_ZOOM;
  return Math.min(MAX_WORKFLOW_ZOOM, Math.max(MIN_WORKFLOW_ZOOM, Math.round(value)));
}

export function changeWorkflowZoom(current: number, direction: -1 | 1): number {
  return clampWorkflowZoom(current + direction * WORKFLOW_ZOOM_STEP);
}

export function fitWorkflowZoom(viewportWidth: number, canvasWidth: number): number {
  if (viewportWidth <= 0 || canvasWidth <= 0) return DEFAULT_WORKFLOW_ZOOM;
  return clampWorkflowZoom(viewportWidth / canvasWidth * 100);
}

export function wheelWorkflowZoom(current: number, deltaY: number, modified: boolean): number {
  if (!modified || deltaY === 0) return current;
  return changeWorkflowZoom(current, deltaY < 0 ? 1 : -1);
}

export function keyboardWorkflowZoom(current: number, key: string, modified: boolean): number {
  if (!modified) return current;
  if (key === "+" || key === "=") return changeWorkflowZoom(current, 1);
  if (key === "-") return changeWorkflowZoom(current, -1);
  if (key === "0") return DEFAULT_WORKFLOW_ZOOM;
  return current;
}

export function compensateDragTransform<T extends { x: number; y: number }>(transform: T, zoom: number): T {
  const scale = clampWorkflowZoom(zoom) / 100;
  return { ...transform, x: transform.x / scale, y: transform.y / scale };
}
