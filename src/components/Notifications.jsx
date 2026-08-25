import { X, AlertCircle, TrendingUp, CloudRain, CheckCircle } from 'lucide-react'
import './Notifications.css'

export function Notifications({ isOpen, onClose }) {
  const notifications = [
    { id: 1, type: 'alert', title: 'High Temperature Alert', message: 'Temperature in Bengaluru exceeds seasonal average by 2.5°C', time: '2 min ago', icon: AlertCircle },
    { id: 2, type: 'info', title: 'Rainfall Update', message: 'Monsoon expected to continue through next week across Karnataka', time: '45 min ago', icon: CloudRain },
    { id: 3, type: 'success', title: 'Data Sync Complete', message: 'All climate datasets updated successfully', time: '3 hours ago', icon: CheckCircle },
    { id: 4, type: 'trend', title: 'Trend Analysis Ready', message: 'New annual trend report is now available', time: '1 day ago', icon: TrendingUp },
  ]

  if (!isOpen) return null

  return (
    <div className="notifications-panel" onClick={(e) => e.stopPropagation()}>
      <div className="notifications-header">
        <h3>Notifications</h3>
        <button className="notifications-close" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="notifications-list">
        {notifications.length === 0 ? (
          <div className="notifications-empty">
            <p>No notifications</p>
          </div>
        ) : (
          notifications.map((notif) => {
            const Icon = notif.icon
            return (
              <div key={notif.id} className={`notification-item notification-${notif.type}`}>
                <Icon size={18} className="notification-icon" />
                <div className="notification-content">
                  <div className="notification-title">{notif.title}</div>
                  <div className="notification-message">{notif.message}</div>
                </div>
                <div className="notification-time">{notif.time}</div>
              </div>
            )
          })
        )}
      </div>

      <div className="notifications-footer">
        <button className="notifications-action">View all notifications</button>
      </div>
    </div>
  )
}
