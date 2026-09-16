import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { Menu, X, Search as SearchIcon } from 'lucide-react'
import { NAV } from './navItems'
import { SearchModal } from './Search'
import './TopBar.css'

/**
 * The only chrome in the app.
 *
 * This started as a second bar stacked under a Navbar, then absorbed it; now
 * it absorbs the sidebar too. Brand, navigation, live status and search all
 * live in one strip, which hands the entire remaining viewport to the globe.
 */


export function TopBar({ status }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  // Cmd/Ctrl-K opens search, as in every tool this app sits beside.
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <header className="topbar">
      <NavLink className="brand" to="/" end>
        <span className="brand-dot">◎</span>
        <span className="brand-text">
          <strong>HavaMana</strong>
          <small>digital twin / india</small>
        </span>
      </NavLink>

      <nav className={`topnav ${menuOpen ? 'is-open' : ''}`}>
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `topnav-link ${isActive ? 'active' : ''}`}
            onClick={() => setMenuOpen(false)}
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="topbar-spacer" />

      {status}

      <div className="topbar-actions">
        <button
          className="action-button search-trigger"
          aria-label="Search"
          onClick={() => setSearchOpen(true)}
        >
          <SearchIcon size={16} />
          <span className="search-trigger-label">Search</span>
          <kbd>⌘K</kbd>
        </button>

        <button
          className="menu-button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  )
}
