import { useState } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { Menu, X, Wind, Settings2, LayoutDashboard, MapPinned, BarChart3, Activity, Cpu } from 'lucide-react'
import { Navbar } from './components/Navbar'
import { Dashboard } from './pages/Dashboard'
import { Analytics } from './pages/Analytics'
import { Data } from './pages/Data'
import { Reports } from './pages/Reports'
import { ModelSimulation } from './pages/ModelSimulation'
import { Comparisons } from './pages/Comparisons'
import { Scenarios } from './pages/Scenarios'
import 'leaflet/dist/leaflet.css'
import './App.css'

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

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
          <Link className={`nav-item ${location.pathname === '/' ? 'active' : ''}`} to="/" onClick={() => setSidebarOpen(false)}>
            <LayoutDashboard size={18} /> Overview
          </Link>
          <Link className={`nav-item ${location.pathname === '/model-test' ? 'active' : ''}`} to="/model-test" onClick={() => setSidebarOpen(false)}>
            <Activity size={18} /> Model Simulation
          </Link>
          <div className="nav-item-wrap">
            <button className="nav-item disabled">
              <MapPinned size={18} /> Climate map
            </button>
            <span className="coming-soon-tip">Coming soon</span>
          </div>
          <Link className={`nav-item ${location.pathname === '/comparisons' ? 'active' : ''}`} to="/comparisons" onClick={() => setSidebarOpen(false)}>
            <BarChart3 size={18} /> Comparisons
          </Link>
        </nav>
        <div className="side-label second">AI Models & Tools</div>
        <nav>
          <Link className={`nav-item ${location.pathname === '/model-test' ? 'active' : ''}`} to="/model-test" onClick={() => setSidebarOpen(false)}>
            <Cpu size={18} /> ConvLSTM2D Model
          </Link>
          <div className="nav-item-wrap">
            <button className="nav-item disabled">
              <Wind size={18} /> Air quality
            </button>
            <span className="coming-soon-tip">Coming soon</span>
          </div>
          <Link className={`nav-item ${location.pathname === '/scenarios' ? 'active' : ''}`} to="/scenarios" onClick={() => setSidebarOpen(false)}>
            <Settings2 size={18} /> Scenarios
          </Link>
        </nav>
        <div className="sidebar-foot">
          <div className="signal-dot" />
          <div>
            <strong>ConvLSTM model active</strong>
            <small>14-day lookahead sync</small>
          </div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <button className="menu-button" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Open navigation">
            <Menu size={22} />
          </button>
          <div className="breadcrumb">
            India Digital Twin / <strong>Karnataka State Forecast Model</strong>
            <span className="poc-badge"><i />TensorFlow 2.x</span>
          </div>
          <div className="top-actions">
            {/* Top actions handled by Navbar */}
          </div>
        </header>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/model-test" element={<ModelSimulation />} />
          <Route path="/comparisons" element={<Comparisons />} />
          <Route path="/scenarios" element={<Scenarios />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/data" element={<Data />} />
          <Route path="/reports" element={<Reports />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
