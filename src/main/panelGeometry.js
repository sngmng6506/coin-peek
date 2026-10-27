import { PANEL_BASE_WIDTH, PANEL_MIN_WIDTH, PANEL_MAX_WIDTH } from '../shared/panelSize.js'

export function panelGeometry(area, dock, requestedHeight, requestedWidth = PANEL_BASE_WIDTH) {
  const desiredWidth = Number.isFinite(requestedWidth) ? requestedWidth : PANEL_BASE_WIDTH
  const width = Math.min(
    area.width,
    Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, desiredWidth))
  )
  const scale = width / PANEL_BASE_WIDTH
  const margin = Math.min(40, Math.max(0, area.height - 120))
  const minHeight = Math.min(Math.round(120 * scale), area.height - margin)
  const y = Math.max(0, Math.min(Number(dock.y) || 0, area.height - minHeight - margin))
  const height = Math.max(
    minHeight,
    Math.min(Number(requestedHeight) || minHeight, area.height - y - margin)
  )
  return {
    y: area.y + y,
    offsetY: y,
    height,
    width,
    shownX: dock.edge === 'left' ? area.x : area.x + area.width - width,
    hiddenX: dock.edge === 'left' ? area.x - width : area.x + area.width
  }
}

// Screen coordinates are device-independent pixels, even when renderer contents are scaled.
export function resizedPanelGeometry(area, dock, start, cursor, axis) {
  const dx = cursor.x - start.cursor.x
  const dy = cursor.y - start.cursor.y
  const width = start.width + (axis === 'height' ? 0 : dx * (dock.edge === 'left' ? 1 : -1))
  const height = start.height + (axis === 'width' ? 0 : dy)
  return panelGeometry(area, dock, height, width)
}
