// 底图 Token 配置弹窗
// 服务端不存储任何地图 Token —— 用户在此弹窗自行输入，仅存于浏览器会话内存（刷新/关闭即清）
// 不填 Token 时使用 OSM / Esri / 高德等公开底图，功能完整
import { useEffect, useRef, useState } from 'react';

export default function ImageryTokenDialog({ onSave, onSkip, hasOverride = false }) {
  // tdtToken: 天地图 Token； cesiumToken: Cesium Ion Token
  const [tdtToken, setTdtToken] = useState('');
  const [cesiumToken, setCesiumToken] = useState('');
  const [testing, setTesting] = useState(null); // {which: 'tdt'|'ion', state: 'ok'|'fail'}
  const dialogRef = useRef(null);

  useEffect(() => {
    setTimeout(() => {
      const input = dialogRef.current?.querySelector('input');
      input && input.focus();
    }, 100);
  }, []);

  function save() {
    onSave && onSave({
      tdtToken: tdtToken.trim(),
      cesiumToken: cesiumToken.trim(),
    });
  }

  function skip() {
    onSkip && onSkip();
  }

  async function testToken(which, token) {
    if (!token.trim()) return;
    setTesting({ which, state: 'pending' });
    try {
      let ok = false;
      if (which === 'tdt') {
        const resp = await fetch(
          `https://t0.tianditu.gov.cn/img_w/wmts?service=wmts&request=GetTile&version=1.0.0&layer=img&style=default&format=tiles&tileMatrixSet=w&tileMatrix=1&tileRow=1&tileCol=1&tk=${token.trim()}`,
          { method: 'HEAD', mode: 'cors' },
        );
        ok = resp.ok;
      } else if (which === 'ion') {
        // Cesium Ion: 验证 token 能访问 ion API
        const resp = await fetch(`https://api.cesium.com/v1/assets?access_token=${token.trim()}`, { method: 'GET' });
        ok = resp.ok;
      }
      setTesting({ which, state: ok ? 'ok' : 'fail' });
    } catch {
      setTesting({ which, state: 'fail' });
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
          <span id="imagery-token-dialog-title">🗺 配置底图 Token</span>
          <button className="sandcastle-icon-btn" onClick={skip} aria-label="跳过 Token 设置">✕</button>
        </div>
        <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="muted small" style={{ padding: '8px 10px', background: 'rgba(251,191,36,0.08)', borderRadius: 6, color: 'var(--warn)' }}>
            Token 仅存于浏览器当前会话（内存），刷新/关闭即清除。<br/>
            不填也能用——默认加载 OSM / Esri / 高德 等公开底图。
          </div>

          {/* 天地图 Token */}
          <div>
            <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 600 }}>🗺 天地图 Token</div>
            <div className="muted small" style={{ marginBottom: 6 }}>
              前往 <a href="https://console.tianditu.gov.cn/" target="_blank" rel="noreferrer">console.tianditu.gov.cn</a> 注册获取
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder="天地图 Token（可选，仅本次会话）"
                value={tdtToken}
                onChange={(e) => { setTdtToken(e.target.value); setTesting(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
              />
              <button
                className={'btn small' + (testing?.which === 'tdt' && testing?.state === 'ok' ? ' primary' : testing?.which === 'tdt' && testing?.state === 'fail' ? ' danger' : '')}
                onClick={() => testToken('tdt', tdtToken)}
                disabled={!tdtToken.trim() || testing?.state === 'pending'}
              >
                {testing?.which === 'tdt' && testing?.state === 'pending' ? '⏳' : testing?.which === 'tdt' && testing?.state === 'ok' ? '✓' : testing?.which === 'tdt' && testing?.state === 'fail' ? '✗' : '测试'}
              </button>
            </div>
            {testing?.which === 'tdt' && testing?.state === 'ok' && <div className="small" style={{ color: 'var(--success)', marginTop: 4 }}>✓ Token 有效</div>}
            {testing?.which === 'tdt' && testing?.state === 'fail' && <div className="small" style={{ color: 'var(--danger)', marginTop: 4 }}>✗ Token 无效或网络不通</div>}
          </div>

          {/* Cesium Ion Token */}
          <div>
            <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 600 }}>🌐 Cesium Ion Token</div>
            <div className="muted small" style={{ marginBottom: 6 }}>
              前往 <a href="https://ion.cesium.com/tokens" target="_blank" rel="noreferrer">ion.cesium.com/tokens</a> 注册获取（用于 3D 地形、Bing 卫星等）
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder="Cesium Ion Token（可选，仅本次会话）"
                value={cesiumToken}
                onChange={(e) => { setCesiumToken(e.target.value); setTesting(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
              />
              <button
                className={'btn small' + (testing?.which === 'ion' && testing?.state === 'ok' ? ' primary' : testing?.which === 'ion' && testing?.state === 'fail' ? ' danger' : '')}
                onClick={() => testToken('ion', cesiumToken)}
                disabled={!cesiumToken.trim() || testing?.state === 'pending'}
              >
                {testing?.which === 'ion' && testing?.state === 'pending' ? '⏳' : testing?.which === 'ion' && testing?.state === 'ok' ? '✓' : testing?.which === 'ion' && testing?.state === 'fail' ? '✗' : '测试'}
              </button>
            </div>
            {testing?.which === 'ion' && testing?.state === 'ok' && <div className="small" style={{ color: 'var(--success)', marginTop: 4 }}>✓ Token 有效</div>}
            {testing?.which === 'ion' && testing?.state === 'fail' && <div className="small" style={{ color: 'var(--danger)', marginTop: 4 }}>✗ Token 无效或网络不通</div>}
          </div>
        </div>
        <div className="ai-modal-actions">
          <button className="btn small" onClick={skip}>暂不配置</button>
          <button className="btn small primary" onClick={save} disabled={!tdtToken.trim() && !cesiumToken.trim()}>保存</button>
        </div>
      </div>
    </div>
  );
}
