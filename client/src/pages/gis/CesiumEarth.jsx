// Cesium 三维地球容器
// - 通过 forwardRef 暴露动作 API（flyTo / addMarker / drawRect / ...）
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useTheme } from '../../components/ThemeProvider.jsx';
import { snapshotCamera, applyCameraSnapshot } from '../../utils/viewState.js';
import { gisApi } from '../../api/index.js';
import CursorReadout from './editor/CursorReadout.jsx';
import { addEditorFeature } from './editor/utils/featureFactory.js';
import { notifyEditorDataChange } from './editor/EditorDataBridge.js';
import { AddCommand } from './editor/utils/commands.js';

// 暴露 Cesium 给冒烟测试/E2E（生产也暴露，无副作用：Cesium 本来就已在 bundle 里）
if (typeof window !== 'undefined' && !window.Cesium) {
  window.Cesium = Cesium;
}

// 默认相机：中国上空，4M m 高度，俯视略倾斜
const DEFAULT_CAMERA = {
  destination: Cesium.Cartesian3.fromDegrees(110, 35, 4_000_000),
  orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
};

// 从 entity 上抽出所有 Cartesian3（用于 bbox 计算；兼容拖入文件的 entity，没有 editor 的 feature 结构）
function entityCartesians(entity) {
  try {
    if (entity.position) {
      const c = entity.position.getValue ? entity.position.getValue(undefined) : entity.position;
      return c ? [c] : [];
    }
    if (entity.polyline && entity.polyline.positions) {
      const p = entity.polyline.positions.getValue ? entity.polyline.positions.getValue(undefined) : entity.polyline.positions;
      return Array.isArray(p) ? p : [];
    }
    if (entity.polygon && entity.polygon.hierarchy) {
      const h = entity.polygon.hierarchy.getValue ? entity.polygon.hierarchy.getValue(undefined) : entity.polygon.hierarchy;
      return (h && h.positions) || [];
    }
  } catch (_) {}
  return [];
}

// 自定义影像源 ProviderViewModel 列表 —— 注册到 Cesium 的 baseLayerPicker
// 顺序：第一个为默认底图（天地图 → Esri → OSM → 高德卫星 → 腾讯卫星）
// 天地图需要服务端配置 Token，Token 未配置时自动跳过
// 注意：Token 来自服务端（不再读 localStorage），避免 XSS 窃取
function createImageryViewModels(tdtToken = '') {
  const make = (name, tooltip, iconSvg, factory) =>
    new Cesium.ProviderViewModel({
      name,
      tooltip,
      iconUrl: `data:image/svg+xml;utf8,${encodeURIComponent(iconSvg)}`,
      creationFunction: factory,
    });
  // 极简 SVG 图标（16x16），color-inherit 在 Cesium 面板里会自动着色
  const pinSvg = (label) => `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" fill="#3b82f6" rx="3"/><text x="10" y="14" font-size="11" font-family="sans-serif" fill="white" text-anchor="middle">${label}</text></svg>`;

  return [
    // 1. 天地图（需 Token，国内最快）
    ...(tdtToken ? [make(
      '天地图',
      '国家地理信息公共服务平台（国内速度最快）',
      pinSvg('TDT'),
      () => new Cesium.UrlTemplateImageryProvider({
        url: `https://t0.tianditu.gov.cn/img_w/wmts?service=wmts&request=GetTile&version=1.0.0&layer=img&style=default&format=tiles&tileMatrixSet=w&tileMatrix={z}&tileRow={y}&tileCol={x}&tk=${tdtToken}`,
        credit: '© 天地图',
        maximumLevel: 18,
      })
    )] : []),
    // 2. Esri 卫星
    make(
      'Esri 卫星',
      'Esri World Imagery 卫星瓦片（国际通用，备用）',
      pinSvg('Esri'),
      () => new Cesium.UrlTemplateImageryProvider({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        credit: '© Esri',
        maximumLevel: 18,
      })
    ),
    // 3. OSM
    make(
      'OpenStreetMap',
      'OSM 标准瓦片（.de 镜像，兜底）',
      pinSvg('OSM'),
      () => new Cesium.UrlTemplateImageryProvider({
        url: 'https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png',
        subdomains: ['a', 'b', 'c'],
        credit: '© OpenStreetMap contributors',
        maximumLevel: 19,
      })
    ),
    // 4. 高德卫星（影像，非矢量）
    make(
      '高德卫星',
      '高德地图卫星影像（国内可用）',
      pinSvg('Gaode'),
      () => new Cesium.UrlTemplateImageryProvider({
        url: 'https://webst0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=6&x={x}&y={y}&z={z}',
        subdomains: ['1', '2', '3', '4'],
        credit: '© AutoNavi',
        maximumLevel: 18,
      })
    ),
    // 5. 腾讯卫星
    make(
      '腾讯卫星',
      '腾讯地图卫星影像（国内速度较快）',
      pinSvg('腾讯'),
      () => new Cesium.UrlTemplateImageryProvider({
        url: 'https://p0.map.gtimg.com/sateTiles/{z}/{x}/{y}.jpg',
        credit: '© Tencent',
        maximumLevel: 16,
      })
    ),
  ];
}

// 失败自动切换：连续 N 张 tile 失败后切换到下一个 provider
const MAX_CONSECUTIVE_TILE_ERRORS = 3;

