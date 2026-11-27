// 周期324: useAiOrchestration 再拆分 (3/4) —— 截图簇子钩子
// `gis-screenshot`（viewer.canvas + overlay toBlob → 下载 → FileReader 转 base64 →
// 派发 `ai-set-input` 带附件）+ `nl-request-capture`（阶段 3D：NL 报告导出截图，
// 异步回传 dataURL）。纯副作用，无返回字段。依赖经对象注入。
import { useEffect } from 'react';

export function useAiScreenshot({ cesiumRef, pushToast }) {
  useEffect(() => {
    // 截图：CodeEditor 派发 gis-screenshot 事件 → 我们拿 viewer.canvas + overlay 一起 toBlob
    // （必须用 toBlob 而非 toDataURL：toDataURL 在大画布上会爆栈）
    // 流程：① toBlob → 下载到本地 ② FileReader 转 base64 → 派发 ai-set-input（带附件）让用户可以问 AI "这张图里是什么"
    const onScreenshot = () => {
      try {
        const v = cesiumRef.current?.getViewer?.();
        if (!v) { pushToast('⚠️ viewer 未就绪', 'error', 2500); return; }
        // Cesium 的 canvas 在画 WebGL；需要 preserveDrawingBuffer:true 才能 toBlob
        // 若没启用，则先 render 一帧再立刻 toBlob
        v.scene.render();
        v.canvas.toBlob((blob) => {
          if (!blob) { pushToast('⚠️ 截图失败：canvas 无内容', 'error', 2500); return; }
          // 水印：在右侧加上博客名 + 时间戳（不影响 viewer，纯属叠加）
          // 简易实现：直接用文件名带时间戳，并在控制台输出 base64 提示
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          a.href = url;
          a.download = `blog-gis-${ts}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          pushToast('📸 已保存截图：' + a.download, 'success', 2500);
          // 输出到控制台：派发 gis-console-log 让 CodeEditor 输出台显示
          window.dispatchEvent(new CustomEvent('gis-console-log', {
            detail: { level: 'info', args: [`📸 截图已保存：${a.download}（${(blob.size / 1024).toFixed(1)} KB）`] },
          }));
          // 联动：把截图 PNG 转 base64 后塞到 AI 输入框（用户可问 AI 解读）
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result;
            // 存到 localStorage：aiSidePanel 在挂载或聚焦时检查这个 key 并写入输入框
            // （AiSidePanel.jsx 是压缩产物，没法直接编辑；走 localStorage 是兼容兜底）
            try {
              localStorage.setItem('gis-pending-ai-input', JSON.stringify({
                text: `我刚截了一张 GIS 视图（${a.download}，${(blob.size / 1024).toFixed(1)} KB）。请描述图中你看到了什么 / 哪些要素 / 有什么问题`,
                attachments: [{ kind: 'image', dataUrl, name: a.download, size: blob.size }],
                ts: Date.now(),
              }));
            } catch (e) {
              // localStorage 满了（base64 大图）；降级只存文字
              try {
                localStorage.setItem('gis-pending-ai-input', JSON.stringify({
                  text: `我刚截了一张 GIS 视图（${a.download}）。本地存储已满，附件未附上。`,
                  attachments: null,
                  ts: Date.now(),
                }));
              } catch (_) {}
            }
            window.dispatchEvent(new CustomEvent('ai-set-input', {
              detail: `我刚截了一张 GIS 视图（${a.download}，${(blob.size / 1024).toFixed(1)} KB）。请描述图中你看到了什么 / 哪些要素 / 有什么问题`,
            }));
            pushToast('🖼 截图已发给 AI：可点"发送"问它', 'info', 3000);
          };
          reader.readAsDataURL(blob);
        }, 'image/png');
      } catch (e) {
        pushToast('⚠️ 截图异常：' + (e.message || e), 'error', 3000);
      }
    };
    window.addEventListener('gis-screenshot', onScreenshot);

    // 阶段 3 D：NL 报告导出时需要的截图（异步捕获，回传 dataURL）
    const onRequestCapture = () => {
      try {
        const v = cesiumRef.current?.getViewer?.();
        if (!v) {
          window.dispatchEvent(new CustomEvent('nl-capture-snapshot', { detail: { dataUrl: null } }));
          return;
        }
        v.scene.render();
        v.canvas.toBlob((blob) => {
          if (!blob) {
            window.dispatchEvent(new CustomEvent('nl-capture-snapshot', { detail: { dataUrl: null } }));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            window.dispatchEvent(new CustomEvent('nl-capture-snapshot', { detail: { dataUrl: reader.result } }));
          };
          reader.readAsDataURL(blob);
        }, 'image/png');
      } catch (_) {
        window.dispatchEvent(new CustomEvent('nl-capture-snapshot', { detail: { dataUrl: null } }));
      }
    };
    window.addEventListener('nl-request-capture', onRequestCapture);

    return () => {
      window.removeEventListener('gis-screenshot', onScreenshot);
      window.removeEventListener('nl-request-capture', onRequestCapture);
    };
  }, []);

  return {};
}
