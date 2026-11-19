// 周期140: useGisPage 拆分 (3/4) —— 编辑器/底图 Token/Toast/坐标格式状态子钩子
// 纯状态簇: coordFormat / toasts+pushToast / editorCode / loadedFiles /
// showTokenDialog / tdtTokenOverride / cesiumTokenOverride,
// 以及关联的 localStorage 持久化与 gis-apply-code 事件监听。零业务耦合。
import { useEffect, useRef, useState } from 'react';

export function useEditorState() {
  // 坐标格式（dec / dms / utm / mgrs）—— 提升到 index 层
  // 让 CesiumEarth 内的 CursorReadout 底栏共享同一选择
  const [coordFormat, setCoordFormat] = useState(() => {
    try { return localStorage.getItem('editor.coordFormat') || 'dec'; } catch (_) { return 'dec'; }
  });
  useEffect(() => {
    try { localStorage.setItem('editor.coordFormat', coordFormat); } catch (_) {}
  }, [coordFormat]);

  // Toast
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  // 编辑器状态
  const [editorCode, setEditorCode] = useState(() => {
    try { return localStorage.getItem('gis-editor-code') || ''; } catch (_) { return ''; }
  });

  // 文件上传（FileLoader 管理的已加载数据源列表）
  const [loadedFiles, setLoadedFiles] = useState([]);

  // 底图 Token 弹窗（首次加载时弹出，用户可跳过）
  const [showTokenDialog, setShowTokenDialog] = useState(() => {
    try {
      const skipped = localStorage.getItem('cesium_tdt_skipped');
      return !skipped;
    } catch (_) { return false; }
  });

  // 用户在弹窗里手动输入的 token（仅本会话内存，不持久化，刷新/关闭即清）
  const [tdtTokenOverride, setTdtTokenOverride] = useState('');
  const [cesiumTokenOverride, setCesiumTokenOverride] = useState('');

  // 监听 editorCode 变化
  useEffect(() => {
    const handler = (e) => {
      if (typeof e.detail?.code === 'string') setEditorCode(e.detail.code);
    };
    window.addEventListener('gis-apply-code', handler);
    return () => window.removeEventListener('gis-apply-code', handler);
  }, []);

  function pushToast(text, level = 'info', ttlMs = 3500) {
    const id = ++toastIdRef.current;
    setToasts((arr) => [...arr, { id, text, level }]);
    setTimeout(() => {
      setToasts((arr) => arr.filter((t) => t.id !== id));
    }, ttlMs);
  }

  return {
    coordFormat, setCoordFormat,
    toasts, setToasts, toastIdRef, pushToast,
    editorCode, setEditorCode,
    loadedFiles, setLoadedFiles,
    showTokenDialog, setShowTokenDialog,
    tdtTokenOverride, setTdtTokenOverride,
    cesiumTokenOverride, setCesiumTokenOverride,
  };
}