// EditorPanel — 编辑器顶层容器（Step 2：选择/移动/删除/复制）

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import EditorToolbar from './EditorToolbar.jsx';
import StylePanel from './StylePanel.jsx';
// CursorReadout 已迁移到 CesiumEarth 底栏（共享 index.jsx 的 coordFormat 状态）
import { useDrawing } from './hooks/useDrawing.js';
import { useSelection } from './hooks/useSelection.js';
import { useVertexEdit } from './hooks/useVertexEdit.js';
import { useMeasure } from './hooks/useMeasure.js';
import { useSimplify } from './hooks/useSimplify.js';
import { useUndoStack } from './hooks/useUndoStack.js';
import { EditorErrorBoundary } from '../../../components/EditorErrorFallback.jsx';
import SimplifyDialog from './components/SimplifyDialog.jsx';
import AttributeTablePanel from './components/AttributeTablePanel.jsx';
import AnalysisPanel from './components/AnalysisPanel.jsx';
import PrintExportPanel from './components/PrintExportPanel.jsx';
import ThreeCheckPanel from './components/ThreeCheckPanel.jsx';
import { lngLatHeightsToCartesians, newFeatureId } from './utils/geometry.js';
import { toGeoJSON, toKML, downloadFile, downloadDataURL } from './utils/exporter.js';
import { importGeoJSON } from './utils/importer.js';
import { safePickEllipsoid, whenViewerReady } from './utils/picking.js';
import { detectCoordCols, parseDelimited, rowsToGeoJson, rowsToGeoJsonFromWkt } from './utils/tabular.js';
import { readAttrs } from './utils/attrs.js';
import { buildShareUrl, snapshotCamera } from '../../../utils/viewState.js';
import { AddCommand, ClearAllCommand, DeleteCommand, RenameCommand, StyleCommand, VisibilityCommand, snapshotEntity, BatchDeleteCommand, BatchAttrCommand, LayerCreateCommand, LayerVisibilityCommand, LayerAssignCommand } from './utils/commands.js';
import { buildFeatureOptions, DEFAULT_STYLE as FACTORY_DEFAULT_STYLE } from './utils/featureFactory.js';
import { addEditorFeature } from './utils/featureFactory.js';
import { subscribeEditorDataChange } from './EditorDataBridge.js';
import * as XLSX from 'xlsx';

const COORD_FORMAT_KEY = 'editor.coordFormat'; // 已废弃：coordFormat 已上移到 index.jsx
const SNAP_KEY = 'editor.snap';
const DEFAULT_LAYERS = [{ id: 'default', name: '默认图层', visible: true, locked: false }];
const DEFAULT_SNAP = { vertex: true, edge: true, grid: false, tolPx: 12 };
// DEFAULT_STYLE 已迁移到 utils/featureFactory.js；这里 re-export 保持向后兼容
const DEFAULT_STYLE = FACTORY_DEFAULT_STYLE;

// 把 feature 反序列化重新入 entity（用于复制 / 删除撤销）
function rebuildEntity(api, feature) {
  const opts = buildFeatureOptions(feature);
  return api.addEditorEntity(opts);
}

function entityToFeature(entity) {
  const props = entity.properties;
  if (!props) return null;
  const get = (k) => (props[k] && props[k].getValue ? props[k].getValue() : props[k]);
  const kind = get('kind');
  const featureId = get('featureId');
  const layerId = get('layerId');
  const style = get('style');
  if (!kind || !featureId) return null;
  let positions = [];
  if (kind === 'point' && entity.position) {
    const c = entity.position.getValue ? entity.position.getValue() : entity.position;
    positions = [c];
  } else if (entity.polyline && entity.polyline.positions) {
    const p = entity.polyline.positions.getValue
      ? entity.polyline.positions.getValue()
      : entity.polyline.positions;
    positions = (p && p.length) ? (typeof p[0] === 'number' ? lngLatHeightsToCartesians([p]) : p) : [];
  } else if (entity.polygon && entity.polygon.hierarchy) {
    const h = entity.polygon.hierarchy.getValue
      ? entity.polygon.hierarchy.getValue()
      : entity.polygon.hierarchy;
    positions = h && h.positions ? h.positions : [];
  }
  const attrs = get('attrs');
  return { featureId, kind, layerId, style, name: entity.name, positions, visible: entity.show !== false, attrs: attrs && typeof attrs === 'object' ? attrs : {} };
}

