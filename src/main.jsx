import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Chart as ChartJS } from 'chart.js'
import './index.css'
import { installChartDefaults } from './styles/chartTheme'
import App from './App.jsx'

// One dark theme for every chart in the app, applied before anything renders.
installChartDefaults(ChartJS)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
