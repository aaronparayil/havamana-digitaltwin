import { Routes, Route } from 'react-router-dom'
import { TopBar } from './components/TopBar'
import { useApiHealth } from './hooks/useApiHealth'
import { Dashboard } from './pages/Dashboard'
import { ModelSimulation } from './pages/ModelSimulation'
import { Comparisons } from './pages/Comparisons'
import { Scenarios } from './pages/Scenarios'
import './App.css'

function App() {
  const health = useApiHealth()

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
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/model-test" element={<ModelSimulation />} />
          <Route path="/comparisons" element={<Comparisons />} />
          <Route path="/scenarios" element={<Scenarios />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
