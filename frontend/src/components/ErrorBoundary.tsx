import React, { Component, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallbackTitle?: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught unhandled component error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, margin: 16, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 6, color: '#fff' }}>
          <h4 style={{ margin: 0, color: '#ef4444', fontFamily: 'var(--font-mono)' }}>
            OPERATIONAL COMPONENT RECOVERY: {this.props.fallbackTitle || 'RENDER FAILURE INTERCEPTED'}
          </h4>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }}>
            {this.state.error?.message || 'An unexpected rendering error was intercepted. The console remains active.'}
          </p>
          <button
            className="btn btn-secondary"
            style={{ marginTop: 12, fontSize: 11 }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            RESET VIEW COMPONENT
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
