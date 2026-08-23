import { useState } from 'react'
import { BarChart3, Bell, ChevronDown, CloudRain, Droplets, LayoutDashboard, MapPinned, Menu, Search, Settings2, Thermometer, Wind, X } from 'lucide-react'
import { Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler } from 'chart.js'
import { CircleMarker, MapContainer, TileLayer, Tooltip as MapTooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

const states = [
  { name: 'Bengaluru', short: 'BLR', temp: '28.4°C', rain: '12 mm', risk: 'Moderate', air: 68, position: [12.97, 77.59], color: '#d18b3d' },
  { name: 'Mysuru', short: 'MYS', temp: '27.8°C', rain: '16 mm', risk: 'Low', air: 47, position: [12.3, 76.65], color: '#2b8a72' },
  { name: 'Mangaluru', short: 'MLR', temp: '29.1°C', rain: '38 mm', risk: 'High', air: 42, position: [12.91, 74.86], color: '#c35a4c' },
  { name: 'Hubballi-Dharwad', short: 'HBL', temp: '30.2°C', rain: '7 mm', risk: 'Low', air: 55, position: [15.36, 75.12], color: '#2b8a72' },
  { name: 'Belagavi', short: 'BLG', temp: '28.9°C', rain: '10 mm', risk: 'Moderate', air: 61, position: [15.85, 74.5], color: '#d18b3d' },
  { name: 'Shivamogga', short: 'SHI', temp: '27.2°C', rain: '22 mm', risk: 'High', air: 38, position: [13.93, 75.57], color: '#c35a4c' },
]
const metrics = {
  temperature: { label: 'Temperature', value: '31.8°C', delta: '+1.2°', note: 'vs. seasonal average', icon: Thermometer, color: 'orange', data: [28, 29, 29.5, 30, 30.8, 31, 31.8] },
  rainfall: { label: 'Rainfall', value: '6 mm', delta: '-18%', note: 'last 7 days', icon: CloudRain, color: 'blue', data: [21, 14, 12, 18, 9, 13, 6] },
  flood: { label: 'Flood risk', value: 'Moderate', delta: '3 districts', note: 'need attention', icon: Droplets, color: 'red', data: [42, 47, 44, 58, 61, 55, 64] },
  air: { label: 'Air quality', value: '68 AQI', delta: 'Good', note: 'national average', icon: Wind, color: 'green', data: [72, 76, 69, 64, 71, 66, 68] },
}

function App() {
  const [activeMetric, setActiveMetric] = useState('temperature')
  const [selectedState, setSelectedState] = useState('Bengaluru')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const metric = metrics[activeMetric]
  const selected = states.find((state) => state.name === selectedState) ?? states[0]
  const chartData = { labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'], datasets: [{ data: metric.data, borderColor: '#d16f43', backgroundColor: 'rgba(209,111,67,.12)', fill: true, tension: .4, pointRadius: 3, pointBackgroundColor: '#f7f3ea', pointBorderColor: '#d16f43', pointBorderWidth: 2 }] }
  const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { displayColors: false, backgroundColor: '#173c3a', padding: 10 } }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: '#84908b' } }, y: { grid: { color: '#e8e5dc' }, border: { display: false }, ticks: { color: '#84908b' } } } }
  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
      <div className="brand-mark"><span>◎</span><div><strong>climate</strong><small>digital twin / india</small></div></div>
      <button className="close-sidebar" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><X size={20} /></button>
      <div className="side-label">Workspace</div>
      <nav><button className="nav-item active"><LayoutDashboard size={18} /> Overview</button><button className="nav-item"><MapPinned size={18} /> Climate map</button><button className="nav-item"><BarChart3 size={18} /> Comparisons</button></nav>
      <div className="side-label second">Tools</div><nav><button className="nav-item"><Wind size={18} /> Air quality</button><button className="nav-item"><Settings2 size={18} /> Scenarios</button></nav>
      <div className="sidebar-foot"><div className="signal-dot" /><div><strong>Data systems online</strong><small>Last synced 8 min ago</small></div></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={22} /></button><div className="breadcrumb">Karnataka / <strong>Bengaluru pilot</strong></div><div className="top-actions"><button className="icon-button" aria-label="Search"><Search size={18} /></button><button className="icon-button notification" aria-label="Notifications"><Bell size={18} /><span /></button><div className="avatar">AR</div><span className="user-name">Aaron</span><ChevronDown size={15} /></div></header>
      <div className="content-wrap">
        <section className="page-heading"><div><div className="eyebrow">Saturday, 23 August 2026 <span className="live-pill"><i /> Live conditions</span></div><h1>Bengaluru climate overview</h1><p>A clear view of the signals shaping Karnataka’s pilot region, today and ahead.</p></div><button className="date-control">Last 7 days <ChevronDown size={16} /></button></section>
        <section className="metrics-grid">{Object.entries(metrics).map(([key, item]) => { const Icon = item.icon; return <button key={key} className={`metric-card ${activeMetric === key ? 'selected' : ''}`} onClick={() => setActiveMetric(key)}><div className={`metric-icon ${item.color}`}><Icon size={19} /></div><div className="metric-copy"><span>{item.label}</span><strong>{item.value}</strong><small className={item.delta.startsWith('+') || item.delta === 'Moderate' ? 'warm' : 'cool'}>{item.delta} <em>{item.note}</em></small></div></button> })}</section>
        <section className="primary-grid"><div className="panel map-panel"><div className="panel-heading"><div><span className="section-kicker">Pilot region / Karnataka</span><h2>Climate signals around Bengaluru</h2></div><button className="panel-action">Explore map <span>↗</span></button></div><div className="map-wrap"><MapContainer center={[14.2, 76.1]} zoom={7} scrollWheelZoom={false} zoomControl={false} attributionControl={false}><TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />{states.map((state) => <CircleMarker key={state.name} center={state.position} radius={state.name === selectedState ? 13 : 9} pathOptions={{ color: '#f7f3ea', weight: 3, fillColor: state.color, fillOpacity: .9 }} eventHandlers={{ click: () => setSelectedState(state.name) }}><MapTooltip direction="top"><strong>{state.name}</strong><br />{state.temp} · {state.risk} flood risk</MapTooltip></CircleMarker>)}</MapContainer><div className="map-legend"><span><i className="legend-low" /> Low</span><span><i className="legend-mid" /> Moderate</span><span><i className="legend-high" /> High</span></div></div><div className="map-footer"><span><i className="pulse" /> 6 locations reporting</span><button>View Bengaluru detail <span>→</span></button></div></div>
          <div className="panel trend-panel"><div className="panel-heading"><div><span className="section-kicker">National trend</span><h2>{metric.label} over time</h2></div><button className="more-button" aria-label="More options">•••</button></div><div className="trend-summary"><strong>{metric.value}</strong><span className="trend-up">{metric.delta} <small>this week</small></span></div><div className="chart-box"><Line data={chartData} options={chartOptions} /></div><div className="chart-footer"><span>Jan 2026</span><span>Jul 2026</span></div></div></section>
        <section className="lower-grid"><div className="panel comparison-panel"><div className="panel-heading"><div><span className="section-kicker">Regional intelligence</span><h2>State comparison</h2></div><button className="panel-action">See all <span>↗</span></button></div><div className="table-head"><span>State</span><span>Temperature</span><span>Rainfall</span><span>Flood risk</span><span>AQI</span></div>{states.slice(0, 4).map((state) => <button className={`state-row ${state.name === selectedState ? 'active-row' : ''}`} key={state.name} onClick={() => setSelectedState(state.name)}><span className="state-name"><b>{state.short}</b>{state.name}</span><strong>{state.temp}</strong><span>{state.rain}</span><span className={`risk ${state.risk.toLowerCase()}`}>{state.risk}</span><span>{state.air}</span></button>)}</div><div className="panel selected-panel"><div className="selected-top"><span className="section-kicker">Selected state</span><span className="status-tag">● Monitoring</span></div><h2>{selected.name}</h2><p>Current conditions and near-term outlook</p><div className="state-highlight"><div><Thermometer size={17} /><strong>{selected.temp}</strong><span>Feels like 34°</span></div><div><CloudRain size={17} /><strong>{selected.rain}</strong><span>Rainfall this week</span></div></div><button className="full-button">Open {selected.name} profile <span>→</span></button></div></section>
      </div>
    </main>
  </div>
}
export default App
