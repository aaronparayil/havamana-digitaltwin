import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Compass, X } from 'lucide-react'
import { TOUR_STEPS } from './tourSteps'
import { TourContext } from './tourContext'
import './Tour.css'

/* ==========================================================================
   Guided tour
   --------------------------------------------------------------------------
   A spotlight that moves across the site with a pointer card beside it.
   Steps live in tourSteps.js; each can name a route to be on, an element to
   click first (to open a tab, load a replay), and the element to point at,
   all by [data-tour] anchors in the markup.

   The spotlight follows its target every animation frame, so it stays
   glued to the element through scrolling, lazy content and page changes.
   Whether the visitor has seen the tour is a per-browser convenience, kept
   in localStorage and wrapped because storage can be unavailable.
   ========================================================================== */

const DONE_KEY = 'havamana.tour.done'
const PAD = 8          // spotlight breathing room around the target
const GAP = 16         // distance from target to card, including the arrow
const EDGE = 12        // minimum distance from the window edge

function storageGet(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value) } catch { /* storage unavailable */ }
}

const reduceMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Resolves with the first visible match for `selector`, or null after `timeout` ms. */
function waitFor(selector, timeout = 6000) {
  return new Promise((resolve) => {
    const t0 = performance.now()
    const poll = () => {
      const el = [...document.querySelectorAll(selector)].find((e) => {
        const r = e.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      })
      if (el) return resolve(el)
      if (performance.now() - t0 > timeout) return resolve(null)
      requestAnimationFrame(poll)
    }
    poll()
  })
}

/** Where the card goes relative to the spotlight, and where its arrow points. */
function placeCard(hole, card, vw, vh) {
  if (!hole) return { left: (vw - card.w) / 2, top: (vh - card.h) / 2, side: 'none' }
  const cx = hole.x + hole.w / 2
  const cy = hole.y + hole.h / 2
  const clampX = (x) => Math.max(EDGE, Math.min(x, vw - card.w - EDGE))
  const clampY = (y) => Math.max(EDGE + 56, Math.min(y, vh - card.h - EDGE))
  const room = {
    bottom: vh - (hole.y + hole.h),
    top: hole.y - 56, // the sticky top bar covers the first 56 px
    right: vw - (hole.x + hole.w),
    left: hole.x,
  }
  for (const side of ['bottom', 'top', 'right', 'left']) {
    const vertical = side === 'bottom' || side === 'top'
    if (room[side] < (vertical ? card.h : card.w) + GAP + EDGE) continue
    if (vertical) {
      const left = clampX(cx - card.w / 2)
      const top = side === 'bottom' ? hole.y + hole.h + GAP : hole.y - card.h - GAP
      return { left, top, side, arrow: Math.max(20, Math.min(cx - left, card.w - 20)) }
    }
    const top = clampY(cy - card.h / 2)
    const left = side === 'right' ? hole.x + hole.w + GAP : hole.x - card.w - GAP
    return { left, top, side, arrow: Math.max(20, Math.min(cy - top, card.h - 20)) }
  }
  // Target fills the screen (the globe, a big map): sit inside it, bottom-right.
  return {
    left: clampX(Math.min(hole.x + hole.w, vw) - card.w - 20),
    top: clampY(Math.min(hole.y + hole.h, vh) - card.h - 20),
    side: 'inside',
  }
}

