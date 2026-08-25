import { Download, FileText, Database, ChevronDown, Eye } from 'lucide-react'
import '../App.css'

export function Data() {
  const datasets = [
    { name: 'Yearly Maximum Temperature (1.0 x 1.0)', type: 'Binary GRD', years: '2010-2025', size: '432 MB', status: 'Available' },
    { name: 'Yearly Minimum Temperature (1.0 x 1.0)', type: 'Binary GRD', years: '2010-2025', size: '428 MB', status: 'Available' },
    { name: 'Yearly Rainfall (0.25 x 0.25)', type: 'Binary GRD', years: '2010-2025', size: '1.2 GB', status: 'Available' },
    { name: 'Air Quality Index (AQI)', type: 'CSV', years: '2015-2025', size: '45 MB', status: 'Available' },
    { name: 'Flood Risk Assessment', type: 'GeoJSON', years: '2018-2025', size: '156 MB', status: 'Available' },
  ]

  return (
    <div className="content-wrap">
      <section className="page-heading">
        <div>
          <div className="eyebrow">Data Management</div>
          <h1>Climate datasets & resources</h1>
          <p>Access, download, and manage climate data files for your analysis</p>
        </div>
        <button className="date-control">
          All datasets <ChevronDown size={16} />
        </button>
      </section>

      <div className="panel" style={{ marginBottom: '20px' }}>
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Available Datasets</span>
            <h2>Climate data sources</h2>
          </div>
          <button className="panel-action">
            Refresh <span>↻</span>
          </button>
        </div>
        <div style={{ padding: '0' }}>
          <div className="table-head" style={{ gridTemplateColumns: '1.5fr 1fr 0.8fr 0.8fr 0.8fr 1fr', padding: '14px 22px' }}>
            <span>Dataset Name</span>
            <span>Type</span>
            <span>Years</span>
            <span>Size</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {datasets.map((dataset, idx) => (
            <div key={idx} className="state-row" style={{ gridTemplateColumns: '1.5fr 1fr 0.8fr 0.8fr 0.8fr 1fr', padding: '14px 22px', width: '100%', margin: '0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Database size={16} style={{ color: '#2b8a72' }} />
                <strong style={{ color: '#173c3a' }}>{dataset.name}</strong>
              </div>
              <span style={{ color: '#73817b' }}>{dataset.type}</span>
              <span style={{ color: '#73817b' }}>{dataset.years}</span>
              <span style={{ color: '#73817b' }}>{dataset.size}</span>
              <span style={{ color: '#2b8a72', fontWeight: '600' }}>● {dataset.status}</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#2b8a72' }} title="Preview">
                  <Eye size={16} />
                </button>
                <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#d16f43' }} title="Download">
                  <Download size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="primary-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">File Formats</span>
              <h2>Supported data types</h2>
            </div>
          </div>
          <div style={{ padding: '22px' }}>
            <div style={{ marginBottom: '16px' }}>
              <strong style={{ color: '#173c3a' }}>Binary GRD</strong>
              <p style={{ margin: '6px 0 0 0', color: '#78847e', fontSize: '13px' }}>Gridded climate data in binary format with high resolution</p>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <strong style={{ color: '#173c3a' }}>GeoJSON</strong>
              <p style={{ margin: '6px 0 0 0', color: '#78847e', fontSize: '13px' }}>Geographic data with spatial properties for mapping</p>
            </div>
            <div>
              <strong style={{ color: '#173c3a' }}>CSV</strong>
              <p style={{ margin: '6px 0 0 0', color: '#78847e', fontSize: '13px' }}>Tabular data for easy analysis in spreadsheets</p>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Getting Started</span>
              <h2>How to use datasets</h2>
            </div>
          </div>
          <div style={{ padding: '22px' }}>
            <ol style={{ margin: 0, paddingLeft: '20px', color: '#78847e', fontSize: '13px', lineHeight: '1.8' }}>
              <li>Select a dataset from the table above</li>
              <li>Click Download to get the data file</li>
              <li>Use the provided documentation for format details</li>
              <li>Load into your analysis tools (Python, R, QGIS, etc.)</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
