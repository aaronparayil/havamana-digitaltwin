import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Chart as ChartJS } from 'chart.js'
import './index.css'
import './styles/motion.css'
import { installChartDefaults } from './styles/chartTheme'
import App from './App.jsx'

// motion.css falls back to a plain fade where View Transitions are missing.
if (typeof document !== 'undefined' && 'startViewTransition' in document) {
  document.documentElement.classList.add('has-vt')
}

// One dark theme for every chart in the app, applied before anything renders.
installChartDefaults(ChartJS)

/* A data router, not <BrowserRouter>: React Router only honours the
   `viewTransition` prop on links under a data router, and silently ignores
   it otherwise. App keeps its own <Routes>, so one catch-all route is enough. */
const router = createBrowserRouter([{ path: '*', element: <App /> }])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
