// 天地图 Token 配置弹窗
// 优先使用服务端配置的 TIANDITU_TOKEN（推荐，更安全）；
// 弹窗仍允许临时覆盖（仅内存 + 父组件 React state，关闭标签页即失效），便于个人调试。
import { useEffect, useRef, useState } from 'react';
import { gisApi } from '../../api/index.js';

export default function ImageryTokenDialog({ onSave, onSkip, hasOverride = false }) {
  const [token, setToken] = useState('');
  const [serverEnabled, setServerEnabled] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    gisApi.config()
      .then((cfg) => setServerEnabled(!!cfg?.tianDitu?.enabled))
      .catch(() => {});
    setTimeout(() => {
      const input = dialogRef.current?.querySelector('input');
      input && input.focus();
    }, 100);
  }, []);

  function save() {
    const trimmed = token.trim();
    onSave && onSave(trimmed);
  }

  function clearOverride() {
    setToken('');
    onSave && onSave('');
  }

  function skip() {
    onSkip && onSkip();
  }

  async function testToken() {
    if (!token.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const testUrl = `https://t0.tianditu.gov.cn/img_w/wmts?service=wmts&request=GetTile&version=1.0.0&layer=img&style=default&format=tiles&tileMatrixSet=w&tileMatrix=1&tileRow=1&tileCol=1&tk=${token.trim()}`;
      const resp = await fetch(testUrl, { method: 'HEAD', mode: 'cors' });
      setTestResult(resp.ok ? 'ok' : 'fail');
    } catch {
      setTestResult('fail');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="ai-modal-mask" onClick={(e) => { if (e.target === e.currentTarget) skip(); }}>
      <div className="ai-modal" ref={dialogRef} onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="imagery-token-dialog-title"
      >
        <div className="ai-modal-head">
          <span id="imagery-token-dialog-title">🗺 配置天地图 Token</span>
          <button className="sandcastle-icon-btn" onClick={skip} aria-label="跳过 Token 设置">✕</button>
        </div>
        <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {serverEnabled ? (
            <div className="small" style={{ color: 'var(--success)', padding: '8px 10px', background: 'rgba(74,222,128,0.08)', borderRadius: 6 }}>
              ✓ 服务端已配置 Token，无需手动填写。点击「暂不配置」继续。
            </div>
          ) : (
            <div className="muted small" style={{ padding: '8px 10px', background: 'rgba(251,191,36,0.08)', borderRadius: 6, color: 'var(--warn)' }}>
              ⚠ 服务端未配置 Token。
              1. 前往 <a href="https://console.tianditu.gov.cn/" target="_blank" rel="noreferrer">console.tianditu.gov.cn</a> 注册 → 创建应用 → 获取 Key
              <br />
              2. 告知管理员把 Key 写入服务端 <code>TIANDITU_TOKEN</code> 环境变量（更安全）
              <br />
              3. 或临时在下方填入（仅本次会话有效）
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label htmlFor="imagery-token-input" className="visually-hidden" style={{ position: 'absolute', left: -9999 }}>
              天地图 Token 覆盖值
            </label>
            <input
              id="imagery-token-input"
              className="input"
              style={{ flex: 1 }}
              placeholder="可选：临时覆盖 Token（仅本次会话）"
              value={token}
              onChange={(e) => { setToken(e.target.value); setTestResult(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
            />
            <button
              className={'btn small' + (testResult === 'ok' ? ' primary' : testResult === 'fail' ? ' danger' : '')}
              onClick={testToken}
              disabled={testing || !token.trim()}
            >
              {testing ? '⏳' : testResult === 'ok' ? '✓' : testResult === 'fail' ? '✗' : '测试'}
            </button>
          </div>
          {testResult === 'ok' && <div className="small" style={{ color: 'var(--success)' }}>✓ Token 有效</div>}
          {testResult === 'fail' && <div className="small" style={{ color: 'var(--danger)' }}>✗ Token 无效</div>}
        </div>
        <div className="ai-modal-actions">
          <button className="btn small" onClick={skip}>暂不配置</button>
          {hasOverride && (
            <button className="btn small danger" onClick={clearOverride}>清除覆盖</button>
          )}
          <button className="btn small primary" onClick={save} disabled={!token.trim()}>保存覆盖</button>
        </div>
      </div>
    </div>
  );
}
