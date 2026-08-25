import { X, Search as SearchIcon } from 'lucide-react'
import { useState } from 'react'
import './Search.css'

export function SearchModal({ isOpen, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])

  const searchData = [
    { id: 1, title: 'Bengaluru Climate Overview', category: 'Dashboard', url: '#' },
    { id: 2, title: 'Temperature Trends Analysis', category: 'Analytics', url: '#' },
    { id: 3, title: 'Rainfall Dataset 2025', category: 'Data', url: '#' },
    { id: 4, title: 'Q3 2025 Climate Summary', category: 'Reports', url: '#' },
    { id: 5, title: 'Monsoon Season Analysis', category: 'Reports', url: '#' },
    { id: 6, title: 'Flood Risk Assessment', category: 'Data', url: '#' },
    { id: 7, title: 'Air Quality Index Report', category: 'Analytics', url: '#' },
    { id: 8, title: 'Regional Drought Assessment', category: 'Reports', url: '#' },
  ]

  const handleSearch = (value) => {
    setQuery(value)
    if (value.trim()) {
      const filtered = searchData.filter((item) =>
        item.title.toLowerCase().includes(value.toLowerCase()) ||
        item.category.toLowerCase().includes(value.toLowerCase())
      )
      setResults(filtered)
    } else {
      setResults([])
    }
  }

  if (!isOpen) return null

  return (
    <div className="search-modal-overlay" onClick={onClose}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="search-modal-header">
          <div className="search-input-wrapper">
            <SearchIcon size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search dashboards, reports, data..."
              className="search-input"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              autoFocus
            />
          </div>
          <button className="search-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="search-results">
          {query.trim() === '' ? (
            <div className="search-empty">
              <p>Try searching for dashboards, reports, or data</p>
            </div>
          ) : results.length === 0 ? (
            <div className="search-empty">
              <p>No results found for "{query}"</p>
            </div>
          ) : (
            <>
              <div className="search-result-count">{results.length} results found</div>
              {results.map((result) => (
                <a key={result.id} href={result.url} className="search-result-item" onClick={onClose}>
                  <div className="result-content">
                    <div className="result-title">{result.title}</div>
                    <div className="result-category">{result.category}</div>
                  </div>
                  <div className="result-arrow">→</div>
                </a>
              ))}
            </>
          )}
        </div>

        <div className="search-footer">
          <span className="search-hint">⌘K to open / ESC to close</span>
        </div>
      </div>
    </div>
  )
}
