import { Component } from 'react';

/**
 * Last line of defence: if a render ever throws, show a notice instead of a blank page.
 * Simulation events are already guarded in the reducer; this covers rendering.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Logged once for diagnosis; nothing is sent anywhere.
    console.error('Render error caught by ErrorBoundary:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-boundary" role="alert">
        <h2>Something went wrong while displaying the simulator.</h2>
        <p className="muted">{String(this.state.error?.message ?? this.state.error)}</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload the page
        </button>
      </div>
    );
  }
}
