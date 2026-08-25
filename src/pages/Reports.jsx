import { FileText, Share2, Printer, ChevronDown, Calendar } from 'lucide-react'
import '../App.css'

export function Reports() {
  const reports = [
    { title: 'Q3 2025 Climate Summary', date: 'Aug 23, 2025', type: 'Quarterly', format: 'PDF', status: 'Published' },
    { title: 'Monsoon Season 2025 Analysis', date: 'Aug 15, 2025', type: 'Seasonal', format: 'PDF', status: 'Published' },
    { title: 'Half-yearly Climate Report 2025', date: 'Jul 30, 2025', type: 'Report', format: 'PDF', status: 'Published' },
    { title: 'Regional Drought Assessment', date: 'Jul 10, 2025', type: 'Special', format: 'PDF', status: 'Published' },
    { title: 'Temperature Trend Report 2024', date: 'Dec 20, 2024', type: 'Annual', format: 'PDF', status: 'Published' },
  ]

  return (
    <div className="content-wrap">
      <section className="page-heading">
        <div>
          <div className="eyebrow">Reports & Documentation</div>
          <h1>Climate analysis reports</h1>
          <p>Comprehensive reports on climate trends, forecasts, and regional assessments</p>
        </div>
        <button className="date-control">
          All reports <ChevronDown size={16} />
        </button>
      </section>

      <div className="primary-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Published Reports</span>
              <h2>Latest documents</h2>
            </div>
            <button className="panel-action">View all <span>↗</span></button>
          </div>
          <div style={{ padding: '0' }}>
            {reports.map((report, idx) => (
              <div
                key={idx}
                style={{
                  padding: '18px 22px',
                  borderBottom: '1px solid var(--line)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <FileText size={24} style={{ color: '#d16f43' }} />
                  <div>
                    <strong style={{ color: '#173c3a', display: 'block', marginBottom: '4px' }}>{report.title}</strong>
                    <div style={{ fontSize: '12px', color: '#96a099', display: 'flex', gap: '12px' }}>
                      <span>📅 {report.date}</span>
                      <span>{report.type}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#2b8a72',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px',
                    }}
                  >
                    <Share2 size={16} /> Share
                  </button>
                  <button
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#d16f43',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px',
                    }}
                  >
                    <Printer size={16} /> Print
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Report Types</span>
              <h2>Available categories</h2>
            </div>
          </div>
          <div style={{ padding: '22px' }}>
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 8px 0', color: '#173c3a', fontSize: '14px', fontWeight: '600' }}>📊 Quarterly Reports</h3>
              <p style={{ margin: 0, color: '#78847e', fontSize: '13px' }}>Seasonal climate analysis and regional comparisons</p>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 8px 0', color: '#173c3a', fontSize: '14px', fontWeight: '600' }}>📈 Trend Analysis</h3>
              <p style={{ margin: 0, color: '#78847e', fontSize: '13px' }}>Long-term climate patterns and forecasting models</p>
            </div>
            <div>
              <h3 style={{ margin: '0 0 8px 0', color: '#173c3a', fontSize: '14px', fontWeight: '600' }}>⚠️ Risk Assessments</h3>
              <p style={{ margin: 0, color: '#78847e', fontSize: '13px' }}>Flood, drought, and extreme weather forecasts</p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '17px' }}>
        <div className="panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Featured Report</span>
              <h2>Monsoon Season 2025 In-depth Analysis</h2>
            </div>
          </div>
          <div style={{ padding: '22px' }}>
            <p style={{ margin: '0 0 16px 0', color: '#78847e', fontSize: '14px', lineHeight: '1.6' }}>
              This comprehensive report covers the 2025 monsoon season across Karnataka, including precipitation patterns, impact on agriculture, flood risk assessment, and recommendations for water management strategies. The analysis incorporates historical data and predictive models to provide actionable insights.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              <button
                style={{
                  background: '#e3efe0',
                  border: '1px solid #2b8a72',
                  color: '#2b8a72',
                  padding: '10px 16px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '12px',
                }}
              >
                📥 Download PDF
              </button>
              <button
                style={{
                  background: 'transparent',
                  border: '1px solid var(--line)',
                  color: '#173c3a',
                  padding: '10px 16px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '12px',
                }}
              >
                👁️ View Online
              </button>
              <button
                style={{
                  background: 'transparent',
                  border: '1px solid var(--line)',
                  color: '#173c3a',
                  padding: '10px 16px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '12px',
                }}
              >
                🔗 Share Report
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
