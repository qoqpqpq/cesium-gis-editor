// 周期324: useAiOrchestration 再拆分 (1/4) —— 场景上下文簇子钩子
// 场景摘要 2s 轮询（setInterval）+ sceneContextRefreshRef 命令式刷新 +
// e2e window 测试钩子（__refreshSceneContext / __runSandbox / __layers 三数据桶合并 /
// __layerVisible / __flyToLayer）。
// 依赖经对象注入。
import { useEffect, useRef, useState } from 'react';

export function useAiSceneContext({ cesiumRef, editorRef, runSandboxCode, captureSceneContext }) {
  const [sceneContext, setSceneContext] = useState(null);
  const sceneContextRefreshRef = useRef(() => {});
  sceneContextRefreshRef.current = () => {
    try { setSceneContext(captureSceneContext()); } catch (_) {}
  };
  useEffect(() => {
    sceneContextRefreshRef.current();
    const t = setInterval(() => sceneContextRefreshRef.current(), 2000);
    // 测试钩子：让 e2e 可强制刷新
    if (typeof window !== 'undefined') window.__refreshSceneContext = () => sceneContextRefreshRef.current();
    // 测试钩子：让 e2e 直接调沙箱执行（不走 UI）
    // runSandboxCode 内部用 ctxRef.current，所以一次绑定就够，ref 会保持最新
    if (typeof window !== 'undefined') window.__runSandbox = (code) => runSandboxCode(code);
    // 测试钩子：让 e2e 直接读取 cesiumEarth 暴露的图层抽象层
    if (typeof window !== 'undefined') {
      // 合并三个数据桶：datasource（FileLoader）+ viewer.entities 沙箱 + editor 桶（LayersTree）
      // 借鉴 kepler.gl LayerManager：所有图层走同一个名词
      const listAllLayers = () => {
        const out = [];
        // 1) cesiumEarth 的 datasource + sandbox entities
        try {
          const cesiumLayers = cesiumRef.current?.layers?.() || [];
          out.push(...cesiumLayers);
        } catch (_) {}
        // 2) editor 桶（图层 + 要素）
        try {
          const editor = editorRef.current;
          if (editor) {
            const layers = editor.getLayers?.() || [];
            const features = editor.getFeatures?.() || [];
            const byLayer = new Map();
            for (const f of features) {
              const lid = f.layer || f.layerId || 'default';
              byLayer.set(lid, (byLayer.get(lid) || 0) + 1);
            }
            for (const l of layers) {
              out.push({
                id: 'editor:' + l.id,
                name: '📐 ' + (l.name || l.id),
                source: 'editor',
                kind: 'editor-layer',
                visible: l.visible !== false,
                loading: false,
                count: byLayer.get(l.id) || 0,
                bbox: null,
              });
            }
          }
        } catch (_) {}
        return out;
      };
      window.__layers = listAllLayers;
      window.__layerVisible = (id, v) => {
        try {
          // editor 桶：调用 EditorPanel.setLayerVisibility（命令式 API 已暴露）
          if (typeof id === 'string' && id.startsWith('editor:')) {
            const layerId = id.slice('editor:'.length);
            const editor = editorRef.current;
            if (editor && typeof editor.setLayerVisibility === 'function') {
              const r = editor.setLayerVisibility({ layerId, visible: v });
              return !!(r && r.ok);
            }
            return false;
          }
          return cesiumRef.current?.setLayerVisible?.(id, v) || false;
        } catch (_) { return false; }
      };
      window.__flyToLayer = (id) => {
        try { return cesiumRef.current?.flyToLayer?.(id) || false; } catch (_) { return false; }
      };
    }
    return () => {
      clearInterval(t);
    };
  }, []);

  return { sceneContext, setSceneContext, sceneContextRefreshRef };
}
