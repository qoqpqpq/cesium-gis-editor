import { Component } from 'react';

const EDITOR_LS_PREFIX = 'gis:editor:';

function defaultClearEditorState() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    // 周期 1 P1-5: 用前缀匹配清空 'gis:editor:*'，避免硬编码 key 列表
    //   后续新加视图 / 主题 / 侧栏宽度等状态都自动跟随清理
    // 先收集再删除（正向遍历 + removeItem 会导致 length 缩减，索引漂移）
    const toRemove = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(EDITOR_LS_PREFIX)) toRemove.push(k);
    }
    for (const k of toRemove) {
      try { window.localStorage.removeItem(k); } catch (_) { /* ignore */ }
    }
  } catch (_) { /* ignore */ }
}

export function EditorErrorFallback({ reset }) {
  const handleReset = () => {
    defaultClearEditorState();
    if (typeof reset === 'function') reset();
    if (typeof window !== 'undefined') {
      try { window.location.reload(); } catch (_) { /* fallback */ }
    }
  };
  return (
    <div className="editor-error-fallback" role="alert" aria-live="assertive">
      <div className="editor-error-card">
        <h3 className="editor-error-title">编辑器渲染失败</h3>
        <p className="editor-error-message">
          当前会话遇到异常,点击下方按钮可清空本地编辑器缓存并重置视图。
        </p>
        <button type="button" onClick={handleReset} className="editor-error-reset">
          重置编辑器
        </button>
      </div>
    </div>
  );
}

export class EditorErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error, info: null };
  }

  componentDidCatch(error, info) {
    // cycle-18 P1-4 (L-03 防呆): Sentry-style 结构化日志 + onError hook 上报
    // 1. 控制台结构化输出 (便于本地调试)
    if (typeof console !== 'undefined' && console.error) {
      try {
        console.error('[EditorErrorBoundary]', {
          message: error && error.message,
          stack: error && error.stack,
          componentStack: info && info.componentStack,
          props: this.props && this.props.name ? `boundary=${this.props.name}` : null,
          url: typeof window !== 'undefined' ? window.location && window.location.href : null,
          ts: new Date().toISOString(),
        });
      } catch (_) {
        console.error('[EditorErrorBoundary]', error, info && info.componentStack);
      }
    }
    // 2. 调用方传入的 onError hook (用于接入 Sentry / 自家观测)
    if (typeof this.props.onError === 'function') {
      try {
        this.props.onError(error, info);
      } catch (e) {
        console.warn('[EditorErrorBoundary] onError handler threw:', e && e.message);
      }
    }
    // 3. 保存 info 以便调试面板使用
    this.setState({ info });
  }

  reset() {
    this.setState({ error: null, info: null });
  }

  render() {
    if (this.state.error) {
      return <EditorErrorFallback reset={this.reset} />;
    }
    return this.props.children;
  }
}

export default EditorErrorBoundary;
