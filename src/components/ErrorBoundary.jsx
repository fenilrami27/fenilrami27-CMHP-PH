import React from 'react'

export default class ErrorBoundary
  extends React.Component {

  constructor(props) {
    super(props)

    this.state = {
      hasError: false,
      error: null,
    }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(
    error,
    errorInfo
  ) {
    console.error(
      'CMHP ERP application error:',
      error,
      errorInfo
    )
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
            maxWidth: '520px',
            background: '#ffffff',
            borderRadius: '18px',
            padding: '36px',
            textAlign: 'center',
            boxShadow:
              '0 18px 50px rgba(15, 23, 42, 0.12)',
          }}
        >
          <h2>
            Something went wrong
          </h2>

          <p
            style={{
              color: '#64748b',
              lineHeight: 1.6,
            }}
          >
            The CMHP ERP encountered an
            unexpected error. Please reload
            the application and try again.
          </p>

          <button
            type="button"
            onClick={this.handleReload}
            style={{
              border: 0,
              borderRadius: '10px',
              padding: '12px 22px',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            Reload Application
          </button>
        </div>
      </div>
    )
  }
}