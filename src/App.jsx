import { useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { TopBar } from './components/TopBar'
import { useApiHealth } from './hooks/useApiHealth'
import { Dashboard } from './pages/Dashboard'
import { ModelSimulation } from './pages/ModelSimulation'
import { Comparisons } from './pages/Comparisons'
import { Scenarios } from './pages/Scenarios'
import './App.css'

// Browser-tab titles, so a presenter with several tabs open can find each page.
const TITLES = {
  '/': 'Live conditions',
  '/model-test': 'Karnataka forecast',
  '/comparisons': 'Model accuracy',
  '/scenarios': 'What-If (coming soon)',
}

function App() {
  const health = useApiHealth()
  const { pathname } = useLocation()

  // New page: start at the top and name the tab after it.
  useEffect(() => {
    window.scrollTo(0, 0)
    document.title = `${TITLES[pathname] ?? 'HavaMana'} · HavaMana`
  }, [pathname])

  /* The model-service light. It was once hardcoded to "active" with a green
     dot even when nothing was serving; it now reports what is actually there,
     and distinguishes "API up on baselines" from "trained model loaded". */
  const statusPill = {
    checking: { cls: 'is-checking', text: 'Checking model' },
    online: health.modelLoaded
      ? { cls: 'is-live', text: 'Model active' }
      : { cls: 'is-warn', text: 'Baselines only' },
    offline: { cls: 'is-warn', text: 'Model offline' },
  }[health.state]

  return (
    <div className="app-shell">

      <TopBar
        status={
          <span className={`svc-pill ${statusPill.cls}`} title="Forecast API status">
            <i />
            {statusPill.text}
          </span>
        }
      />

      <main className="main-content">
        <ErrorBoundary resetKey={pathname}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/model-test" element={<ModelSimulation />} />
          <Route path="/comparisons" element={<Comparisons />} />
          <Route path="/scenarios" element={<Scenarios />} />
        </Routes>
        </ErrorBoundary>
      </main>
    </div>
  )
}

export default App
