import { useState } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import { Menu, X, Wind, Settings2, LayoutDashboard, MapPinned, BarChart3 } from 'lucide-react'
import { Navbar } from './components/Navbar'
import { Dashboard } from './pages/Dashboard'
import { Analytics } from './pages/Analytics'
import { Data } from './pages/Data'
import { Reports } from './pages/Reports'
import 'leaflet/dist/leaflet.css'
import './App.css'

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="app-shell">
      <Navbar />
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="brand-mark">
          <span>◎</span>
          <div>
            <strong>climate</strong>
            <small>digital twin / india</small>
          </div>
        </div>
        <button className="close-sidebar" onClick={() => setSidebarOpen(false)} aria-label="Close navigation">
          <X size={20} />
        </button>
        <div className="side-label">Workspace</div>
        <nav>
          <Link className="nav-item" to="/" onClick={() => setSidebarOpen(false)}>
            <LayoutDashboard size={18} /> Overview
          </Link>
          <div className="nav-item-wrap">
            <button className="nav-item disabled">
              <MapPinned size={18} /> Climate map
            </button>
            <span className="coming-soon-tip">Coming soon</span>
          </div>
          <div className="nav-item-wrap">
            <button className="nav-item disabled">
              <BarChart3 size={18} /> Comparisons
            </button>
            <span className="coming-soon-tip">Coming soon</span>
          </div>
        </nav>
        <div className="side-label second">Tools</div>
        <nav>
          <div className="nav-item-wrap">
            <button className="nav-item disabled">
              <Wind size={18} /> Air quality
            </button>
            <span className="coming-soon-tip">Coming soon</span>
          </div>
          <div className="nav-item-wrap">
            <button className="nav-item disabled">
              <Settings2 size={18} /> Scenarios
            </button>
            <span className="coming-soon-tip">Coming soon</span>
          </div>
        </nav>
        <div className="sidebar-foot">
          <div className="signal-dot" />
          <div>
            <strong>Data systems online</strong>
            <small>Last synced 8 min ago</small>
          </div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <button className="menu-button" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Open navigation">
            <Menu size={22} />
          </button>
          <div className="breadcrumb">
            Karnataka / <strong>Bengaluru pilot</strong>
            <span className="poc-badge"><i />Proof of concept</span>
          </div>
          <div className="top-actions">
            {/* Top actions handled by Navbar */}
          </div>
        </header>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/data" element={<Data />} />
          <Route path="/reports" element={<Reports />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
