import { Component } from 'react';

const DEFAULT_FALLBACK = (error, reset) => (
  <div className="error-boundary-fallback" role="alert" aria-live="assertive">
    <div className="error-boundary-card">
      <h2 className="error-boundary-title">渲染出错</h2>
      <p className="error-boundary-message">
        该组件在渲染时发生错误,已停止当前页面以保护应用状态。
      </p>
      {error && error.message && (
        <pre className="error-boundary-detail" data-testid="error-boundary-detail">
          {error.message}
        </pre>
      )}
      <div className="error-boundary-actions">
        <button type="button" onClick={reset} className="error-boundary-retry">
          重试
        </button>
      </div>
    </div>
  </div>
);

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[ErrorBoundary]', error, info && info.componentStack);
    }
    if (typeof this.props.onError === 'function') {
      try { this.props.onError(error, info); } catch (_) { /* ignore */ }
    }
  }

  reset() {
    this.setState({ error: null });
    if (typeof this.props.onReset === 'function') {
      try { this.props.onReset(); } catch (_) { /* ignore */ }
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const Fallback = this.props.fallback || DEFAULT_FALLBACK;
    if (typeof Fallback === 'function') {
      return Fallback(error, this.reset, this.props);
    }
    return Fallback;
  }
}

export default ErrorBoundary;
