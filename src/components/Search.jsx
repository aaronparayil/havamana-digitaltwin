import { X, Search as SearchIcon } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './Search.css'

/* Destinations that actually exist. This used to be eight invented entries
   ("Q3 2025 Climate Summary", "Flood Risk Assessment", …) all pointing at
   `url: '#'` — results that went nowhere, filed under pages that have now
   been deleted. Search should only ever offer somewhere it can take you. */
const DESTINATIONS = [
  {
    id: 'overview',
    title: 'India live conditions',
    category: 'Overview',
    keywords: 'globe wind temperature precipitation aqi air quality pm2.5 cities live',
    to: '/',
  },
  {
    id: 'model',
    title: 'Karnataka forecast — ConvLSTM2D',
    category: 'Model Simulation',
    keywords: 'forecast convlstm model rainfall tmax tmin grid terrain 3d lead day karnataka',
    to: '/model-test',
  },
  {
    id: 'comparisons',
    title: 'Benchmark comparisons',
    category: 'Comparisons',
    keywords: 'benchmark baseline persistence climatology linear trend mae rmse r2 accuracy',
    to: '/comparisons',
  },
  {
    id: 'scenarios',
    title: 'Scenario explorer',
    category: 'Scenarios',
    keywords: 'scenario monsoon heatwave post-monsoon winter lookahead',
    to: '/scenarios',
  },
]

export function SearchModal({ isOpen, onClose }) {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  // Escape closes, and the query resets between openings.
  useEffect(() => {
    if (!isOpen) {
      setQuery('')
      return undefined
    }
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const q = query.trim().toLowerCase()
  // An empty query lists everything, so the modal is a jump-to menu rather
  // than a blank box that demands you guess what it contains.
  const results = q
    ? DESTINATIONS.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.category.toLowerCase().includes(q) ||
          d.keywords.includes(q)
      )
    : DESTINATIONS

  const go = (to) => {
    navigate(to)
    onClose()
  }

  return (
    <div className="search-modal-overlay" onClick={onClose}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Search">
        <div className="search-modal-header">
          <div className="search-input-wrapper">
            <SearchIcon size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Jump to a page…"
              className="search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && results.length) go(results[0].to)
              }}
              autoFocus
            />
          </div>
          <button className="search-close" onClick={onClose} aria-label="Close search">
            <X size={20} />
          </button>
        </div>

        <div className="search-results">
          {results.length === 0 ? (
            <div className="search-empty">
              <p>No page matches “{query}”</p>
            </div>
          ) : (
            <>
              <div className="search-result-count">
                {q ? `${results.length} match${results.length === 1 ? '' : 'es'}` : 'All pages'}
              </div>
              {results.map((result) => (
                <button key={result.id} className="search-result-item" onClick={() => go(result.to)}>
                  <div className="result-content">
                    <div className="result-title">{result.title}</div>
                    <div className="result-category">{result.category}</div>
                  </div>
                  <div className="result-arrow">→</div>
                </button>
              ))}
            </>
          )}
        </div>

        <div className="search-footer">
          <span className="search-hint">↵ to open · ESC to close</span>
        </div>
      </div>
    </div>
  )
}