function TourOverlay({ step, setStep, onClose }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const pathRef = useRef(pathname)
  pathRef.current = pathname

  const s = TOUR_STEPS[step]
  const targetRef = useRef(null)
  const cardRef = useRef(null)
  const nextRef = useRef(null)
  const [hole, setHole] = useState(null)
  const [cardSize, setCardSize] = useState({ w: 340, h: 200 })
  const [busy, setBusy] = useState(true)
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })

  const last = step === TOUR_STEPS.length - 1
  const next = useCallback(() => (last ? onClose(true) : setStep((n) => n + 1)), [last, onClose, setStep])
  const back = useCallback(() => setStep((n) => Math.max(0, n - 1)), [setStep])

  /* Get to the step: right page, any setup click, then find and scroll to
     the target. A missing target is not fatal: the card shows centred. */
  useEffect(() => {
    let cancelled = false
    setBusy(true)
    ;(async () => {
      if (s.route && pathRef.current !== s.route) {
        navigate(s.route, { viewTransition: true })
      }
      if (s.before) {
        const b = await waitFor(s.before, 5000)
        if (cancelled) return
        b?.click()
      }
      const el = s.target ? await waitFor(s.target, s.wait ?? 6000) : null
      if (cancelled) return
      targetRef.current = el
      if (el) {
        const tall = el.getBoundingClientRect().height > window.innerHeight - 320
        el.scrollIntoView({ block: tall ? 'start' : 'center', behavior: reduceMotion() ? 'auto' : 'smooth' })
      }
      setBusy(false)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // Follow the target every frame: scrolling, layout shifts, lazy content.
  useEffect(() => {
    let raf
    const tick = () => {
      const el = targetRef.current
      if (!busy && el?.isConnected) {
        const r = el.getBoundingClientRect()
        setHole((h) => {
          const n = { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 }
          return h && Math.abs(h.x - n.x) < 0.5 && Math.abs(h.y - n.y) < 0.5 && Math.abs(h.w - n.w) < 0.5 && Math.abs(h.h - n.h) < 0.5 ? h : n
        })
      } else if (!busy) {
        setHole(null)
      }
      setVp((v) => (v.w === window.innerWidth && v.h === window.innerHeight ? v : { w: window.innerWidth, h: window.innerHeight }))
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [busy])

  // Measure the card so placement knows its real size.
  useLayoutEffect(() => {
    const el = cardRef.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    setCardSize((c) => (c.w === w && c.h === h ? c : { w, h }))
  }, [step, busy, vp.w])

  useEffect(() => { if (!busy) nextRef.current?.focus({ preventScroll: true }) }, [busy, step])

  /* Keys drive the tour while it is open. Captured and stopped here so the
     Model page's own arrow-key and Space shortcuts don't also fire. */
  useEffect(() => {
    const onKey = (e) => {
      const map = { ArrowRight: next, Enter: next, ArrowLeft: back, Escape: () => onClose(false) }
      const fn = map[e.key]
      if (!fn) return
      e.preventDefault()
      e.stopImmediatePropagation()
      fn()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [next, back, onClose])

  const pos = placeCard(busy ? null : hole, cardSize, vp.w, vp.h)
  const blockers = hole && !busy
    ? [
        { left: 0, top: 0, width: vp.w, height: Math.max(0, hole.y) },
        { left: 0, top: hole.y + hole.h, width: vp.w, height: Math.max(0, vp.h - hole.y - hole.h) },
        { left: 0, top: hole.y, width: Math.max(0, hole.x), height: hole.h },
        { left: hole.x + hole.w, top: hole.y, width: Math.max(0, vp.w - hole.x - hole.w), height: hole.h },
      ]
    : [{ left: 0, top: 0, width: vp.w, height: vp.h }]

  return (
    <div className="tour-root">
      {/* Clicks outside the spotlight are absorbed; the highlighted element
          itself stays usable, so people can try what they're shown. */}
      {blockers.map((b, i) => <div key={i} className="tour-blocker" style={b} />)}

      <div
        className={`tour-spotlight ${hole && !busy ? '' : 'is-empty'}`}
        style={hole && !busy
          ? { left: hole.x, top: hole.y, width: hole.w, height: hole.h }
          : { left: vp.w / 2, top: vp.h / 2, width: 0, height: 0 }}
      />

      <div
        ref={cardRef}
        className={`tour-card side-${pos.side} ${busy ? 'is-busy' : ''}`}
        style={{ left: pos.left, top: pos.top, '--arrow': `${pos.arrow ?? 0}px` }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
      >
        {pos.side !== 'none' && pos.side !== 'inside' && <span className="tour-arrow" aria-hidden="true" />}

        <div className="tour-top">
          <span className="tour-count">
            <Compass size={12} /> Step {step + 1} of {TOUR_STEPS.length}
          </span>
          <button className="tour-x" onClick={() => onClose(false)} aria-label="End the tour">
            <X size={15} />
          </button>
        </div>

        <h2 id="tour-title">{s.title}</h2>
        <p id="tour-body" aria-live="polite">{s.body}</p>

        <div className="tour-progress" aria-hidden="true">
          {TOUR_STEPS.map((_, i) => (
            <i key={i} className={i === step ? 'is-now' : i < step ? 'is-done' : ''} />
          ))}
        </div>

        <div className="tour-actions">
          <button className="tour-skip" onClick={() => onClose(false)}>Skip tour</button>
          <div className="tour-nav">
            {step > 0 && (
              <button className="tour-back" onClick={back}>
                <ArrowLeft size={14} /> Back
              </button>
            )}
            <button ref={nextRef} className="tour-next" onClick={next} disabled={busy}>
              {busy ? 'Loading…' : last ? 'Finish' : 'Next'} {!busy && !last && <ArrowRight size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** First-visit prompt, bottom-right. Shown once per browser. */
function TourOffer({ onStart, suppressed }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (storageGet(DONE_KEY)) return undefined
    const t = setTimeout(() => setShow(true), 1400)
    return () => clearTimeout(t)
  }, [])

  if (!show || suppressed) return null
  const decline = () => {
    storageSet(DONE_KEY, 'declined')
    setShow(false)
  }
  return (
    <div className="tour-offer" role="dialog" aria-label="Guided tour">
      <span className="tour-offer-icon"><Compass size={18} /></span>
      <div>
        <strong>New here?</strong>
        <span>Take a 1-minute guided tour of the site.</span>
      </div>
      <div className="tour-offer-actions">
        <button className="tour-next" onClick={() => { setShow(false); onStart() }}>Start tour</button>
        <button className="tour-skip" onClick={decline}>No thanks</button>
      </div>
    </div>
  )
}

export function TourProvider({ children }) {
  const [step, setStep] = useState(-1) // -1 = not running
  const start = useCallback(() => setStep(0), [])
  const close = useCallback(() => {
    storageSet(DONE_KEY, 'seen')
    setStep(-1)
  }, [])

  return (
    <TourContext.Provider value={{ start, active: step >= 0 }}>
      {children}
      {step >= 0 && <TourOverlay step={step} setStep={setStep} onClose={close} />}
      <TourOffer onStart={start} suppressed={step >= 0} />
    </TourContext.Provider>
  )
}
