import { useEffect, useRef, useState } from 'react'

const FOCUSABLE = 'button:not(:disabled), select, input:not(:disabled), textarea, summary, [href]'

const focusables = (root) =>
  [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length)

// 모달 공통: dialog 역할, Esc·배경 클릭으로 닫기, Tab 포커스 가두기, 닫으면 원래 위치로 포커스 복귀.
// onClose가 없으면(첫 실행 안내처럼 버튼으로만 닫는 창) Esc·배경 클릭을 무시한다.
function Dialog({
  onClose,
  labelledBy,
  className = '',
  backdropClassName = '',
  closeOnBackdrop = true,
  children
}) {
  const ref = useRef(null)
  // 첫 렌더 시점(자식 autoFocus 전)의 포커스 = 창을 연 버튼
  const [opener] = useState(() => document.activeElement)

  useEffect(() => {
    const root = ref.current
    if (root && !root.contains(document.activeElement)) focusables(root)[0]?.focus()
    return () => opener?.focus?.()
  }, [opener])

  const onKeyDown = (event) => {
    if (event.key === 'Escape' && onClose) {
      event.stopPropagation()
      onClose()
    }
    if (event.key === 'Tab' && ref.current) {
      const items = focusables(ref.current)
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
  }

  return (
    <div
      className={`modal-backdrop ${backdropClassName}`.trim()}
      onMouseDown={closeOnBackdrop ? onClose : undefined}
      onKeyDown={onKeyDown}
    >
      <div
        ref={ref}
        className={`modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

export default Dialog
