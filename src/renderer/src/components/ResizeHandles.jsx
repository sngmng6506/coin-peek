import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'

export default function ResizeHandles({ edge }) {
  const { t } = useI18n()
  const [active, setActive] = useState(null)
  const capture = useRef(null)
  const finish = () => {
    window.api.endPanelResize()
    setActive(null)
    const held = capture.current
    capture.current = null
    if (held?.element.hasPointerCapture(held.id)) held.element.releasePointerCapture(held.id)
  }
  useEffect(
    () =>
      window.api.onPanelResizeEnded(() => {
        setActive(null)
        const held = capture.current
        capture.current = null
        if (held?.element.hasPointerCapture(held.id)) held.element.releasePointerCapture(held.id)
      }),
    []
  )
  return (
    <div className={`resize-handles dock-${edge}`}>
      {['width', 'height', 'both'].map((axis) => (
        <div
          key={axis}
          className={`resize-handle resize-${axis}${active === axis ? ' active' : ''}`}
          title={t('settings.resizeHint')}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.preventDefault()
            event.stopPropagation()
            event.currentTarget.setPointerCapture(event.pointerId)
            capture.current = { element: event.currentTarget, id: event.pointerId }
            setActive(axis)
            window.api.startPanelResize(axis)
          }}
          onPointerUp={finish}
          onPointerCancel={finish}
          onLostPointerCapture={() => {
            if (capture.current) finish()
          }}
        />
      ))}
    </div>
  )
}
