import { User, Settings, LogOut, ChevronRight } from 'lucide-react'
import './Profile.css'

export function ProfileMenu({ isOpen, onClose }) {
  const user = {
    name: 'Aaron Rivera',
    email: 'aaron@havamana.org',
    role: 'Climate Data Analyst',
    avatar: 'AR',
  }

  const menuItems = [
    { icon: User, label: 'My Profile', href: '#' },
    { icon: Settings, label: 'Settings & Preferences', href: '#' },
  ]

  if (!isOpen) return null

  return (
    <div className="profile-menu" onClick={(e) => e.stopPropagation()}>
      <div className="profile-header">
        <div className="profile-avatar-large">{user.avatar}</div>
        <div className="profile-info">
          <div className="profile-name">{user.name}</div>
          <div className="profile-role">{user.role}</div>
          <div className="profile-email">{user.email}</div>
        </div>
      </div>

      <div className="profile-divider"></div>

      <nav className="profile-nav">
        {menuItems.map((item, idx) => {
          const Icon = item.icon
          return (
            <a key={idx} href={item.href} className="profile-menu-item" onClick={onClose}>
              <Icon size={16} className="menu-icon" />
              <span>{item.label}</span>
              <ChevronRight size={14} className="menu-arrow" />
            </a>
          )
        })}
      </nav>

      <div className="profile-divider"></div>

      <button className="profile-logout">
        <LogOut size={16} />
        <span>Sign out</span>
      </button>
    </div>
  )
}
