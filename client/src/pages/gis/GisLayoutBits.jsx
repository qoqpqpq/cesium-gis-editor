// 可复用布局展示位（UR-2 步骤9：从 index.jsx 抽取）
// 纯展示组件，无业务逻辑；交互行为一律经 props 注入，保证「功能零回归」。
// 目的：消除 index.jsx 内重复的折叠条/分隔条标记、扁平化主 return 视觉密度、
//       抽取可复用样式（配合 styles.css 既有类，不改类名/不改外观）。

/** 三列容器列类名统一构造（left/center/right + 可选 collapsed） */
export function colClass(side, collapsed) {
  return 'gis-col gis-col-' + side + (collapsed ? ' collapsed' : '');
}

/** 折叠列点击条（左列「代码」/右列「AI」共用，原 index.jsx 两处重复） */
export function CollapseBar({ icon, label, title, onClick }) {
  return (
    <div className="col-collapse-bar" onClick={onClick} title={title}>
      <span className="col-collapse-icon">{icon}</span>
      <span className="col-collapse-label">{label}</span>
    </div>
  );
}

/** 垂直分割条（左|中 / 中|右 共用，原 index.jsx 两处重复）；折叠时禁用拖拽 */
export function HSplitter({ collapsed, onMouseDown, title }) {
  return (
    <div
      className="gis-hsplitter"
      onMouseDown={collapsed ? undefined : onMouseDown}
      title={collapsed ? '' : title}
    />
  );
}

/** 页面 toast 栈（level → toast-{level} 类，由 styles.css 定义外观） */
export function ToastStack({ toasts }) {
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={'toast toast-' + t.level}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** 阶段 3B 场景 AI 说明横幅（打开分享链接时显示） */
export function AiSceneDescBanner({ desc, onClose }) {
  return (
    <div className="ai-scene-desc-banner" role="region" aria-label="场景 AI 说明">
      <div className="ai-scene-desc-head">
        <span className="ai-scene-desc-icon" aria-hidden="true">🤖</span>
        <span className="ai-scene-desc-title">场景说明</span>
        {desc.model && <span className="ai-scene-desc-model">by {desc.model}</span>}
        <button
          type="button"
          className="ai-scene-desc-close"
          aria-label="关闭场景说明"
          onClick={onClose}
        >✕</button>
      </div>
      <div className="ai-scene-desc-body">
        {desc.description.split('\n').map((line, i) => (
          <p key={i}>{line || '\u00a0'}</p>
        ))}
      </div>
    </div>
  );
}