export default forwardRef(function EditorPanel({ cesiumRef, coordFormat, onCoordFormatChange, onError, onInfo }, ref) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('idle');
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [activeLayerId, setActiveLayerId] = useState('default');
  const [features, setFeatures] = useState([]);
  // LayersTree 展开状态:哪个图层被展开,默认全部折叠
  const [expandedLayerIds, setExpandedLayerIds] = useState(() => new Set(['default']));
  // 坐标格式已上移到 index.jsx 管理（CursorReadout 现在挂在 CesiumEarth 底栏）
  // 吸附设置：vertex / edge / grid + tolerance(px)；持久化到 localStorage
  const [snapSettings, setSnapSettings] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(SNAP_KEY) || '{}');
      return { ...DEFAULT_SNAP, ...raw };
    } catch (_) { return DEFAULT_SNAP; }
  });
  // cesiumRef.current 在父组件 useImperativeHandle 后才被赋值；
  // 第一次拿到时 setState 触发下面的 hook 重新跑。
  const [api, setApi] = useState(() => cesiumRef && cesiumRef.current);
  // viewer 异步初始化状态（用于 toolbar 顶部提示）
  const [viewerReady, setViewerReady] = useState(false);
  const stopWaitingRef = useRef(null);

  useEffect(() => {
    if (!cesiumRef) return;
    if (stopWaitingRef.current) { try { stopWaitingRef.current(); } catch (_) {} stopWaitingRef.current = null; }
    const cur = cesiumRef.current;
    if (cur) {
      setApi(cur);
      stopWaitingRef.current = whenViewerReady(cur, () => setViewerReady(true));
      return;
    }
    // 兜底轮询（forwardRef 通常同步，但保险起见）
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const c = cesiumRef.current;
      if (c) {
        setApi(c);
        stopWaitingRef.current = whenViewerReady(c, () => setViewerReady(true));
      } else {
        requestAnimationFrame(tick);
      }
    };
    tick();
    return () => { cancelled = true; };
  }, [cesiumRef]);

  // features 与 editor DataSource 同步：每次 commit/remove 后从 DS 重读
  const refreshFeatures = useCallback(() => {
    if (!api || !api.getEditorDataSource) return;
    let ds;
    try { ds = api.getEditorDataSource(); } catch (e) { console.warn('[refreshFeatures] getEditorDataSource threw', e); return; }
    if (!ds) { console.warn('[refreshFeatures] ds is null/undefined'); return; }
    if (!ds.entities) return;
    if (!Array.isArray(ds.entities.values)) { console.warn('[refreshFeatures] ds.entities.values not array'); return; }
    const list = [];
    ds.entities.values.forEach((e) => {
      const f = entityToFeature(e);
      if (f) list.push(f);
    });
    setFeatures(list);
  }, [api]);

  // 撤销重做栈
  const undoApi = useUndoStack();

  const onCommit = useCallback((feature) => {
    // 把"添加"包成 AddCommand 入栈（do 已经完成创建）
    const cmd = AddCommand(api, {
      featureId: feature.featureId,
      kind: feature.kind,
      layerId: activeLayerId,
      style: feature.style,
      name: feature.kind,
      positions: feature.positions,
      attrs: feature.attrs || {},
    }, refreshFeatures);
    if (cmd) undoApi.push(cmd);
    onInfo && onInfo(`已添加 ${feature.kind}`);
  }, [api, activeLayerId, refreshFeatures, undoApi, onInfo]);

  const { draftCount } = useDrawing({ api, mode, layerId: activeLayerId, onCommit, snapSettings });
  const { selectedIds, setSelection, clearSelection } = useSelection({ api, mode, onChange: refreshFeatures });
  // 测试全局：暴露选中集 setter，让 E2E 测试绕开 LayersTree DOM 选择路径
  // （LayersTree 通过 React state `features` 过滤要素，直接 ds.entities.add() 注入的
  //  实体不会进入 `features`，导致 analysis 测试选不到任何要素）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.__editorSelect = (ids) => setSelection(new Set(Array.isArray(ids) ? ids : [ids]));
    window.__editorClearSelection = () => clearSelection();
    window.__editorRefresh = () => refreshFeatures();
    window.__editorUndo = () => undoApi.undo();
    window.__editorRedo = () => undoApi.redo();
    window.__editorCanUndo = () => undoApi.canUndo;
    window.__editorCanRedo = () => undoApi.canRedo;
    // AI 写工具专用：把命令推入撤销栈（do 自动执行）
    window.__editorPushCommand = (cmd) => undoApi.push(cmd);
    // 完整命令式 API 给 E2E 测试用（sandbox / AI 走 editorRef.current，
    // 但 E2E 需要绕开 index.jsx 直接戳 EditorPanel——通过 window.__editorApi 转发）
    if (typeof window !== 'undefined') {
      window.__editorApi = ref.current;
    }
    // 订阅外部数据写入（沙箱适配器、AI 工具、导入）→ refreshFeatures
    const unsubBridge = subscribeEditorDataChange(() => refreshFeatures());
    return () => {
      try { delete window.__editorSelect; } catch (_) {}
      try { delete window.__editorClearSelection; } catch (_) {}
      try { delete window.__editorRefresh; } catch (_) {}
      try { delete window.__editorUndo; } catch (_) {}
      try { delete window.__editorRedo; } catch (_) {}
      try { delete window.__editorCanUndo; } catch (_) {}
      try { delete window.__editorCanRedo; } catch (_) {}
      try { delete window.__editorPushCommand; } catch (_) {}
      try { delete window.__editorApi; } catch (_) {}
      try { unsubBridge(); } catch (_) {}
    };
  }, [setSelection, clearSelection, refreshFeatures, undoApi]);
  const { live: measureLive, clear: clearMeasure } = useMeasure({ api, mode, onInfo });
  const simplify = useSimplify({ api, pushUndo: (cmd) => undoApi.push(cmd), refresh: refreshFeatures, onInfo });

  // 顶点编辑：取选中集合里的第一个
  const singleSelectedId = useMemo(() => {
    if (selectedIds.size !== 1) return null;
    return Array.from(selectedIds)[0];
  }, [selectedIds]);

  // 简化对话框 state
  const [simplifyOpen, setSimplifyOpen] = useState(false);
  const singleSelectedEntity = useMemo(() => {
    if (!api || !singleSelectedId) return null;
    const ds = api.getEditorDataSource && api.getEditorDataSource();
    if (!ds) return null;
    return ds.entities.getById(singleSelectedId) || null;
  }, [api, singleSelectedId, features]);
  const singleSelectedKind = useMemo(() => {
    if (!singleSelectedEntity || !singleSelectedEntity.properties) return null;
    const k = singleSelectedEntity.properties.kind;
    return (k && k.getValue ? k.getValue() : k) || null;
  }, [singleSelectedEntity]);
  const simplifiable = useMemo(() => {
    if (!singleSelectedKind) return false;
    return ['polyline', 'polygon', 'freehand', 'rect', 'circle'].includes(singleSelectedKind);
  }, [singleSelectedKind]);

  const handleOpenSimplify = useCallback(() => {
    if (simplifiable) setSimplifyOpen(true);
  }, [simplifiable]);

  const handleSimplifyPreview = useCallback((eps) => {
    if (!singleSelectedEntity) return null;
    return simplify.computeNewPositions(singleSelectedEntity, singleSelectedKind, eps);
  }, [singleSelectedEntity, singleSelectedKind, simplify]);

  const handleSimplifyPreviewRender = useCallback((eps) => {
    const result = handleSimplifyPreview(eps);
    if (result) {
      simplify.renderPreview(singleSelectedEntity, singleSelectedKind, result.fresh);
    }
    return result;
  }, [handleSimplifyPreview, simplify, singleSelectedEntity, singleSelectedKind]);

  const handleSimplifyApply = useCallback((eps) => {
    if (!singleSelectedEntity) return;
    simplify.apply(singleSelectedEntity, singleSelectedKind, eps);
  }, [singleSelectedEntity, singleSelectedKind, simplify]);

  useVertexEdit({
    api, mode, activeLayerId,
    getSelectedFeatureId: () => singleSelectedId,
    refresh: refreshFeatures,
    onInfo,
    snapSettings,
  });

  // 删除选中（用 DeleteCommand 入栈）
  const handleDelete = useCallback(() => {
    if (!api || selectedIds.size === 0) return;
    const ds = api.getEditorDataSource();
    if (!ds) return;
    const fids = Array.from(selectedIds);
    fids.forEach((fid) => {
      const ent = ds.entities.getById(fid);
      if (!ent) return;
      const cmd = DeleteCommand(api, ent, refreshFeatures);
      if (cmd) undoApi.push(cmd);
    });
    clearSelection();
    onInfo && onInfo(`已删除 ${fids.length} 个要素`);
  }, [api, selectedIds, clearSelection, refreshFeatures, undoApi, onInfo]);

  // 复制选中：克隆 entity，偏移 0.001°（约 100m），featureId 重新生成
  const handleDuplicate = useCallback(() => {
    if (!api || selectedIds.size === 0) return;
    const ds = api.getEditorDataSource();
    if (!ds) return;
    const offsetRad = Cesium.Math.toRadians(0.001);
    const newIds = [];
    selectedIds.forEach((fid) => {
      const ent = ds.entities.getById(fid);
      if (!ent) return;
      const feat = entityToFeature(ent);
      if (!feat) return;
      const newPositions = feat.positions.map((c) => {
        const carto = Cesium.Cartographic.fromCartesian(c);
        return Cesium.Cartesian3.fromRadians(carto.longitude + offsetRad, carto.latitude + offsetRad, carto.height);
      });
      const clone = {
        ...feat,
        featureId: newFeatureId(feat.kind),
        positions: newPositions,
      };
      rebuildEntity(api, clone);
      newIds.push(clone.featureId);
    });
    setSelection(Array.from(newIds));
    refreshFeatures();
    onInfo && onInfo(`已复制 ${newIds.length} 个要素`);
  }, [api, selectedIds, setSelection, refreshFeatures, onInfo]);

  // 移动选中：mouseDown 在选中 entity 上 → 拖动 → mouseUp 提交
  const dragRef = useRef({ active: false, featureId: null, startPos: null, originalPositions: null });

  // 把鼠标位置 → entity 的所有 Cartesian3 平移
  const applyTranslation = useCallback((featureId, deltaLng, deltaLat) => {
    const ds = api && api.getEditorDataSource && api.getEditorDataSource();
    if (!ds) return;
    const ent = ds.entities.getById(featureId);
    if (!ent) return;
    const feat = entityToFeature(ent);
    if (!feat) return;
    const newPositions = feat.positions.map((c) => {
      const carto = Cesium.Cartographic.fromCartesian(c);
      return Cesium.Cartesian3.fromRadians(
        carto.longitude + deltaLng,
        carto.latitude + deltaLat,
        carto.height
      );
    });
    // 直接替换 CallbackProperty 引用的数组
    if (ent.kind === 'point' || feat.kind === 'point') {
      // 单点：重置 position
      ent.position = newPositions[0];
    } else if (ent.polyline && ent.polyline.positions) {
      ent.polyline.positions = new Cesium.CallbackProperty(() => newPositions, false);
    } else if (ent.polygon && ent.polygon.hierarchy) {
      ent.polygon.hierarchy = new Cesium.CallbackProperty(
        () => new Cesium.PolygonHierarchy(newPositions),
        false
      );
    }
  }, [api]);

  // select 模式：拖动支持
  useEffect(() => {
    if (!api || mode !== 'select') return;
    let isDragging = false;
    let dragEntityId = null;
    let dragStartCart = null;
    let lastEntityCart = null;
    const stopWaiting = whenViewerReady(api, (v) => {
      const handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
      handler.setInputAction((event) => {
        const picked = v.scene.pick(event.position);
        if (!picked || !picked.id || !picked.id.properties) return;
        const fid = picked.id.properties.featureId && picked.id.properties.featureId.getValue
          ? picked.id.properties.featureId.getValue()
          : picked.id.properties.featureId;
        if (!fid || fid === '__draft__') return;
        if (!selectedIdsRef.current.has(fid)) return;
        const carto = safePickEllipsoid(v, event.position);
        if (!carto) return;
        isDragging = true;
        dragEntityId = fid;
        dragStartCart = { lng: carto.longitude, lat: carto.latitude };
        lastEntityCart = { lng: carto.longitude, lat: carto.latitude };
      }, Cesium.ScreenSpaceEventType.LEFT_DOWN);
      handler.setInputAction((event) => {
        if (!isDragging) return;
        const carto = safePickEllipsoid(v, event.endPosition);
        if (!carto) return;
        const dLng = carto.longitude - lastEntityCart.lng;
        const dLat = carto.latitude - lastEntityCart.lat;
        lastEntityCart = { lng: carto.longitude, lat: carto.latitude };
        // 拖动 = 选中集合中所有要素一起平移
        selectedIdsRef.current.forEach((id) => applyTranslation(id, dLng, dLat));
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
      handler.setInputAction(() => {
        if (isDragging) {
          isDragging = false;
          refreshFeatures();
          onInfo && onInfo('已移动');
        }
      }, Cesium.ScreenSpaceEventType.LEFT_UP);
      dragHandlerRef.current = handler;
    });
    return () => {
      stopWaiting();
      if (dragHandlerRef.current) {
        try { dragHandlerRef.current.destroy(); } catch (_) {}
        dragHandlerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, api]);

  // 用 ref 跟踪 selectedIds（useEffect 不容易拿到最新的）
  const selectedIdsRef = useRef(new Set());
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  // select 模式拖动 handler 引用（便于 effect cleanup）
  const dragHandlerRef = useRef(null);

  // Ctrl+Z / Ctrl+Shift+Z 快捷键（聚焦在 CodeMirror 时跳过）
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (e.target && e.target.closest && e.target.closest('.cm-editor')) return;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const cmd = undoApi.undo();
        if (cmd) onInfo && onInfo(`撤销：${cmd.label}`);
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        const cmd = undoApi.redo();
        if (cmd) onInfo && onInfo(`重做：${cmd.label}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undoApi, onInfo]);

  // 清空所有
  const handleClearAll = useCallback(() => {
    if (!api) return;
    const cmd = ClearAllCommand(api, refreshFeatures);
    if (cmd) undoApi.push(cmd);
    clearSelection();
    onInfo && onInfo('已清空所有要素');
  }, [api, clearSelection, refreshFeatures, undoApi, onInfo]);

  // 单要素操作（LayersTree 用）— 全部通过命令入栈
  const handleToggleVisible = useCallback((fid) => {
    if (!api) return;
    const ds = api.getEditorDataSource();
    const ent = ds.entities.getById(fid);
    if (!ent) return;
    const cmd = VisibilityCommand(api, ent, refreshFeatures);
    if (cmd) undoApi.push(cmd);
  }, [api, refreshFeatures, undoApi]);

  const handleRename = useCallback((fid, name) => {
    if (!api) return;
    const ds = api.getEditorDataSource();
    const ent = ds.entities.getById(fid);
    if (!ent) return;
    const cmd = RenameCommand(api, ent, name, refreshFeatures);
    if (cmd) undoApi.push(cmd);
  }, [api, refreshFeatures, undoApi]);

  const handleFlyTo = useCallback((fid) => {
    if (!api) return;
    const ds = api.getEditorDataSource();
    const ent = ds.entities.getById(fid);
    if (!ent) return;
    const v = api.getViewer();
    if (!v) return;
    try { v.flyTo(ent, { duration: 1.0 }); } catch (_) {}
  }, [api]);

  const handleDeleteOne = useCallback((fid) => {
    if (!api) return;
    const ds = api.getEditorDataSource();
    const ent = ds.entities.getById(fid);
    if (!ent) return;
    ds.entities.remove(ent);
    setSelection((prev) => {
      const next = new Set(prev);
      next.delete(fid);
      return next;
    });
    refreshFeatures();
  }, [api, setSelection, refreshFeatures]);

  const handleLayerAssign = useCallback((fid, layerId) => {
    if (!api) return;
    const ds = api.getEditorDataSource();
    const ent = ds.entities.getById(fid);
    if (!ent || !ent.properties) return;
    try { ent.properties.layerId = layerId; } catch (_) {}
    refreshFeatures();
  }, [api, refreshFeatures]);

  const handleSelectOne = useCallback((fid) => {
    setSelection(new Set([fid]));
  }, [setSelection]);

  // 导出 GeoJSON / KML / 截图
  const handleExportGeoJSON = useCallback(() => {
    if (!api) return;
    const ds = api.getEditorDataSource();
    const fc = toGeoJSON(ds);
    downloadFile(`editor-${Date.now()}.geojson`, JSON.stringify(fc, null, 2));
    onInfo && onInfo(`已导出 ${fc.features.length} 个要素`);
  }, [api, onInfo]);

  const handleExportKML = useCallback(() => {
    if (!api) return;
    const ds = api.getEditorDataSource();
    const kml = toKML(ds);
    downloadFile(`editor-${Date.now()}.kml`, kml, 'application/vnd.google-earth.kml+xml');
    onInfo && onInfo('已导出 KML');
  }, [api, onInfo]);

  const handleExportPNG = useCallback(async () => {
    if (!api) return;
    const dataUrl = await api.screenshot();
    if (!dataUrl) { onError && onError('截图失败（preserveDrawingBuffer 未开启？）'); return; }
    downloadDataURL(`editor-${Date.now()}.png`, dataUrl);
    onInfo && onInfo('已保存截图');
  }, [api, onError, onInfo]);

  // ============ 阶段 2 状态栏/工具条补全：缩放至图层 / 全屏 / 分享视图 ============

  // 飞到当前 activeLayer 的 bbox 范围（如果该层无要素则不动）
  const handleFlyToActiveLayer = useCallback(() => {
    if (!api || typeof api.flyToLayer !== 'function') {
      onError && onError('flyToLayer 不可用');
      return;
    }
    const r = api.flyToLayer(activeLayerId);
    if (!r || !r.ok) {
      onInfo && onInfo(`图层「${activeLayerId}」无要素或不可飞行`);
    } else {
      onInfo && onInfo(`已飞到图层「${activeLayerId}」（${r.count ?? 0} 个要素）`);
    }
  }, [api, activeLayerId, onError, onInfo]);

  // HTML5 全屏 / 退出全屏
  const handleToggleFullscreen = useCallback(() => {
    if (!api || typeof api.toggleFullscreen !== 'function') {
      onError && onError('toggleFullscreen 不可用');
      return;
    }
    const r = api.toggleFullscreen();
    onInfo && onInfo(r.entered ? '已全屏' : '已退出全屏');
  }, [api, onError, onInfo]);

  // 分享视图 → URL hash → 复制剪贴板
  const handleShareView = useCallback(async () => {
    if (!api) return;
    const v = api.getViewer && api.getViewer();
    if (!v) { onError && onError('viewer 不可用'); return; }
    const camera = snapshotCamera(v, Cesium);
    if (!camera) { onError && onError('无法序列化当前相机姿态'); return; }
    const url = buildShareUrl({
      camera,
      layer: activeLayerId,
      coordFormat: coordFormat,
    });
    if (!url) { onError && onError('构建分享 URL 失败'); return; }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // 老浏览器回退：临时 textarea
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      onInfo && onInfo('分享 URL 已复制到剪贴板');
    } catch (e) {
      onError && onError('复制失败：' + (e && e.message ? e.message : '未知'));
    }
  }, [api, activeLayerId, coordFormat, onError, onInfo]);

  // 导入
  const fileInputRef = useRef(null);
  // 跨文件协调：basename → { shp: File, dbf: File }
  const shpPendingRef = useRef({});

  const handleImportClick = useCallback(() => fileInputRef.current?.click(), []);

  // --- 辅助：把 KML 坐标串转 [lng, lat] 或 [lng, lat, h] ---
  function parseKmlCoords(text) {
    if (!text) return [];
    return text.trim().split(/\s+/).map((t) => {
      const p = t.split(',').map(parseFloat);
      return p.length >= 2 ? p : null;
    }).filter(Boolean);
  }

  // --- 辅助：blob URL + revoke ---
  function makeBlobUrl(file) {
    return URL.createObjectURL(file);
  }

  // --- 格式：KML ---
  async function parseKml(file) {
    const text = await file.text();
    const dom = new DOMParser().parseFromString(text, 'application/xml');
    const feats = [];
    const placemarks = dom.getElementsByTagName('Placemark');
    Array.from(placemarks).forEach((pm, i) => {
      const name = pm.getElementsByTagName('name')[0]?.textContent || `kml_${i}`;
      let geom = null;
      const pt = pm.getElementsByTagName('Point')[0];
      const line = pm.getElementsByTagName('LineString')[0];
      const poly = pm.getElementsByTagName('Polygon')[0];
      if (pt) {
        const c = parseKmlCoords(pt.getElementsByTagName('coordinates')[0]?.textContent)?.[0];
        if (c) geom = { type: 'Point', coordinates: c };
      } else if (line) {
        const cs = parseKmlCoords(line.getElementsByTagName('coordinates')[0]?.textContent);
        if (cs.length) geom = { type: 'LineString', coordinates: cs };
      } else if (poly) {
        const cs = parseKmlCoords(poly.getElementsByTagName('coordinates')[0]?.textContent);
        if (cs.length) geom = { type: 'Polygon', coordinates: [cs] };
      }
      if (geom) feats.push({ type: 'Feature', id: 'kml_' + i, geometry: geom, properties: { name } });
    });
    return { type: 'FeatureCollection', features: feats };
  }

  // --- 格式：XLSX / XLS ---
  async function parseXlsx(file) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rowsObj = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });
    if (!rowsObj.length) throw new Error('空表格');
    const headers = rowsObj[0].map((h) => String(h).trim());
    const dataRows = rowsObj.slice(1);
    const rows = dataRows.map((cells) => {
      const row = {};
      headers.forEach((h, i) => { row[h] = (cells[i] ?? '').toString().trim(); });
      return row;
    });
    const cols = detectCoordCols(headers);
    // 优先级：WKT > lat/lng（与 FileLoader.jsx 对齐）
    if (cols.wkt >= 0) {
      return rowsToGeoJsonFromWkt({ headers, rows }, cols.wkt, file.name);
    }
    if (cols.lat === -1 || cols.lng === -1) {
      const got = headers.join(', ');
      throw new Error(`找不到 lat/lng/WKT 列（识别了：${got.slice(0, 80)}）`);
    }
    return rowsToGeoJson({ headers, rows }, cols.lat, cols.lng, cols.alt, file.name);
  }

  // --- 格式：CSV / TXT ---
  async function parseDelimFile(file) {
    const text = await file.text();
    const parsed = parseDelimited(text);
    if (!parsed.headers.length) throw new Error('空文件');
    const cols = detectCoordCols(parsed.headers);
    if (cols.wkt >= 0) {
      return rowsToGeoJsonFromWkt(parsed, cols.wkt, file.name);
    }
    if (cols.lat === -1 || cols.lng === -1) {
      const got = parsed.headers.map((h) => `'${h}'`).join(', ');
      throw new Error(`找不到 lat/lng/WKT 列（识别了：${got.slice(0, 120)}）`);
    }
    return rowsToGeoJson(parsed, cols.lat, cols.lng, cols.alt, file.name);
  }

  // --- 格式：Shapefile (.shp + .dbf) ---
  async function parseShp(shpFile, dbfFile) {
    const shpUrl = makeBlobUrl(shpFile);
    const dbfUrl = makeBlobUrl(dbfFile);
    try {
      const ds = await Cesium.ShpDataSource.loadUrls([shpUrl, dbfUrl], { filename: shpFile.name });
      const features = [];
      let idx = 0;
      ds.entities.values.forEach((ent) => {
        const name = ent.name || ent.id || `shp_${idx}`;
        let coords = null;
        let geomType = null;
        if (ent.position) {
          const c = ent.position.getValue ? ent.position.getValue() : ent.position;
          if (c) {
            const carto = Cesium.Cartographic.fromCartesian(c);
            coords = [carto.longitude, carto.latitude];
            if (Math.abs(carto.height) > 0.5) coords.push(carto.height);
            geomType = 'Point';
          }
        } else if (ent.polyline && ent.polyline.positions) {
          const p = ent.polyline.positions.getValue ? ent.polyline.positions.getValue() : ent.polyline.positions;
          if (p && p.length >= 2) {
            coords = p.map((c) => {
              const carto = Cesium.Cartographic.fromCartesian(c);
              return [carto.longitude, carto.latitude];
            });
            geomType = 'LineString';
          }
        } else if (ent.polygon && ent.polygon.hierarchy) {
          const h = ent.polygon.hierarchy.getValue ? ent.polygon.hierarchy.getValue() : ent.polygon.hierarchy;
          if (h && h.positions && h.positions.length >= 3) {
            coords = h.positions.map((c) => {
              const carto = Cesium.Cartographic.fromCartesian(c);
              return [carto.longitude, carto.latitude];
            });
            geomType = 'Polygon';
          }
        }
        if (coords && geomType) {
          features.push({
            type: 'Feature',
            id: `shp_${idx}`,
            geometry: { type: geomType, coordinates: geomType === 'Polygon' ? [coords] : coords },
            properties: { name },
          });
          idx++;
        }
      });
      return { type: 'FeatureCollection', features, name: shpFile.name };
    } finally {
      URL.revokeObjectURL(shpUrl);
      URL.revokeObjectURL(dbfUrl);
    }
  }

  // 把 default 图层里的所有要素迁到一个新图层（文件名/时间戳命名）
  // 用于：旧版本导入的数据全在 default 层，用户希望一键整理
  const handlePromoteDefault = useCallback(() => {
    if (!api) return;
    const ds = api.getEditorDataSource();
    if (!ds) return;
    const defaultFids = [];
    ds.entities.values.forEach((e) => {
      const p = e && e.properties;
      const lid = p && p.layerId && p.layerId.getValue ? p.layerId.getValue() : p && p.layerId;
      if (lid === 'default' || lid === undefined || lid === null) {
        const fid = p && p.featureId && p.featureId.getValue ? p.featureId.getValue() : p && p.featureId;
        if (fid) defaultFids.push(fid);
      }
    });
    if (!defaultFids.length) {
      onInfo && onInfo('默认图层无要素，无需迁移');
      return;
    }
    const name = `default-${new Date().toISOString().slice(0, 16).replace('T', '_')}`;
    const id = 'layer_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    setLayers((arr) => [...arr, { id, name, visible: true, locked: false }]);
    setActiveLayerId(id);
    setExpandedLayerIds((prev) => new Set([...prev, id]));
    defaultFids.forEach((fid) => {
      const ent = ds.entities.getById(fid);
      if (ent && ent.properties) {
        try { ent.properties.layerId = id; } catch (_) {}
      }
    });
    refreshFeatures();
    onInfo && onInfo(`已将 ${defaultFids.length} 个要素迁入新图层「${name}」`);
  }, [api, refreshFeatures, onInfo]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.__editorPromoteDefault = () => handlePromoteDefault();
    return () => { try { delete window.__editorPromoteDefault; } catch (_) {} };
  }, [handlePromoteDefault]);

  const ensureLayerForImport = useCallback((rawBaseName) => {
    const baseName = (rawBaseName || '导入').trim().slice(0, 32) || '导入';
    const existing = new Set(layers.map((l) => l.name));
    let name = baseName;
    let i = 2;
    while (existing.has(name)) name = `${baseName} (${i++})`;
    const id = 'layer_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    setLayers((arr) => [...arr, { id, name, visible: true, locked: false }]);
    setActiveLayerId(id);
    // 默认展开新图层，让用户能立即看到导入的要素
    setExpandedLayerIds((prev) => new Set([...prev, id]));
    return id;
  }, [layers, setActiveLayerId]);

  // --- 主入口：处理多文件 ---
  const handleImportFile = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    const shpPending = shpPendingRef.current;
    const pendingErrors = [];

    // 分离 shapefile 部分和其他
    const otherFiles = [];
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'shp' || ext === 'dbf') {
        const base = file.name.replace(/\.(shp|dbf)$/i, '');
        if (!shpPending[base]) shpPending[base] = { shp: null, dbf: null };
        if (ext === 'shp') shpPending[base].shp = file;
        else shpPending[base].dbf = file;
      } else {
        otherFiles.push(file);
      }
    }

    // 处理非 SHP 文件 — 每个文件一个图层
    for (const file of otherFiles) {
      try {
        const ext = file.name.split('.').pop()?.toLowerCase();
        let json;
        if (ext === 'kml') {
          json = await parseKml(file);
        } else if (ext === 'xlsx' || ext === 'xls') {
          json = await parseXlsx(file);
        } else if (ext === 'csv' || ext === 'txt') {
          json = await parseDelimFile(file);
        } else {
          // geojson / json
          const text = await file.text();
          json = JSON.parse(text);
        }
        const baseName = file.name.replace(/\.[^.]+$/, '');
        const layerId = ensureLayerForImport(baseName);
        const created = importGeoJSON(api, json, layerId, DEFAULT_STYLE);
        refreshFeatures();
        onInfo && onInfo(`已导入 ${created.length} 个要素（${file.name}）`);
      } catch (err) {
        console.error('[Editor] import failed', err);
        onError && onError(`${file.name}：${err.message || '导入失败'}`);
      }
    }

    // 处理配齐的 SHP+Dbf — 也新建图层
    const completedBases = [];
    for (const [base, pair] of Object.entries(shpPending)) {
      if (pair.shp) {
        if (!pair.dbf) {
          // 等待 .dbf
          pendingErrors.push(`${pair.shp.name}：等待同名 .dbf 文件…`);
        } else {
          try {
            const json = await parseShp(pair.shp, pair.dbf);
            const layerId = ensureLayerForImport(base);
            const created = importGeoJSON(api, json, layerId, DEFAULT_STYLE);
            refreshFeatures();
            onInfo && onInfo(`已导入 ${created.length} 个要素（SHP: ${pair.shp.name}）`);
          } catch (err) {
            console.error('[Editor] shp import failed', err);
            onError && onError(`SHP: ${pair.shp.name} — ${err.message || '导入失败'}`);
          }
          completedBases.push(base);
        }
      }
    }
    // 清理已处理的
    completedBases.forEach((b) => delete shpPending[b]);

    if (pendingErrors.length) {
      pendingErrors.forEach((msg) => onError && onError(msg));
    }
  }, [api, refreshFeatures, onInfo, onError, ensureLayerForImport]);

  // 图层 —— 单一来源：createLayer(input) 供 UI 按钮 / 沙箱 / AI 共用
  // UI 按钮走 window.prompt 拿名字；AI/sandbox 直接传 { name } 即可
  const createLayer = useCallback((input = {}) => {
    const name = (input.name || '').trim();
    if (!name) return { ok: false, error: '图层名不能为空' };
    if (layers.some((l) => l.name === name)) {
      return { ok: false, error: `图层名「${name}」已存在` };
    }
    const id = input.id || ('layer_' + Date.now().toString(36));
    const layer = { id, name, visible: input.visible !== false, locked: !!input.locked };
    const cmd = LayerCreateCommand(setLayers, setActiveLayerId, layer, refreshFeatures);
    undoApi.push(cmd);
    onInfo && onInfo(`已创建图层「${name}」`);
    return { ok: true, layer };
  }, [layers, undoApi, refreshFeatures, onInfo]);

  const handleCreateLayer = () => {
    const name = window.prompt('新图层名称', `图层 ${layers.length}`);
    if (!name) return;
    createLayer({ name });
  };
  const handleDeleteLayer = (id) => {
    if (id === 'default') return;
    setLayers((arr) => arr.filter((l) => l.id !== id));
    setFeatures((arr) => arr.map((f) => f.layerId === id ? { ...f, layerId: 'default' } : f));
    if (activeLayerId === id) setActiveLayerId('default');
    setExpandedLayerIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  // 整个图层显隐(批量切换该层下所有要素)
  const handleLayerVisibility = useCallback((layerId) => {
    if (!api) return;
    const ds = api.getEditorDataSource();
    if (!ds) return;
    const ents = features
      .filter((f) => f.layerId === layerId)
      .map((f) => ds.entities.getById(f.featureId))
      .filter(Boolean);
    if (!ents.length) return;
    const layerVisible = layers.find((l) => l.id === layerId);
    const wasVisible = !layerVisible || layerVisible.visible !== false;
    const nextVisible = !wasVisible;
    ents.forEach((ent) => { try { ent.show = nextVisible; } catch (_) {} });
    setLayers((arr) => arr.map((l) => l.id === layerId ? { ...l, visible: nextVisible } : l));
    refreshFeatures();
    onInfo && onInfo(`${nextVisible ? '显示' : '隐藏'} 图层「${layerVisible && layerVisible.name || layerId}」(${ents.length} 个要素)`);
  }, [api, features, layers, refreshFeatures, onInfo]);

  const handleToggleExpand = useCallback((layerId) => {
    setExpandedLayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId); else next.add(layerId);
      return next;
    });
  }, []);

  // 选中集批量操作(按图层)
  const handleSelectAllInLayer = useCallback((layerId) => {
    const fids = features.filter((f) => f.layerId === layerId).map((f) => f.featureId);
    setSelection((prev) => {
      const next = new Set(prev);
      fids.forEach((fid) => next.add(fid));
      return next;
    });
    onInfo && onInfo(`图层内全选 ${fids.length} 个`);
  }, [features, setSelection, onInfo]);

  const handleSelectNoneInLayer = useCallback((layerId) => {
    const fids = new Set(features.filter((f) => f.layerId === layerId).map((f) => f.featureId));
    setSelection((prev) => {
      const next = new Set(prev);
      fids.forEach((fid) => next.delete(fid));
      return next;
    });
  }, [features, setSelection]);

  const handleSelectInvertInLayer = useCallback((layerId) => {
    const fids = features.filter((f) => f.layerId === layerId).map((f) => f.featureId);
    setSelection((prev) => {
      const next = new Set(prev);
      fids.forEach((fid) => {
        if (next.has(fid)) next.delete(fid); else next.add(fid);
      });
      return next;
    });
  }, [features, setSelection]);

  // 属性表面板 state
  const [attrTableOpen, setAttrTableOpen] = useState(false);
  // 空间分析面板 state
  const [analysisOpen, setAnalysisOpen] = useState(false);
  // 三项检查面板 state
  const [threeCheckOpen, setThreeCheckOpen] = useState(false);
  // 打印/导出面板 state（阶段 2B）
  const [printExportOpen, setPrintExportOpen] = useState(false);

  // 给 AnalysisPanel 提供 selectedEntities 解析
  const getSelectedEntities = useCallback(() => {
    if (!api || !selectedIds || selectedIds.size === 0) return [];
    const ds = api.getEditorDataSource && api.getEditorDataSource();
    if (!ds) return [];
    return Array.from(selectedIds)
      .map((fid) => ds.entities.getById(fid))
      .filter(Boolean);
  }, [api, selectedIds]);

  // 暴露给父组件（index.jsx 的 AI 助手需要读图层名/要素/选中集；
  // 图层名只存在于本组件 state，实体上只有 layerId）
  // 工具方法：把名字/ID 都接受，返回 {ok, layerId | error}
  const resolveLayerId = useCallback((layerIdOrName) => {
    if (!layerIdOrName) return { ok: false, error: '缺少 layerId' };
    const hit = layers.find((l) => l.id === layerIdOrName || l.name === layerIdOrName);
    if (!hit) return { ok: false, error: `图层「${layerIdOrName}」不存在` };
    return { ok: true, layerId: hit.id, layer: hit };
  }, [layers]);

  // 暴露给 AI / 沙箱的语义操作集（每个方法都返回 {ok, ...}）
  const setActiveLayer = useCallback((layerIdOrName) => {
    const r = resolveLayerId(layerIdOrName);
    if (!r.ok) return r;
    setActiveLayerId(r.layerId);
    return { ok: true, layerId: r.layerId };
  }, [resolveLayerId]);

  const setLayerVisibility = useCallback((input) => {
    const lid = input && (input.layerId || input.layer);
    const r = resolveLayerId(lid);
    if (!r.ok) return r;
    const targetVisible = input.visible !== undefined ? !!input.visible : (r.layer.visible === false);
    const wasVisible = r.layer.visible !== false;
    if (targetVisible === wasVisible) return { ok: true, layerId: r.layerId, visible: targetVisible, noop: true };
    const fids = features.filter((f) => f.layerId === r.layerId).map((f) => f.featureId);
    const cmd = LayerVisibilityCommand(api, fids, r.layerId, wasVisible, targetVisible, setLayers, refreshFeatures);
    undoApi.push(cmd);
    return { ok: true, layerId: r.layerId, visible: targetVisible, count: fids.length };
  }, [api, features, resolveLayerId, undoApi, refreshFeatures]);

  const assignFeaturesToLayer = useCallback((input) => {
    if (!api) return { ok: false, error: 'viewer api 不可用' };
    let fids = input.featureIds || [];
    if (!fids.length && input.layer) {
      const r = resolveLayerId(input.layer);
      if (!r.ok) return r;
      fids = features.filter((f) => f.layerId === r.layerId).map((f) => f.featureId);
    }
    if (!fids.length) return { ok: false, error: '没有要迁移的要素' };
    // 目标图层不存在时自动创建（AI 友好：用户不必先 create 再 move）
    let target = resolveLayerId(input.to);
    if (!target.ok) {
      const created = createLayer({ name: input.to });
      if (!created.ok) return created;
      target = { ok: true, layerId: created.layer.id, layer: created.layer };
    }
    const ds = api.getEditorDataSource();
    const ents = fids.map((fid) => ds && ds.entities.getById(fid)).filter(Boolean);
    if (!ents.length) return { ok: false, error: '找不到实体（可能被删？）' };
    const cmd = LayerAssignCommand(api, ents, target.layerId, refreshFeatures);
    undoApi.push(cmd);
    return { ok: true, count: ents.length, layerId: target.layerId, layerName: target.layer.name };
  }, [api, features, resolveLayerId, undoApi, refreshFeatures, createLayer]);

  const deleteFeatures = useCallback((input) => {
    if (!api) return { ok: false, error: 'viewer api 不可用' };
    let fids = input.featureIds || [];
    if ((!fids.length || input.all) && input.layer) {
      const r = resolveLayerId(input.layer);
      if (!r.ok) return r;
      fids = features.filter((f) => f.layerId === r.layerId).map((f) => f.featureId);
    }
    if (!input.featureIds && !input.layer && !input.all) {
      // 默认：删除当前选中集
      fids = Array.from(selectedIds);
    }
    if (!fids.length) return { ok: false, error: '没有要删除的要素' };
    const ds = api.getEditorDataSource();
    const ents = fids.map((fid) => ds && ds.entities.getById(fid)).filter(Boolean);
    if (!ents.length) return { ok: false, error: '找不到实体' };
    const cmd = BatchDeleteCommand(api, ents, refreshFeatures);
    undoApi.push(cmd);
    // 同步清掉选中集里已删的 ID
    if (selectedIds.size) {
      clearSelection();
    }
    return { ok: true, count: ents.length, featureIds: fids };
  }, [api, features, selectedIds, resolveLayerId, undoApi, refreshFeatures, clearSelection]);

  const setAttributes = useCallback((input) => {
    if (!api) return { ok: false, error: 'viewer api 不可用' };
    const fid = input.featureId || input.fid;
    if (!fid) return { ok: false, error: '缺少 featureId' };
    const changes = input.changes || (input.key ? { [input.key]: input.value } : null);
    if (!changes) return { ok: false, error: '缺少 changes' };
    const ds = api.getEditorDataSource();
    const ent = ds && ds.entities.getById(fid);
    if (!ent) return { ok: false, error: `找不到要素 ${fid}` };
    const oldAttrs = readAttrs(ent);
    const cmd = BatchAttrCommand(api, fid, oldAttrs, changes, refreshFeatures);
    undoApi.push(cmd);
    return { ok: true, featureId: fid, changedKeys: Object.keys(changes) };
  }, [api, undoApi, refreshFeatures]);

  // AI / 沙箱用 setSelection：兼容 { featureIds, layer, mode }
  const imperativeSetSelection = useCallback((input = {}) => {
    let fids = input.featureIds || [];
    if (!fids.length && input.layer) {
      const r = resolveLayerId(input.layer);
      if (!r.ok) return r;
      fids = features.filter((f) => f.layerId === r.layerId).map((f) => f.featureId);
    }
    if (input.mode === 'all' && input.layer) {
      const r = resolveLayerId(input.layer);
      if (!r.ok) return r;
      fids = features.filter((f) => f.layerId === r.layerId).map((f) => f.featureId);
    } else if (input.mode === 'none' && input.layer) {
      const r = resolveLayerId(input.layer);
      if (!r.ok) return r;
      const target = new Set(features.filter((f) => f.layerId === r.layerId).map((f) => f.featureId));
      fids = Array.from(selectedIds).filter((id) => !target.has(id));
    } else if (input.mode === 'invert' && input.layer) {
      const r = resolveLayerId(input.layer);
      if (!r.ok) return r;
      const layerFids = new Set(features.filter((f) => f.layerId === r.layerId).map((f) => f.featureId));
      const stay = Array.from(selectedIds).filter((id) => !layerFids.has(id));
      const add = features.filter((f) => f.layerId === r.layerId && !selectedIds.has(f.featureId)).map((f) => f.featureId);
      fids = [...stay, ...add];
    }
    setSelection(new Set(fids));
    return { ok: true, selectedIds: fids };
  }, [features, selectedIds, setSelection, resolveLayerId]);

  const imperativeClearSelection = useCallback(() => {
    clearSelection();
    return { ok: true, selectedIds: [] };
  }, [clearSelection]);

  const flyToFeatures = useCallback((input = {}) => {
    if (!api) return { ok: false, error: 'viewer api 不可用' };
    let fids = input.featureIds || [];
    if (!fids.length && input.layer) {
      const r = resolveLayerId(input.layer);
      if (!r.ok) return r;
      fids = features.filter((f) => f.layerId === r.layerId).map((f) => f.featureId);
    }
    if (!fids.length) return { ok: false, error: '没有目标要素' };
    const ds = api.getEditorDataSource();
    const ents = fids.map((fid) => ds && ds.entities.getById(fid)).filter(Boolean);
    if (!ents.length) return { ok: false, error: '找不到实体' };
    const v = api.getViewer();
    if (!v) return { ok: false, error: 'viewer 不可用' };
    try { v.flyTo(ents, { duration: input.duration || 1.0 }); } catch (_) {}
    return { ok: true, count: ents.length };
  }, [api, features, resolveLayerId]);

  // programmaticDraw: 沙箱 / AI 直接画一个要素，返回 featureId
  const programmaticDraw = useCallback((input) => {
    if (!api) return { ok: false, error: 'viewer api 不可用' };
    const positions = Array.isArray(input.lnglats)
      ? lngLatHeightsToCartesians(input.lnglats)
      : (input.positions || []);
    if (!positions.length) return { ok: false, error: '缺少 lnglats/positions' };
    const r = addEditorFeature(api, {
      id: input.id || input.featureId,
      name: input.name,
      kind: input.kind,
      positions,
      layerId: input.layerId || activeLayerId,
      style: input.style,
      attrs: input.attrs || {},
    });
    if (!r.ok) return r;
    const snap = {
      featureId: r.featureId, kind: r.kind, layerId: r.layerId,
      style: r.normalized.style, name: r.normalized.name,
      positions: r.normalized.positions, attrs: r.normalized.attrs || {},
    };
    const cmd = AddCommand(api, snap, refreshFeatures);
    undoApi.push(cmd);
    return { ok: true, featureId: r.featureId, kind: r.kind, layerId: r.layerId };
  }, [api, activeLayerId, undoApi, refreshFeatures]);

  useImperativeHandle(ref, () => ({
    // 旧的 4 个 getter（保留向后兼容）
    getLayers: () => layers,
    getFeatures: () => features,
    getSelectedIds: () => selectedIds,
    getActiveLayerId: () => activeLayerId,
    // 新增 11 个语义操作
    createLayer,
    setActiveLayer,
    setLayerVisibility,
    assignFeaturesToLayer,
    deleteFeatures,
    setAttributes,
    setSelection: imperativeSetSelection,
    clearSelection: imperativeClearSelection,
    flyToFeatures,
    programmaticDraw,
    refresh: () => { refreshFeatures(); return { ok: true, count: features.length }; },
    // 给 AI / 测试用的 layer 解析
    resolveLayerId,
    // 命令模式撤销栈：CodeEditor 的 ⏪ 撤销按钮同时调它
    undo: () => {
      const c = undoApi.undo();
      return c ? { ok: true, label: c.label } : { ok: false, reason: 'empty' };
    },
    redo: () => {
      const c = undoApi.redo();
      return c ? { ok: true, label: c.label } : { ok: false, reason: 'empty' };
    },
    canUndo: () => undoApi.canUndo(),
    canRedo: () => undoApi.canRedo(),
    clearUndo: () => undoApi.clear(),
    // 阶段 11：AI 入口用 withSource('ai', fn) 包，期间 push 的 cmd 自动 source='ai'
    withSource: undoApi.withSource,
    pushBatch: undoApi.pushBatch,
    peekUndoSource: undoApi.peekSource,
  }), [layers, features, selectedIds, activeLayerId, createLayer, setActiveLayer, setLayerVisibility, assignFeaturesToLayer, deleteFeatures, setAttributes, imperativeSetSelection, imperativeClearSelection, flyToFeatures, programmaticDraw, refreshFeatures, resolveLayerId, undoApi]);

  return (
    <EditorErrorBoundary>
      <input
        ref={fileInputRef}
        type="file"
        accept=".geojson,.json,.kml,.xlsx,.xls,.csv,.txt,.shp,.dbf"
        multiple
        aria-label="导入地理数据文件（GeoJSON/KML/CSV/Excel/Shapefile 等）"
        title="导入文件"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />

      {/* CursorReadout 已迁移到 CesiumEarth 底栏（共享 index.jsx 的 coordFormat 状态） */}
      <EditorToolbar
        open={open}
        onToggle={() => setOpen((v) => !v)}
        viewerReady={viewerReady}
        mode={mode}
        onModeChange={(m) => {
          setMode(m);
          if (m !== 'select' && m !== 'edit-vertices') clearSelection();
        }}
        draftCount={draftCount}
        measureLive={measureLive}
        onClearMeasure={clearMeasure}
        layers={layers}
        activeLayerId={activeLayerId}
        onSelectLayer={setActiveLayerId}
        onCreateLayer={handleCreateLayer}
        onDeleteLayer={handleDeleteLayer}
        expandedLayerIds={expandedLayerIds}
        onToggleExpand={handleToggleExpand}
        onLayerVisibility={handleLayerVisibility}
        features={features}
        selectedIds={selectedIds}
        onFeatureVisibility={handleToggleVisible}
        onSelectFeature={setSelection}
        onSelectAllInLayer={handleSelectAllInLayer}
        onSelectNoneInLayer={handleSelectNoneInLayer}
        onSelectInvertInLayer={handleSelectInvertInLayer}
        onFlyTo={handleFlyTo}
        onDeleteFeature={handleDeleteOne}
        onLayerAssign={handleLayerAssign}
        canUndo={undoApi.canUndo}
        canRedo={undoApi.canRedo}
        onUndo={() => {
          const cmd = undoApi.undo();
          if (cmd) onInfo && onInfo(`撤销：${cmd.label}`);
        }}
        onRedo={() => {
          const cmd = undoApi.redo();
          if (cmd) onInfo && onInfo(`重做：${cmd.label}`);
        }}
        onPromoteDefault={handlePromoteDefault}
        onClearAll={handleClearAll}
        onImport={handleImportClick}
        onExportGeoJSON={handleExportGeoJSON}
        onExportKML={handleExportKML}
        onExportPNG={handleExportPNG}
        selectedCount={selectedIds.size}
        onFlyToActiveLayer={handleFlyToActiveLayer}
        onToggleFullscreen={handleToggleFullscreen}
        onShareView={handleShareView}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        snapSettings={snapSettings}
        onSnapChange={(s) => {
          setSnapSettings(s);
          try { localStorage.setItem(SNAP_KEY, JSON.stringify(s)); } catch (_) {}
        }}
        canSimplify={simplifiable}
        onSimplify={handleOpenSimplify}
        onToggleAttrTable={() => setAttrTableOpen((v) => !v)}
        attrTableOpen={attrTableOpen}
        onToggleAnalysis={() => setAnalysisOpen((v) => !v)}
        analysisOpen={analysisOpen}
        onToggleThreeCheck={() => setThreeCheckOpen((v) => !v)}
        threeCheckOpen={threeCheckOpen}
        onTogglePrintExport={() => setPrintExportOpen((v) => !v)}
        printExportOpen={printExportOpen}
      />

      <StylePanel
        api={api}
        open={open}
        selectedIds={selectedIds}
        features={features}
      />

      <SimplifyDialog
        open={simplifyOpen}
        onClose={() => { setSimplifyOpen(false); simplify.clearPreview(); }}
        entity={singleSelectedEntity}
        kind={singleSelectedKind}
        onPreview={handleSimplifyPreviewRender}
        onApply={handleSimplifyApply}
      />

      <AttributeTablePanel
        api={api}
        open={attrTableOpen}
        onClose={() => setAttrTableOpen(false)}
        features={features}
        selectedIds={selectedIds}
        onSelect={handleSelectOne}
        onFlyTo={handleFlyTo}
        pushCommand={(cmd) => undoApi.push(cmd)}
        refresh={refreshFeatures}
      />

      <AnalysisPanel
        api={api}
        open={analysisOpen}
        onClose={() => setAnalysisOpen(false)}
        selectedIds={selectedIds}
        getSelectedEntities={getSelectedEntities}
        pushCommand={(cmd) => undoApi.push(cmd)}
        refresh={refreshFeatures}
        onInfo={onInfo}
        onApply={(producedFids) => {
          // 分析结果自动选中
          setSelection(new Set(producedFids));
        }}
      />

      <PrintExportPanel
        api={api}
        open={printExportOpen}
        onClose={() => setPrintExportOpen(false)}
        dataSource={api && api.viewer && api.viewer.dataSources ? api.viewer.dataSources.get(0) : null}
        selectedIds={selectedIds}
        features={features}
        onInfo={onInfo}
      />

      <ThreeCheckPanel
        open={threeCheckOpen}
        onClose={() => setThreeCheckOpen(false)}
        selectedIds={selectedIds}
        getSelectedEntities={getSelectedEntities}
        onInfo={onInfo}
      />
    </EditorErrorBoundary>
  );
});