function setupImageryWithFallback(viewer, providers, onProviderReady) {
  if (!providers || providers.length === 0) return;

  let currentIdx = 0;
  let currentLayer = null;
  let errorCount = 0;

  function tryNext() {
    if (currentIdx >= providers.length) {
      console.warn('[CesiumEarth] All imagery providers failed');
      return;
    }
    const prov = providers[currentIdx];
    let layer;
    try {
      // _creationCommand: Cesium 内部存储实际 factory 函数的属性（Knockout observable 的底层）
      // creationFunction 是 Knockout 包装属性，在某些重构场景下可能丢失，用 _creationCommand 更稳
      layer = viewer.imageryLayers.addImageryProvider(prov._creationCommand());
    } catch (e) {
      console.warn(`[CesiumEarth] Provider "${prov.name}" init failed: ${e.message}`);
      currentIdx++;
      tryNext();
      return;
    }
    currentLayer = layer;
    errorCount = 0;
    onProviderReady && onProviderReady(prov.name);

    const ip = layer.imageryProvider;
    if (ip.errorEvent && typeof ip.errorEvent.addEventListener === 'function') {
      ip.errorEvent.addEventListener((err) => {
        errorCount++;
        if (errorCount >= MAX_CONSECUTIVE_TILE_ERRORS) {
          console.warn(`[CesiumEarth] Provider "${prov.name}" exceeded ${MAX_CONSECUTIVE_TILE_ERRORS} tile errors, switching`);
          viewer.imageryLayers.remove(layer, false);
          currentIdx++;
          tryNext();
        }
      });
    }
  }

  tryNext();
}

