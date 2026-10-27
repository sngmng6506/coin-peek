export const PANEL_BASE_WIDTH = 280
export const PANEL_MIN_WIDTH = 240
export const PANEL_MAX_WIDTH = 560

export function normalizePanelSize(value) {
  if (!Number.isFinite(value?.width) || !Number.isFinite(value?.height)) return null
  return {
    width: Math.round(Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, value.width))),
    height: Math.round(Math.max(120, Math.min(10000, value.height)))
  }
}
