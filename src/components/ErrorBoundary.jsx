import { Component } from 'react'
import { AlertCircle, RotateCcw } from 'lucide-react'

/**
 * Keeps one broken view from blanking the whole app. A WebGL context lost
 * mid-demo, or an unexpected API shape, now shows a recoverable card in
 * place of the page instead of a white screen.
 *
 * `resetKey` (the route path) clears the error when the user navigates away.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  componentDidCatch(error, info) {
    console.error('[HavaMana] view crashed:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="content-wrap">
        <div className="demo-banner" role="alert">
          <AlertCircle size={16} />
          <div>
            <strong>This view hit an error.</strong>{' '}
            {String(this.state.error?.message || this.state.error)}
            <div style={{ marginTop: 10 }}>
              <button className="preset-btn" onClick={() => this.setState({ error: null })}>
                <RotateCcw size={13} /> Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }
}
