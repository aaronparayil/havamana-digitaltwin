import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { SearchModal } from './Search'
import { Notifications } from './Notifications'
import { ProfileMenu } from './Profile'
import './Navbar.css'

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  const closeMenu = () => {
    setIsOpen(false)
  }

  const navLinks = [
    { label: 'Dashboard', to: '/' },
    { label: 'Analytics', to: '/analytics' },
    { label: 'Data', to: '/data' },
    { label: 'Reports', to: '/reports' },
  ]

  return (
    <nav className="navbar">
      <div className="navbar-container">
        {/* Logo Section */}
        <div className="navbar-brand">
          <span className="navbar-logo">🌍</span>
          <div className="navbar-title">
            <strong>HavaMana</strong>
            <small>Climate Analytics</small>
          </div>
        </div>

        {/* Desktop Navigation Links */}
        <ul className="navbar-menu">
          {navLinks.map((link, idx) => (
            <li key={idx}>
              <NavLink
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                to={link.to}
                end={link.to === '/'}
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>

        {/* Right Section - Actions */}
        <div className="navbar-actions">
          <button className="action-button" aria-label="Search" onClick={() => setSearchOpen(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
          </button>
          <button className="action-button" aria-label="Notifications" onClick={() => setNotificationsOpen(!notificationsOpen)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            <span className="notification-badge"></span>
          </button>
          <button className="action-button avatar-button" onClick={() => setProfileOpen(!profileOpen)}>
            <div className="avatar-sm">AR</div>
          </button>
        </div>

        {/* Mobile Menu Button */}
        <button
          className="mobile-menu-toggle"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Toggle menu"
          aria-expanded={isOpen}
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        {/* Notifications Panel */}
        {notificationsOpen && (
          <div onClick={(e) => e.stopPropagation()}>
            <Notifications isOpen={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
          </div>
        )}

        {/* Profile Menu */}
        {profileOpen && (
          <div onClick={(e) => e.stopPropagation()}>
            <ProfileMenu isOpen={profileOpen} onClose={() => setProfileOpen(false)} />
          </div>
        )}
      </div>

      {/* Mobile Navigation Menu */}
      <div className={`mobile-menu ${isOpen ? 'is-open' : ''}`}>
        <ul className="mobile-nav-links">
          {navLinks.map((link, idx) => (
            <li key={idx}>
              <NavLink
                className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}
                to={link.to}
                end={link.to === '/'}
                onClick={closeMenu}
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>

      {/* Search Modal */}
      <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </nav>
  )
}
