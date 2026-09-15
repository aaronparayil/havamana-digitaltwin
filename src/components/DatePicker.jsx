import { useState, useRef, useEffect } from 'react'
import { Calendar, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import './DatePicker.css'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

function toISO(date) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function parseISO(isoStr) {
  const [y, m, d] = isoStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatPretty(isoStr) {
  if (!isoStr) return 'Select a date'
  const d = parseISO(isoStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function buildMonthGrid(year, month) {
  const firstOfMonth = new Date(year, month, 1)
  const startWeekday = firstOfMonth.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const cells = []
  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ outside: true, date: new Date(year, month - 1, daysInPrevMonth - i) })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ outside: false, date: new Date(year, month, d) })
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date
    const next = new Date(last)
    next.setDate(next.getDate() + 1)
    cells.push({ outside: true, date: next })
  }
  return cells
}

/**
 * Site-styled calendar date picker (replaces the native <input type="date"> browser widget,
 * which renders with generic OS chrome that clashes with the app's design language).
 * `value` / `onChange` use plain 'YYYY-MM-DD' strings throughout, matching the API contract.
 */
export function DatePicker({ value, onChange, minDate }) {
  const [isOpen, setIsOpen] = useState(false)
  const [viewDate, setViewDate] = useState(() => (value ? parseISO(value) : new Date()))
  const containerRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setViewDate(value ? parseISO(value) : new Date())
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    const handleEscape = (e) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const todayISO = toISO(new Date())
  const cells = buildMonthGrid(viewDate.getFullYear(), viewDate.getMonth())

  const goToPrevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
  const goToNextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))

  const selectDate = (date) => {
    const iso = toISO(date)
    if (minDate && iso < minDate) return
    onChange(iso)
    setIsOpen(false)
  }

  const jumpToToday = () => {
    setViewDate(new Date())
    onChange(todayISO)
    setIsOpen(false)
  }

  return (
    <div className="date-picker-root" ref={containerRef}>
      <button
        type="button"
        className={`date-picker-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen((v) => !v)}
      >
        <Calendar size={14} />
        <span>{formatPretty(value)}</span>
        <ChevronDown size={13} className="date-picker-chevron" />
      </button>

      {isOpen && (
        <div className="date-picker-panel" role="dialog" aria-label="Choose a date">
          <div className="date-picker-header">
            <button type="button" className="date-picker-nav-btn" onClick={goToPrevMonth} aria-label="Previous month">
              <ChevronLeft size={15} />
            </button>
            <span className="date-picker-month-label">
              {MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}
            </span>
            <button type="button" className="date-picker-nav-btn" onClick={goToNextMonth} aria-label="Next month">
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="date-picker-weekdays">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>

          <div className="date-picker-grid">
            {cells.map(({ date, outside }, i) => {
              const iso = toISO(date)
              const isDisabled = Boolean(minDate && iso < minDate)
              const isSelected = iso === value
              const isToday = iso === todayISO
              const classes = [
                'date-picker-cell',
                outside ? 'outside' : '',
                isDisabled ? 'disabled' : '',
                isSelected ? 'selected' : '',
                isToday && !isSelected ? 'today' : ''
              ].filter(Boolean).join(' ')
              return (
                <button
                  type="button"
                  key={iso}
                  className={classes}
                  disabled={isDisabled}
                  onClick={() => selectDate(date)}
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>

          <div className="date-picker-footer">
            <button type="button" className="date-picker-today-btn" onClick={jumpToToday}>
              Jump to Today
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
