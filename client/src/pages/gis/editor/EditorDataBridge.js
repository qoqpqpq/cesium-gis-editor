// EditorDataBridge — 编辑器 DataSource 的极简事件总线
//
// 沙箱代码 / CesiumEarth 适配器 / AI 工具往 editor DS 写入时，
// 调 notifyEditorDataChange()。
// EditorPanel 在 useEffect 里订阅并 refreshFeatures()，
// 让 LayersTree / 选中集 / 属性表实时反映外部写入。

const subs = new Set();

export function subscribeEditorDataChange(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function notifyEditorDataChange() {
  subs.forEach((fn) => {
    try { fn(); } catch (_) {}
  });
}
