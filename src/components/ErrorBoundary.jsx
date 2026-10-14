import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)

    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error, errorInfo) {
    console.error('CMHP ERP application error:', error)
    console.error('Component stack:', errorInfo?.componentStack)
    this.setState({ errorInfo })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#f5f8fc',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '640px',
            background: '#ffffff',
            borderRadius: '18px',
            padding: '36px',
            textAlign: 'center',
            boxShadow: '0 18px 50px rgba(15, 23, 42, 0.12)',
          }}
        >
          <h2>Something went wrong</h2>

          <p
            style={{
              color: '#64748b',
              lineHeight: 1.6,
            }}
          >
            The CMHP ERP encountered an unexpected error. Please reload the application and try again.
          </p>

          {this.state.error && (
            <div
              style={{
                margin: '20px 0',
                padding: '12px 16px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                textAlign: 'left',
                color: '#b91c1c',
                fontSize: '13px',
                fontFamily: 'monospace',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                maxHeight: '200px',
              }}
            >
              <strong>{String(this.state.error?.message || this.state.error)}</strong>
              {this.state.errorInfo?.componentStack && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#7f1d1d' }}>
                  {this.state.errorInfo.componentStack}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={this.handleReload}
            style={{
              border: 0,
              borderRadius: '10px',
              padding: '12px 22px',
              cursor: 'pointer',
              fontWeight: 700,
              background: '#2563eb',
              color: '#ffffff',
            }}
          >
            Reload Application
          </button>
        </div>
      </div>
    )
  }
}