const CesiumEarth = forwardRef(function CesiumEarth(
  {
    coordFormat = 'dec',
    onCoordFormatChange,
    onPointClick, // (lat, lon) => void
    onInfo,        // (text) => void
    tdtTokenOverride = '', // 用户在弹窗里手动输入的天地图 token（仅会话内）
    onError,       // (err) => void
    editorApiRef = null, // 阶段 2B: 把 EditorPanel 的命令式 ref 透传给内部 CursorReadout,用于显示选中数 / undo 状态
  },
  ref
) {
  const { resolved: resolvedTheme } = useTheme();
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const handlerRef = useRef(null);
  // 编辑器专用数据源：单独管理，避免与其他 entities 操作冲突
  const editorDsRef = useRef(null);
  // 编辑器在绘制/编辑模式下设为 true，关闭天气查询的 LEFT_CLICK 处理
  const inputBlockedRef = useRef(false);
  const heatmapRef = useRef(null);
  // 数据源注册表（FileLoader 上传的文件）：id → {name, kind, source|primitive, visible}
  const dataSourceRegistry = useRef(new Map()).current;

  // 初始化 + 销毁
  useEffect(() => {
    if (!containerRef.current) return;
    let viewer, ro, handler;
    let cancelled = false;

    // 从服务端拉取 Cesium Ion token（不再读 localStorage）
    // 失败时回退到无 token 模式（OSM / Esri / 高德 等公开底图仍可用）
    gisApi.cesiumToken()
      .then((d) => {
        if (cancelled) return;
        if (d?.token) Cesium.Ion.defaultAccessToken = d.token;
      })
      .catch(() => {});

    // 天地图 token：先创建无 token 的 viewModels；如果服务端有 token，再异步重建注册
    let imageryViewModels = createImageryViewModels(tdtTokenOverride || '');
    gisApi.tdtToken()
      .then((d) => {
        if (cancelled || !viewer) return;
        // 优先使用服务端 token；如果用户 override 了一个明确的 token 则用 override
        const finalToken = tdtTokenOverride || d?.token || '';
        if (!finalToken) return;
        const newModels = createImageryViewModels(finalToken);
        viewer.baseLayerPicker.viewModel.imageryProviderViewModels = newModels;
        viewer.baseLayerPicker.viewModel.selectedImagery = newModels[0];
      })
      .catch(() => {});

    (async () => {
      try {
        // 无 Ion token 时清空默认 token，避免 Cesium 用已失效的默认 token 访问 Ion 资产导致渲染崩溃
        // 后续 gisApi.cesiumToken() 回调里如有真实 token 会覆盖
        if (!Cesium.Ion.defaultAccessToken || Cesium.Ion.defaultAccessToken.length < 10) {
          Cesium.Ion.defaultAccessToken = '';
        }
        viewer = new Cesium.Viewer(containerRef.current, {
          // 关闭：动画/时间轴（当前用例不需要时间动态数据）
          animation: false,
          timeline: false,
          // 开启：Sandcastle 风格的控件
          baseLayerPicker: true,   // 影像/地形切换
          geocoder: true,           // 地点搜索
          homeButton: true,          // 回到默认视角
          sceneModePicker: true,     // 2D / 3D / Columbus 切换
          navigationHelpButton: true,// 鼠标快捷键帮助
          fullscreenButton: true,    // 全屏（已开）
          infoBox: false,
          selectionIndicator: false,
          // 把自定义源（高德/Esri/OSM）注册到 baseLayerPicker；Cesium ion 源需 token 才能用
          imageryProviderViewModels: imageryViewModels,
          selectedImageryProviderViewModel: imageryViewModels[0],  // 默认高德
          terrainProviderViewModels: [], // 不切换地形
          // WebGL 不开 alpha（不透明 canvas 性能更好）
          // preserveDrawingBuffer: 编辑器截图依赖 canvas.toDataURL() 拿到非空像素
          contextOptions: { webgl: { alpha: false, preserveDrawingBuffer: true } },
        });
      } catch (err) {
        console.error('[CesiumEarth] viewer init failed:', err);
        onError && onError(err);
        return;
      }
      if (cancelled) { try { viewer.destroy(); } catch (_) {} return; }

      viewer.scene.globe.enableLighting = false;
      viewer.scene.skyAtmosphere.show = true;
      // 兜底色：所有影像都失败时不显示 Cesium 默认的纯蓝，给一个深色调地球感
      try { viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0e1422'); } catch (_) {}

      // 用失败自动切换逻辑加载底图
      viewer.imageryLayers.removeAll();
      setupImageryWithFallback(viewer, imageryViewModels, (providerName) => {
        onInfo && onInfo(`底图加载：${providerName}`);
      });
      // 关闭 msaaResolutions 之类的运行时噪音
      // 阶段 2E: requestRenderMode = true 让 viewer 只在状态变化时重绘(相机/动画/数据变更/手动 requestRender)
      // 默认 false 会每帧 60fps 都渲染,大场景(>500 要素)浪费 30-50% GPU
      // 阶段 1 polish: 亮主题下额外开启 targetFrameRate 限帧（深色用 60fps,亮主题 30fps 省电）
      viewer.scene.requestRenderMode = true;
      viewer.scene.maximumRenderTimeChange = Infinity;
      viewer.targetFrameRate = resolvedTheme === 'light' ? 30 : 60;
      // 阶段 2E: 开启地形深度测试 —— 要素被山体遮挡时不渲染
      // 默认 false 在山区场景里会把所有要素(包括地表下的)全画一遍
      viewer.scene.globe.depthTestAgainstTerrain = true;
      // 立刻飞到默认视角（不要 setTimeout 800ms，那时可能 layout 还没完）
      try {
        viewer.camera.setView(DEFAULT_CAMERA);
      } catch (e) {
        console.warn('[CesiumEarth] initial camera setView failed:', e);
      }
      viewerRef.current = viewer;

      // 编辑器数据源：单独管理
      try {
        if (!editorDsRef.current) {
          const ds = new Cesium.CustomDataSource('editor');
          const result = viewer.dataSources.add(ds);
          // Cesium 某些版本 add() 同步，某些版本返回 Promise
          if (result && typeof result.then === 'function') {
            result.then((resolved) => { editorDsRef.current = resolved; }).catch(() => {});
            editorDsRef.current = ds; // 临时存 ds，entities 操作立即可用
          } else {
            editorDsRef.current = result;
          }
          // dev mode: 暴露 editor DS 给冒烟测试
          if (typeof window !== 'undefined') {
            window.__editorDs = ds;
          }
        }
      } catch (e) {
        console.warn('[CesiumEarth] failed to create editor DataSource:', e);
      }

      // 容器尺寸监听：小画布下 Cesium 偶尔会出现地球被裁掉/全白的状况，
      // resize 时同时重置相机视角，确保地球始终回到画面中心
      const requestResize = () => {
        // 强制同步 layout flush：读取 offsetWidth 让浏览器立即完成布局计算，
        // 确保 container 的新尺寸已经生效，再通知 Cesium 调整 canvas
        try { const _ = containerRef.current.offsetWidth; } catch (_) {}
        try { viewer.resize(); } catch (_) {}
        try { viewer.camera.setView(DEFAULT_CAMERA); } catch (_) {}
        viewer.scene.requestRender();
      };
      requestResize();
      ro = new ResizeObserver(() => requestResize());
      ro.observe(containerRef.current);

      handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      // 编辑器在绘制/编辑模式下会通过 setInputBlocked(true) 关闭这个 handler
      // （避免点击地图时同时触发天气查询和绘制动作）
      handler.setInputAction((click) => {
        if (inputBlockedRef.current) return;
        try {
          const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
          if (!cartesian || !onPointClick) return;
          const carto = Cesium.Cartographic.fromCartesian(cartesian, viewer.scene.globe.ellipsoid);
          if (!carto) return;
          if (typeof carto.longitude !== 'number' || typeof carto.latitude !== 'number') return;
          if (!Number.isFinite(carto.longitude) || !Number.isFinite(carto.latitude)) return;
          onPointClick(
            Cesium.Math.toDegrees(carto.latitude),
            Cesium.Math.toDegrees(carto.longitude)
          );
        } catch (e) { console.warn('[CesiumEarth] LEFT_CLICK handler error:', e); }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      handlerRef.current = handler;

      onInfo && onInfo('底图加载完成');
      // dev 模式暴露 viewer 给冒烟测试用
      if (typeof window !== 'undefined') {
        window.__cesiumViewer = viewer;
      }
    })();

    return () => {
      cancelled = true;
      try { ro && ro.disconnect(); } catch (_) {}
      try { handler && handler.destroy(); } catch (_) {}
      try { viewer && viewer.destroy(); } catch (_) {}
      viewerRef.current = null;
      handlerRef.current = null;
      heatmapRef.current = null;
      // 必须清空：否则重挂载后 getEditorDataSource() 会返回绑在已销毁 viewer 上的旧 DS
      editorDsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 阶段 1 polish: 主题切换时同步 Cesium targetFrameRate
  // 亮主题限帧 30fps 节省 GPU/电量；暗主题保持 60fps 流畅度
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || typeof viewer.targetFrameRate !== 'undefined') return;
    viewer.targetFrameRate = resolvedTheme === 'light' ? 30 : 60;
    // requestRenderMode 已开，限帧主要影响相机动画时的渲染节奏
    viewer.scene.requestRender();
  }, [resolvedTheme]);

  /** 对外暴露的动作 API */
  const apiRef = useRef(null);
  useImperativeHandle(ref, () => ({
    flyTo({ lat, lon, name }) {
      const viewer = viewerRef.current;
      if (!viewer) return;
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, 1_500_000),
        duration: 1.2,
      });
      if (name) onInfo && onInfo(`飞向 ${name}`);
    },
    /** 阶段 2C: 当前 viewer 相机姿态快照 — 用于 URL 分享 */
    getCurrentViewState() {
      const viewer = viewerRef.current;
      if (!viewer) return null;
      const camera = snapshotCamera(viewer, Cesium);
      if (!camera) return null;
      return { camera };
    },
    /** 阶段 2C: 应用外部传入的 view state 到 viewer — 用于 URL 还原 */
    applyViewState(state) {
      const viewer = viewerRef.current;
      if (!viewer || !state || !state.camera) return;
      applyCameraSnapshot(viewer, Cesium, state.camera);
      onInfo && onInfo('已恢复视图状态');
    },
    flyToSequence(places, gapMs = 800) {
      places.forEach((p, i) => setTimeout(() => this.flyTo(p), i * gapMs));
    },
    /**
     * addPresentationMarker: 写 viewer.entities（不进编辑器桶，不在 LayersTree 里）
     * 用于"AI 想让用户看一眼但不让他编辑"的纯展示场景
     */
    addPresentationMarker(lat, lon, label, color = '#4ade80') {
      const viewer = viewerRef.current;
      if (!viewer) return;
      viewer.entities.add({
        id: 'ai-marker-' + Date.now(),
        name: label,
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        point: {
          pixelSize: 14,
          color: Cesium.Color.fromCssColorString(color),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: label,
          font: '14px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -28),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('rgba(0,0,0,0.7)'),
          backgroundPadding: new Cesium.Cartesian2(8, 4),
        },
      });
      this.flyTo({ lat, lon, name: label });
    },
    /**
     * drawPresentationPolygon: 写 viewer.entities（不进编辑器桶）
     */
    _drawPresentationPolygon(coords, label) {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const positions = coords.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat));
      viewer.entities.add({
        id: 'ai-polygon-' + Date.now(),
        name: label,
        polygon: {
          hierarchy: positions,
          material: Cesium.Color.fromCssColorString('rgba(108, 140, 255, 0.3)'),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#6c8cff'),
        },
      });
    },
    /**
     * 旧 addMarker：现在落到编辑器桶 → 出现在 LayersTree、可被 AI / 用户选中 / 编辑 / 撤销
     * 返回 featureId
     */
    addMarker(lat, lon, label, color = '#4ade80') {
      const api = this;
      const result = addEditorFeature(api, {
        kind: 'point',
        positions: [Cesium.Cartesian3.fromDegrees(lon, lat)],
        name: label,
        style: {
          pointSize: 14,
          pointColor: color,
          strokeColor: '#6c8cff',
          strokeWidth: 2,
          fillColor: 'rgba(108,140,255,0.35)',
        },
      });
      if (!result.ok) return null;
      notifyEditorDataChange();
      this.flyTo({ lat, lon, name: label });
      return result.featureId;
    },
    /**
     * 旧 drawRect：现在落到编辑器桶
     */
    drawRect(city, d = 2) {
      const coords = [
        [city.lon - d, city.lat - d],
        [city.lon + d, city.lat - d],
        [city.lon + d, city.lat + d],
        [city.lon - d, city.lat + d],
      ];
      const r = addEditorFeature(this, {
        kind: 'polygon',
        positions: coords.map(([lng, lat]) => Cesium.Cartesian3.fromDegrees(lng, lat)),
        name: `${city.name} 区域`,
      });
      if (!r.ok) return null;
      notifyEditorDataChange();
      return r.featureId;
    },
    /**
     * 旧 drawTriangle：现在落到编辑器桶
     */
    drawTriangle(city, d = 2) {
      const coords = [
        [city.lon, city.lat + d],
        [city.lon - d, city.lat - d],
        [city.lon + d, city.lat - d],
      ];
      const r = addEditorFeature(this, {
        kind: 'polygon',
        positions: coords.map(([lng, lat]) => Cesium.Cartesian3.fromDegrees(lng, lat)),
        name: `${city.name} 三角形`,
      });
      if (!r.ok) return null;
      notifyEditorDataChange();
      return r.featureId;
    },
    setCamera(preset) {
      const viewer = viewerRef.current;
      if (!viewer) return;
      if (preset === 'topDown') {
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(110, 20, 15_000_000),
          orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
        });
      } else if (preset === 'tilt') {
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(110, 25, 5_000_000),
          orientation: { heading: 0, pitch: -Math.PI / 4, roll: 0 },
        });
      } else if (preset === 'reset') {
        viewer.camera.setView(DEFAULT_CAMERA);
      }
    },
    zoom(direction) {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const range = viewer.camera.positionCartographic.height;
      const factor = direction === 'in' ? 0.5 : 2;
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
          Cesium.Math.toDegrees(viewer.camera.positionCartographic.longitude),
          Cesium.Math.toDegrees(viewer.camera.positionCartographic.latitude),
          Math.max(1000, range * factor)
        ),
        duration: 0.8,
      });
    },
    // 清空用户内容：实体 + 数据源 + 非底图 imagery 图层，保留 base 底图
    clearAll() {
      const viewer = viewerRef.current;
      if (!viewer) return { entities: 0, dataSources: 0, imageryLayers: 0 };
      let counts = { entities: 0, dataSources: 0, imageryLayers: 0 };
      try {
        counts.entities = viewer.entities.values.length;
        viewer.entities.removeAll();
      } catch (_) {}
      try {
        counts.dataSources = viewer.dataSources.length;
        viewer.dataSources.removeAll(true); // destroy=true 释放内存
      } catch (_) {}
      try {
        // 保留 index=0（base 底图），删其它用户添加的图层
        while (viewer.imageryLayers.length > 1) {
          const top = viewer.imageryLayers.get(viewer.imageryLayers.length - 1);
          viewer.imageryLayers.remove(top, true);
          counts.imageryLayers++;
        }
      } catch (_) {}
      try { viewer.scene.requestRender(); } catch (_) {}
      return counts;
    },
    // 重置影像：清掉所有 imageryLayers 并用失败切换逻辑重新加载
    async resetScene() {
      const viewer = viewerRef.current;
      if (!viewer) return;
      try { viewer.imageryLayers.removeAll(false); } catch (_) {}
      const vm = createImageryViewModels();
      setupImageryWithFallback(viewer, vm, (name) => {
        onInfo && onInfo('底图加载：' + name);
      });
      try { viewer.camera.setView(DEFAULT_CAMERA); } catch (_) {}
      try { viewer.scene.requestRender(); } catch (_) {}
    },
    /** 重新加载底图（用于 Token 变更后） */
    reloadImagery() {
      const viewer = viewerRef.current;
      if (!viewer) return;
      try { viewer.imageryLayers.removeAll(false); } catch (_) {}
      // 重建时也带上 override token
      gisApi.tdtToken()
        .then((d) => {
          const finalToken = tdtTokenOverride || d?.token || '';
          const vm = createImageryViewModels(finalToken);
          setupImageryWithFallback(viewer, vm, (name) => {
            onInfo && onInfo('底图加载：' + name);
          });
        })
        .catch(() => {
          const vm = createImageryViewModels(tdtTokenOverride || '');
          setupImageryWithFallback(viewer, vm, (name) => {
            onInfo && onInfo('底图加载：' + name);
          });
        });
    },
    /** 添加自定义底图源（用户通过 URL 模板添加） */
    addCustomImageryProvider(name, urlTemplate, credit = '自定义') {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const vm = createImageryViewModels();
      const make = (n, t, icon, factory) =>
        new Cesium.ProviderViewModel({ name: n, tooltip: t, iconUrl: `data:image/svg+xml;utf8,${encodeURIComponent(icon)}`, creationFunction: factory });
      const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" fill="#8b5cf6" rx="3"/><text x="10" y="14" font-size="8" font-family="sans-serif" fill="white" text-anchor="middle">${name.slice(0,4)}</text></svg>`;
      const customVm = make(
        name,
        `自定义底图：${urlTemplate}`,
        icon,
        () => new Cesium.UrlTemplateImageryProvider({ url: urlTemplate, credit, maximumLevel: 18 })
      );
      // 加到 baseLayerPicker
      viewer.baseLayerPicker.viewModel.imageryProviderViewModels.add(customVm);
      // 保存到 localStorage
      try {
        const stored = JSON.parse(localStorage.getItem('customImageryProviders') || '[]');
        stored.push({ name, urlTemplate, credit });
        localStorage.setItem('customImageryProviders', JSON.stringify(stored));
      } catch (_) {}
    },
    getViewer() { return viewerRef.current; },
    /** 设置当前最上层 imagery 透明度 (0-1)。无 viewer 或无 layer 时静默返回。 */
    setLayerOpacity(alpha) {
      const v = viewerRef.current;
      if (!v) return;
      const layers = v.imageryLayers;
      if (!layers || layers.length === 0) return;
      const top = layers.get(0);
      top.alpha = Math.max(0, Math.min(1, alpha));
    },

    /**
     * 添加数据源。FileLoader 用：
     *   - url 形式：KmlDataSource / CzmlDataSource / GeoJsonDataSource 都可以直接 load(url)
     *   - object 形式（已解析好的 GeoJSON FeatureCollection）：直接喂给 GeoJsonDataSource.load(...)
     * 返回 {id, source} —— id 由我们生成便于后续 remove/toggle/zoom
     */
    addDataSource({ url, geojson, kind = 'datasource', name = 'data' }) {
      const v = viewerRef.current;
      if (!v) return null;
      const id = 'ds_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      let source = null;
      try {
        if (kind === 'geojson') {
          // URL 模式：直接给 Cesium 自己 load
          // 对象模式：序列化成 JSON blob URL（Cesium.GeoJsonDataSource.load 只接受 URL）
          const targetUrl = url
            ? url
            : URL.createObjectURL(new Blob([JSON.stringify(geojson)], { type: 'application/geo+json' }));
          source = v.dataSources.add(
            Cesium.GeoJsonDataSource.load(targetUrl, { clampToGround: true })
          );
        } else if (kind === 'kml') {
          source = v.dataSources.add(
            Cesium.KmlDataSource.load(url, { camera: v.scene.camera, canvas: v.scene.canvas })
          );
        } else if (kind === 'czml') {
          source = v.dataSources.add(Cesium.CzmlDataSource.load(url));
        } else if (kind === 'shp') {
          // shp + dbf 两个 URL
          source = v.dataSources.add(Cesium.ShpDataSource.loadUrls(url));
        } else if (kind === 'gltf') {
          // gltf 作为 primitive 添加，返回 primitive（不是 DataSource）
          const prim = Cesium.Model.fromGltfAsync({ url, scale: 1.0 });
          prim.then((m) => v.scene.primitives.add(m));
          dataSourceRegistry.set(id, { id, name, kind, primitive: prim, visible: true });
          return { id, source: prim, kind: 'primitive' };
        } else {
          throw new Error('unsupported kind: ' + kind);
        }
        if (source && source.then) {
          // 异步加载等它 resolve
          dataSourceRegistry.set(id, { id, name, kind, source: source, visible: true, loading: true });
          source.then((real) => {
            // 异步 resolve 后替换为真正的 source
            dataSourceRegistry.set(id, { id, name, kind, source: real, visible: true, loading: false });
          }).catch((err) => {
            console.error('[CesiumEarth] data source load failed:', err);
            dataSourceRegistry.delete(id);
          });
          return { id, source: source, kind: 'pending', loading: true };
        }
        dataSourceRegistry.set(id, { id, name, kind, source, visible: true });
        return { id, source, kind: 'datasource' };
      } catch (err) {
        console.error('[CesiumEarth] addDataSource error:', err);
        throw err;
      }
    },
    /** 移除数据源（按 id） */
    removeDataSource(id) {
      const v = viewerRef.current;
      if (!v) return;
      const entry = dataSourceRegistry.get(id);
      if (!entry) return;
      try {
        if (entry.kind === 'primitive' && entry.primitive) {
          // Model primitive
          v.scene.primitives.remove(entry.primitive);
        } else if (entry.source) {
          v.dataSources.remove(entry.source, true); // destroy=true 释放内存
        }
      } catch (e) {
        console.warn('[CesiumEarth] remove failed:', e);
      }
      dataSourceRegistry.delete(id);
    },
    /** 切换可见性 */
    toggleDataSource(id, visible) {
      const entry = dataSourceRegistry.get(id);
      if (!entry) return;
      entry.visible = visible;
      try {
        if (entry.kind === 'primitive' && entry.primitive) {
          entry.primitive.show = visible;
        } else if (entry.source && entry.source.show !== undefined) {
          entry.source.show = visible;
        }
      } catch (_) {}
    },
    /** 飞向数据源的 bounding sphere */
    zoomToDataSource(id) {
      const v = viewerRef.current;
      if (!v) return;
      const entry = dataSourceRegistry.get(id);
      if (!entry) return;
      const target = entry.kind === 'primitive' ? entry.primitive : entry.source;
      try { v.flyTo(target, { duration: 1.0 }); } catch (e) {
        console.warn('[CesiumEarth] zoomTo failed:', e);
      }
    },
    /** 获取已加载数据源列表（不含元数据，只 id / name / kind） */
    listDataSources() {
      const out = [];
      dataSourceRegistry.forEach((entry, id) => {
        out.push({ id, name: entry.name, kind: entry.kind, visible: entry.visible, loading: entry.loading });
      });
      return out;
    },
    /**
     * 数据源统计（给 AI 场景摘要用）：每个已加载文件的实体数与 bbox。
     * 尚未 resolve 的异步源只报 loading，不 await —— 这个方法在渲染路径上调用，不能阻塞。
     */
    getDataSourceStats() {
      const out = [];
      dataSourceRegistry.forEach((entry, id) => {
        const base = { id, name: entry.name, format: entry.kind, visible: entry.visible };
        const src = entry.source;
        if (entry.loading || !src || typeof src.then === 'function' || !src.entities) {
          out.push({ ...base, loading: true, entityCount: null, bbox: null });
          return;
        }
        let entityCount = 0;
        let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
        try {
          const vals = src.entities.values || [];
          entityCount = vals.length;
          for (const e of vals) {
            for (const c of entityCartesians(e)) {
              const carto = Cesium.Cartographic.fromCartesian(c);
              if (!carto) continue;
              const lng = Cesium.Math.toDegrees(carto.longitude);
              const lat = Cesium.Math.toDegrees(carto.latitude);
              if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
              if (lng < minLng) minLng = lng;
              if (lat < minLat) minLat = lat;
              if (lng > maxLng) maxLng = lng;
              if (lat > maxLat) maxLat = lat;
            }
          }
        } catch (_) {}
        out.push({
          ...base,
          loading: false,
          entityCount,
          bbox: Number.isFinite(minLng) ? [minLng, minLat, maxLng, maxLat] : null,
        });
      });
      return out;
    },

    // ============================================================
    // 编辑器相关 API（给 <EditorPanel> 用）
    // ============================================================
    /** 返回编辑器专属 CustomDataSource（懒创建） */
    getEditorDataSource() {
      const v = viewerRef.current;
      if (!v) return null;
      if (editorDsRef.current) return editorDsRef.current;
      const ds = new Cesium.CustomDataSource('editor');
      const result = v.dataSources.add(ds);
      // Cesium 某些版本 add() 同步返回 DataSource，某些版本返回 Promise
      if (result && typeof result.then === 'function') {
        result.then((resolved) => { editorDsRef.current = resolved; }).catch(() => {});
        editorDsRef.current = ds;
      } else {
        editorDsRef.current = result;
      }
      return editorDsRef.current;
    },
    /** 编辑器在绘制/编辑模式时设为 true，关闭天气查询的 LEFT_CLICK */
    setInputBlocked(v) {
      try { inputBlockedRef.current = !!v; } catch (_) {}
    },
    /** 调试用：当前 inputBlocked 状态 */
    getInputBlocked() {
      try { return inputBlockedRef.current; } catch (_) { return false; }
    },
    /** 截图（PNG dataURL）。需 viewer 已开 preserveDrawingBuffer */
    async screenshot() {
      const v = viewerRef.current;
      if (!v) return null;
      // 等两帧确保 back buffer 已绘制
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      try { v.scene.render(); } catch (_) {}
      try { return v.scene.canvas.toDataURL('image/png'); } catch (e) {
        console.warn('[CesiumEarth] screenshot failed:', e);
        return null;
      }
    },
    /** 在指定屏幕坐标 pick，返回 {feature, position, cartographic} 或 null */
    pickAt(screenPos) {
      const v = viewerRef.current;
      if (!v) return null;
      const picked = v.scene.pick(screenPos);
      const cartesian = v.camera.pickEllipsoid(screenPos, v.scene.globe.ellipsoid);
      return {
        picked: picked || null,
        cartographic: cartesian
          ? Cesium.Cartographic.fromCartesian(cartesian, v.scene.globe.ellipsoid)
          : null,
      };
    },
    /** 往 editor DataSource 加一个 entity */
    addEditorEntity(opts) {
      const ds = this.getEditorDataSource();
      if (!ds) return null;
      return ds.entities.add(opts);
    },
    /** 按 Cesium entity.id 移除 */
    removeEditorEntity(id) {
      const ds = this.getEditorDataSource();
      if (!ds) return;
      const ent = ds.entities.getById(id);
      if (ent) ds.entities.remove(ent);
    },
    /**
     * 沙箱里 `entities` 的适配器 —— 把 add/remove 等操作路由到编辑器桶
     * 而不是 viewer.entities，使 AI / 用户代码写出来的要素能被 LayersTree 识别
     */
    getEditorEntitiesAdapter() {
      const api = this;
      return {
        add(input) {
          const result = addEditorFeature(api, input);
          if (!result.ok) {
            console.warn('[entitiesAdapter.add]', result.error, input);
            return null;
          }
          // 沙箱代码 viewer.entities.add(...) 也要入撤销栈（AI / 用户写的几何应当可被 undo 撤销）
          // AddCommand.do() 会先判 entity 已存在则跳过；这里 entity 已建好所以 do 是 no-op，
          // 但 undo() 能把它移除 —— 与 UI 点击绘制走同一条路径
          try {
            if (typeof window !== 'undefined' && typeof window.__editorPushCommand === 'function') {
              const snap = {
                featureId: result.featureId,
                kind: result.kind,
                layerId: result.layerId,
                style: result.normalized.style,
                name: result.normalized.name,
                positions: result.normalized.positions,
                attrs: result.normalized.attrs || {},
              };
              window.__editorPushCommand(AddCommand(api, snap, () => {}));
            }
          } catch (_) {}
          notifyEditorDataChange();
          return result.entity;
        },
        remove(entityOrId) {
          const ds = api.getEditorDataSource();
          if (!ds) return false;
          let ent = entityOrId;
          if (typeof entityOrId === 'string') ent = ds.entities.getById(entityOrId);
          if (!ent) return false;
          ds.entities.remove(ent);
          notifyEditorDataChange();
          return true;
        },
        removeAll() {
          const ds = api.getEditorDataSource();
          if (!ds) return;
          ds.entities.removeAll();
          notifyEditorDataChange();
        },
        getById(id) {
          const ds = api.getEditorDataSource();
          return ds ? ds.entities.getById(id) : undefined;
        },
        contains(entity) {
          const ds = api.getEditorDataSource();
          return ds ? ds.entities.contains(entity) : false;
        },
        get values() {
          const ds = api.getEditorDataSource();
          return ds ? ds.entities.values : [];
        },
        get length() {
          const ds = api.getEditorDataSource();
          return ds ? ds.entities.values.length : 0;
        },
      };
    },
    /** 清空 editor DataSource 中所有 entity */
    clearEditor() {
      const ds = this.getEditorDataSource();
      if (!ds) return;
      ds.entities.removeAll();
    },
    /** 测量专用 DataSource（懒创建）；不计入 export，跟 editor DS 隔离 */
    getMeasureDataSource() {
      const v = viewerRef.current;
      if (!v) return null;
      const NAME = 'editor-measure';
      for (let i = 0; i < v.dataSources.length; i++) {
        if (v.dataSources.get(i).name === NAME) return v.dataSources.get(i);
      }
      const ds = new Cesium.CustomDataSource(NAME);
      const result = v.dataSources.add(ds);
      if (result && typeof result.then === 'function') {
        result.then((resolved) => {}).catch(() => {});
        return ds;
      }
      return result;
    },
    /** 给定屏幕坐标 → 经纬度（供 CursorReadout） */
    screenToLngLat(screenPos) {
      const v = viewerRef.current;
      if (!v) return null;
      if (!screenPos || typeof screenPos.x !== 'number' || typeof screenPos.y !== 'number') return null;
      const cartesian = v.camera.pickEllipsoid(screenPos, v.scene.globe.ellipsoid);
      if (!cartesian) return null;
      const carto = Cesium.Cartographic.fromCartesian(cartesian, v.scene.globe.ellipsoid);
      if (!carto) return null;
      if (typeof carto.longitude !== 'number' || typeof carto.latitude !== 'number') return null;
      if (!Number.isFinite(carto.longitude) || !Number.isFinite(carto.latitude)) return null;
      return {
        lng: Cesium.Math.toDegrees(carto.longitude),
        lat: Cesium.Math.toDegrees(carto.latitude),
        height: carto.height,
      };
    },
    /** 当前相机高度（米）—— 供底部状态栏实时显示 */
    getCameraHeight() {
      const v = viewerRef.current;
      if (!v || !v.camera) return null;
      const carto = v.camera.positionCartographic;
      if (!carto) return null;
      return carto.height;
    },
    /** 当前屏幕中心点对应的地面分辨率（米/像素）—— 供底栏"比例尺"显示
     *  Cesium 提供 camera.getPixelSize：返回在给定椭球点上一像素代表的米数。
     *  返回 null 表示 viewer 未就绪或计算失败。 */
    getMetersPerPixel() {
      const v = viewerRef.current;
      if (!v || !v.camera) return null;
      try {
        const windowSize = {
          width: v.canvas && v.canvas.clientWidth ? v.canvas.clientWidth : 1,
          height: v.canvas && v.canvas.clientHeight ? v.canvas.clientHeight : 1,
        };
        // 取屏幕中心点对应的椭球位置
        const center = new Cesium.Cartesian2(
          Math.floor(windowSize.width / 2),
          Math.floor(windowSize.height / 2)
        );
        const ray = v.camera.getPickRay(center);
        if (!ray) return null;
        const carto = Cesium.Cartographic.fromCartesian(
          v.scene.globe.pick(ray, v.scene) || v.camera.pickEllipsoid(center, v.scene.globe.ellipsoid)
        );
        if (!carto || !Number.isFinite(carto.height) || carto.height < 0) return null;
        // Cesium API: pixelSize = 实际尺寸 / 视角分辨率
        const px = Cesium.SceneTransforms.wgs84ToWindowCoordinates
          ? null // 老版本无此 API 跳过
          : null;
        // 直接用 camera API（Cesium 1.105+ 推荐）
        const meters = v.camera.getPixelSize({
          width: windowSize.width,
          height: windowSize.height,
          cartographic: carto,
        });
        if (!meters || !Number.isFinite(meters)) return null;
        return meters;
      } catch (_) {
        return null;
      }
    },
    /** 进入/退出浏览器原生全屏（HTML5 Fullscreen API）—— 给 Toolbar 调用
     *  返回 { entered: boolean } 表示当前是否处于全屏。 */
    toggleFullscreen(targetEl) {
      const v = viewerRef.current;
      const el = targetEl || (v && v.container) || null;
      if (!el || typeof document === 'undefined') return { entered: false };
      try {
        const isFs = document.fullscreenElement === el;
        if (isFs) {
          if (document.exitFullscreen) document.exitFullscreen();
          return { entered: false };
        }
        if (el.requestFullscreen) {
          el.requestFullscreen();
          return { entered: true };
        }
        // 老浏览器回退（webkit/moz）
        const fn = el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
        if (fn) {
          fn.call(el);
          return { entered: true };
        }
        return { entered: false };
      } catch (_) {
        return { entered: false };
      }
    },

    // ============ 图层抽象层（统一 datasource / editor / sandbox 三桶）============
    // 借鉴 kepler.gl LayerManager + maplibre 图层规约：
    //   - layers()                列出全部图层（datasource + viewer.entities 沙箱 + editor 桶）
    //   - setLayerVisible(id)     跨桶切换可见性
    //   - flyToLayer(id)          跨桶飞行
    //   - removeLayer(id)         跨桶删除
    //   - getLayerStats(id)       单一图层的实体数 + bbox
    // 让 AI 工具描述、LayersTree、FileLoader 都能用同一组名词，不再纠结"图层 vs 数据源 vs entity"。
    layers() {
      const v = viewerRef.current;
      const out = [];
      // 1) FileLoader 数据源（datasource / primitive）
      dataSourceRegistry.forEach((entry, id) => {
        let count = null;
        let bbox = null;
        if (entry.source && entry.source.entities && typeof entry.source.entities.values?.length === 'number') {
          count = entry.source.entities.values.length;
        }
        out.push({
          id, name: entry.name || id, source: 'datasource', kind: entry.kind,
          visible: entry.visible !== false, loading: !!entry.loading, count, bbox,
        });
      });
      // 2) Viewer entities（沙箱里的 viewer.entities.add 直接走 viewer.dataSource(0)）
      if (v && v.entities && v.entities.values) {
        const vals = v.entities.values;
        // 按 name 前缀聚合
        const byName = new Map();
        for (const e of vals) {
          const n = e.name || '未命名';
          if (!byName.has(n)) byName.set(n, { ids: [], count: 0 });
          byName.get(n).ids.push(e.id);
          byName.get(n).count++;
        }
        for (const [name, info] of byName) {
          out.push({
            id: 'sandbox:' + name,
            name: '[沙箱] ' + name,
            source: 'sandbox',
            kind: 'entities',
            visible: true,
            loading: false,
            count: info.count,
            bbox: null,
          });
        }
      }
      return out;
    },

    setLayerVisible(id, visible) {
      // datasource 桶
      const ds = dataSourceRegistry.get(id);
      if (ds) {
        ds.visible = visible;
        try {
          if (ds.kind === 'primitive' && ds.primitive) ds.primitive.show = visible;
          else if (ds.source && ds.source.show !== undefined) ds.source.show = visible;
        } catch (_) {}
        return true;
      }
      // sandbox 桶（按 name 前缀）
      if (typeof id === 'string' && id.startsWith('sandbox:')) {
        const name = id.slice('sandbox:'.length);
        const v = viewerRef.current;
        if (v && v.entities) {
          for (const e of v.entities.values) {
            if (e.name === name && e.show !== undefined) e.show = visible;
          }
          return true;
        }
      }
      return false;
    },

    flyToLayer(id) {
      const ds = dataSourceRegistry.get(id);
      if (ds) {
        const v = viewerRef.current;
        if (!v) return false;
        const target = ds.kind === 'primitive' ? ds.primitive : ds.source;
        try { v.flyTo(target, { duration: 1.0 }); return true; } catch (_) {}
      }
      if (typeof id === 'string' && id.startsWith('sandbox:')) {
        const name = id.slice('sandbox:'.length);
        const v = viewerRef.current;
        if (v && v.entities) {
          const ents = v.entities.values.filter((e) => e.name === name);
          if (ents.length) {
            try { v.flyTo(ents, { duration: 1.0 }); return true; } catch (_) {}
          }
        }
      }
      return false;
    },

    removeLayer(id) {
      // datasource 桶：复用既有 removeDataSource
      const ds = dataSourceRegistry.get(id);
      if (ds) {
        const v = viewerRef.current;
        if (v) {
          try {
            if (ds.kind === 'primitive' && ds.primitive) {
              v.scene.primitives.remove(ds.primitive);
            } else if (ds.source) {
              v.dataSources.remove(ds.source, true);
            }
          } catch (_) {}
        }
        dataSourceRegistry.delete(id);
        return true;
      }
      if (typeof id === 'string' && id.startsWith('sandbox:')) {
        const name = id.slice('sandbox:'.length);
        const v = viewerRef.current;
        if (v && v.entities) {
          const ids = v.entities.values.filter((e) => e.name === name).map((e) => e.id);
          for (const eid of ids) {
            try { v.entities.removeById(eid); } catch (_) {}
          }
          return ids.length > 0;
        }
      }
      return false;
    },
  }), [onPointClick, onInfo]);

  // 把生成的 API 对象暴露给 CursorReadout 等内部子组件
  // 通过 effect 在每次重渲染后同步最新方法
  // （useImperativeHandle 已经返回了最终对象，外部 ref 拿到的是它）
  // CursorReadout 走 ref 回调：传一个函数取最新 API
  const getApi = () => {
    if (!apiRef.current) {
      // 构造一个轻量代理，按需从外部 ref 取最新方法
      apiRef.current = {
        getViewer: () => viewerRef.current,
        screenToLngLat: (screenPos) => {
          const v = viewerRef.current;
          if (!v) return null;
          const cartesian = v.camera.pickEllipsoid(screenPos, v.scene.globe.ellipsoid);
          if (!cartesian) return null;
          const c = v.scene.globe.ellipsoid.cartesianToCartographic(cartesian);
          return {
            lng: Cesium.Math.toDegrees(c.longitude),
            lat: Cesium.Math.toDegrees(c.latitude),
            height: c.height,
          };
        },
      };
    }
    return apiRef.current;
  };

  return (
    <>
      <div className="cesium-host" ref={containerRef} />

      {/* 左上角工具栏：底图透明度 + 文件加载，垂直堆叠避免挤在一起 */}
      <div className="cesium-topbar-left">
        <div className="imagery-opacity-control">
          <label className="opacity-label" htmlFor="imagery-opacity-slider">底图透明度</label>
          <input
            id="imagery-opacity-slider"
            className="opacity-slider"
            type="range"
            aria-label="底图透明度（0~100）"
            min="0"
            max="100"
            defaultValue="100"
            onInput={(e) => {
              const v = parseFloat(e.target.value) / 100;
              const viewer = viewerRef.current;
              if (viewer && viewer.imageryLayers.length > 0) {
                viewer.imageryLayers.get(0).alpha = v;
              }
              e.target.nextElementSibling.textContent = Math.round(v * 100) + '%';
            }}
          />
          <span className="opacity-value">100%</span>
        </div>
      </div>

      {/* 底栏：鼠标光标经纬度读数 */}
      <CursorReadout
        api={getApi()}
        format={coordFormat}
        onFormatChange={onCoordFormatChange}
        dock="bottom"
        editorApiRef={editorApiRef}
      />
    </>
  );
});

export default CesiumEarth;
