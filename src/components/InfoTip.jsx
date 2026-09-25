import { useEffect, useId, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import './InfoTip.css'

const BUBBLE_W = 280
const GAP = 8

/**
 * A small ⓘ next to a piece of jargon. Opens on hover, on keyboard focus,
 * and on tap (for touch screens, where there is no hover). The text is tied
 * to the button with aria-describedby so screen readers announce it.
 *
 * The bubble is position: fixed, placed from the button's on-screen rect.
 * Tips live inside cards and scrolling tables that clip overflow; an
 * absolutely positioned bubble got cut off there. It flips above the button
 * near the bottom of the window and is kept inside the window sideways.
 */
export function InfoTip({ children, label = 'What does this mean?' }) {
  const [pos, setPos] = useState(null) // null = closed
  const btnRef = useRef(null)
  const id = useId()

  const show = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const left = Math.max(GAP, Math.min(r.left - GAP, window.innerWidth - BUBBLE_W - GAP))
    const below = r.bottom + GAP
    const flip = below + 160 > window.innerHeight
    setPos(flip ? { left, bottom: window.innerHeight - r.top + GAP } : { left, top: below })
  }
  const hide = () => setPos(null)

  // A fixed bubble would stay put while the page scrolls under it; close it.
  useEffect(() => {
    if (!pos) return undefined
    window.addEventListener('scroll', hide, { passive: true, capture: true })
    window.addEventListener('resize', hide)
    return () => {
      window.removeEventListener('scroll', hide, { capture: true })
      window.removeEventListener('resize', hide)
    }
  }, [pos])

  return (
    <span
      className={`infotip ${pos ? 'is-open' : ''}`}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <button
        ref={btnRef}
        type="button"
        className="infotip-btn"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={Boolean(pos)}
        onClick={(e) => { e.stopPropagation(); if (pos) hide(); else show() }}
        onFocus={show}
        onBlur={hide}
        onKeyDown={(e) => { if (e.key === 'Escape') hide() }}
      >
        <Info size={12} />
      </button>
      <span
        role="tooltip"
        id={id}
        className="infotip-bubble"
        style={pos ?? undefined}
      >
        {children}
      </span>
    </span>
  )
}
