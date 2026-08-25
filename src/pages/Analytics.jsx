import { Line, Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Filler } from 'chart.js'
import { TrendingUp, Calendar, ChevronDown } from 'lucide-react'
import '../App.css'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Filler)

export function Analytics() {
  const yearlyTempData = {
    labels: ['2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'],
    datasets: [
      {
        label: 'Max Temperature',
        data: [32.1, 32.8, 33.2, 33.5, 34.1, 33.8, 34.5, 35.2, 35.8, 36.1, 36.4],
        borderColor: '#d16f43',
        backgroundColor: 'rgba(209,111,67,.12)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#f7f3ea',
        pointBorderColor: '#d16f43',
        pointBorderWidth: 2,
      },
    ],
  }

  const rainfallData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    datasets: [
      {
        label: 'Average Rainfall (mm)',
        data: [5, 8, 12, 45, 98, 156, 245, 210, 180, 92, 35, 12],
        backgroundColor: 'rgba(43, 138, 114, 0.8)',
        borderColor: '#2b8a72',
        borderWidth: 1,
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' },
      tooltip: { displayColors: false, backgroundColor: '#173c3a', padding: 10 },
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: '#84908b' } },
      y: { grid: { color: '#e8e5dc' }, border: { display: false }, ticks: { color: '#84908b' } },
    },
  }

  return (
    <div className="content-wrap">
      <section className="page-heading">
        <div>
          <div className="eyebrow">Climate Analytics Dashboard</div>
          <h1>Multi-year trend analysis</h1>
          <p>Historical data and predictive patterns for informed decision-making</p>
        </div>
        <button className="date-control">
          Last 10 years <ChevronDown size={16} />
        </button>
      </section>

      <div className="primary-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Temperature Trends</span>
              <h2>Annual maximum temperature</h2>
            </div>
            <button className="more-button">•••</button>
          </div>
          <div className="chart-box">
            <Line data={yearlyTempData} options={chartOptions} />
          </div>
          <div className="chart-footer">
            <span>2015</span>
            <span>2025</span>
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Key Insights</span>
              <h2>Notable findings</h2>
            </div>
          </div>
          <div style={{ padding: '22px' }}>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <TrendingUp size={18} style={{ color: '#d16f43' }} />
                <strong>Temperature Rise</strong>
              </div>
              <p style={{ margin: 0, color: '#78847e', fontSize: '13px' }}>+4.3°C increase over 10 years, indicating warming trend</p>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <Calendar size={18} style={{ color: '#2b8a72' }} />
                <strong>Rainfall Pattern</strong>
              </div>
              <p style={{ margin: 0, color: '#78847e', fontSize: '13px' }}>Monsoon season (Jun-Sep) accounts for 73% of yearly rainfall</p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '17px' }}>
        <div className="panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Precipitation Analysis</span>
              <h2>Monthly rainfall distribution</h2>
            </div>
          </div>
          <div className="chart-box">
            <Bar data={rainfallData} options={chartOptions} />
          </div>
        </div>
      </div>
    </div>
  )
}
