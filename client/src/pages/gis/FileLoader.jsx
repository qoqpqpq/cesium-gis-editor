// 文件上传组件（图标按钮 + 弹窗）
// 支持格式：GeoJSON / JSON / KML / CZML / glTF / GLB /
//          Shapefile (单独 .shp + .dbf 或 .zip 包) /
//          XLSX / XLS / TXT / CSV
// 表格文件自动识别 lat/lng 列（多种别名 + 中英文 + 后缀变体），
// 也识别 WKT 几何列（wkt/geometry/the_geom…）。识别失败时让用户手动指定

import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import {
  detectCoordCols, parseDelimited, rowsToGeoJson, rowsToGeoJsonFromWkt,
} from './editor/utils/tabular.js';

// 工具函数：把 File 转 blob URL
const blobUrl = (file) => URL.createObjectURL(file);

const FORMAT_LABEL = {
  geojson: "GeoJSON", kml: "KML", czml: "CZML", gltf: "glTF",
  shp: "Shapefile", xlsx: "XLSX", txt: "CSV/TXT",
};

export default function FileLoader({
  api, loadedFiles, onAdd, onRemove, onToggle, onZoom, onError,
}) {
  const [popupOpen, setPopupOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);
  const dragCounter = useRef(0);
  const popupRef = useRef(null);

  // 手动列选择器（CSV/XLSX 没能自动识别 lat/lng/WKT 时弹出）
  // 借鉴 geojson.io：用户从表头下拉里挑哪两列是 lat / lng（或单列 WKT）
  const [colPicker, setColPicker] = useState(null); // { file, parsed, headers }
  const [pickerMode, setPickerMode] = useState('xy'); // 'xy' | 'wkt'
  const [pickerLat, setPickerLat] = useState('');
  const [pickerLng, setPickerLng] = useState('');
  const [pickerAlt, setPickerAlt] = useState('');
  const [pickerWkt, setPickerWkt] = useState('');

  function resetPicker() {
    setColPicker(null);
    setPickerMode('xy');
    setPickerLat('');
    setPickerLng('');
    setPickerAlt('');
    setPickerWkt('');
  }

  // ===== 全场景图层（统一抽象层：datasource + editor + sandbox）=====
  // 每 1.5s 拉一次 __layers() 让 FileLoader 也看得见 editor 桶 + 沙箱桶
  // 不直接调 cesiumRef —— FileLoader 通过 window.__layers 测试钩子拿
  const [allLayers, setAllLayers] = useState([]);
  useEffect(() => {
    if (!popupOpen) {
      setAllLayers([]);
      return;
    }
    const refresh = () => {
      try {
        const layers = window.__layers ? window.__layers() : [];
        setAllLayers(layers);
      } catch (_) {}
    };
    refresh();
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, [popupOpen]);

  function handleLayerToggle(layer) {
    if (typeof window.__layerVisible === 'function') {
      window.__layerVisible(layer.id, !layer.visible);
      // 立即刷新一下
      try { setAllLayers(window.__layers()); } catch (_) {}
    }
  }
  function handleLayerFly(layer) {
    if (typeof window.__flyToLayer === 'function') window.__flyToLayer(layer.id);
  }

  // 用 picker 解析并 addDataSource
  function applyPicker() {
    if (!colPicker) return;
    const { file, parsed } = colPicker;
    let geojson;
    let skipped = 0;
    if (pickerMode === 'wkt') {
      const idx = parsed.headers.indexOf(pickerWkt);
      if (idx < 0) {
        onError && onError(`${file.name}：请选择一个 WKT 列`);
        return;
      }
      geojson = rowsToGeoJsonFromWkt(parsed, idx, file.name);
      skipped = geojson.skipped || 0;
    } else {
      const latIdx = parsed.headers.indexOf(pickerLat);
      const lngIdx = parsed.headers.indexOf(pickerLng);
      const altIdx = pickerAlt ? parsed.headers.indexOf(pickerAlt) : -1;
      if (latIdx < 0 || lngIdx < 0) {
        onError && onError(`${file.name}：请同时选择 lat 与 lng 列`);
        return;
      }
      geojson = rowsToGeoJson(parsed, latIdx, lngIdx, altIdx, file.name);
    }
    if (!geojson.features.length) {
      onError && onError(`${file.name}：选了列之后没有解析出有效坐标（跳过 ${skipped} 行）`);
      resetPicker();
      return;
    }
    const result = api.addDataSource({ geojson, name: file.name, kind: 'geojson' });
    onAdd && onAdd({ id: result.id, name: file.name, format: file.ext, count: geojson.features.length, loading: result.loading });
    resetPicker();
  }

  // 阻止默认拖拽行为
  useEffect(() => {
    const stop = (e) => e.preventDefault();
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => { window.removeEventListener("dragover", stop); window.removeEventListener("drop", stop); };
  }, []);

  // 点击外部关闭弹窗
  useEffect(() => {
    if (!popupOpen) return;
    const handleClick = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setPopupOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [popupOpen]);

  function onDragEnter(e) { e.preventDefault(); dragCounter.current++; setDragging(true); }
  function onDragLeave(e) {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setDragging(false); }
  }
  function onDrop(e) {
    e.preventDefault();
    dragCounter.current = 0;
    setDragging(false);
    Array.from(e.dataTransfer.files || []).forEach(processFile);
  }
  function onPick(e) {
    Array.from(e.target.files || []).forEach(processFile);
    e.target.value = "";
  }

  async function processFile(file) {
    const ext = (file.name.match(/\.(\w+)$/)?.[1] || "").toLowerCase();
    try {
      let result;
      switch (ext) {
        case "geojson":
        case "json": {
          const text = await file.text();
          let geojson;
          try { geojson = JSON.parse(text); if (geojson.type !== "FeatureCollection" && geojson.type !== "Feature") geojson = null; } catch (_) { geojson = null; }
          result = geojson
            ? api.addDataSource({ geojson, name: file.name, kind: "geojson" })
            : api.addDataSource({ url: blobUrl(file), name: file.name, kind: "geojson" });
          break;
        }
        case "kml": result = api.addDataSource({ url: blobUrl(file), name: file.name, kind: "kml" }); break;
        case "czml": result = api.addDataSource({ url: blobUrl(file), name: file.name, kind: "czml" }); break;
        case "glb": case "gltf": result = api.addDataSource({ url: blobUrl(file), name: file.name, kind: "gltf" }); break;
        case "shp": case "dbf": {
          onError && onError(`${file.name}：Shapefile 需要 .shp + .dbf 同时上传，或打包成 .zip 再拖入`);
          return;
        }
        case "zip": {
          const zip = await JSZip.loadAsync(file);
          const shpFile = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith(".shp"));
          const dbfFile = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith(".dbf"));
          if (!shpFile || !dbfFile) { onError && onError(`${file.name}：zip 里没找到 .shp + .dbf`); return; }
          const shpBlob = await shpFile.async("blob");
          const dbfBlob = await dbfFile.async("blob");
          result = api.addDataSource({ url: [blobUrl(shpBlob), blobUrl(dbfBlob)], name: file.name, kind: "shp" });
          break;
        }
        case "xlsx": case "xls": {
          const buf = await file.arrayBuffer();
          const wb = XLSX.read(buf, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          // header: 1 表示第一行作为表头（而不是默认的行为）
          const rowsObj = XLSX.utils.sheet_to_json(ws, { defval: "", header: 1 });
          if (!rowsObj.length) throw new Error("空表格");
          // 第一行是表头
          const headers = rowsObj[0].map((h) => String(h).trim());
          // 剩余是数据行
          const dataRows = rowsObj.slice(1);
          // 把每行转成按表头索引映射的对象
          const rows = dataRows.map((cells) => {
            const row = {};
            headers.forEach((h, i) => { row[h] = (cells[i] ?? "").toString().trim(); });
            return row;
          });
          const cols = detectCoordCols(headers);
          // 优先级：WKT > lat/lng > 手动选择
          if (cols.wkt >= 0) {
            const geojson = rowsToGeoJsonFromWkt({ headers, rows }, cols.wkt, file.name);
            result = api.addDataSource({ geojson, name: file.name, kind: "geojson" });
            result = { ...result, count: geojson.features.length };
          } else if (cols.lat >= 0 && cols.lng >= 0) {
            const geojson = rowsToGeoJson({ headers, rows }, cols.lat, cols.lng, cols.alt, file.name);
            result = api.addDataSource({ geojson, name: file.name, kind: "geojson" });
            result = { ...result, count: geojson.features.length };
          } else {
            // 自动识别失败 → 弹手动列选择器（借鉴 geojson.io）
            setColPicker({ file: { name: file.name, ext }, parsed: { headers, rows } });
            setPickerMode(cols.wkt >= 0 ? 'wkt' : 'xy');
            // 预填自动识别里最像的（找不到就空）
            setPickerLat(headers[cols.lat >= 0 ? cols.lat : 0] || '');
            setPickerLng(headers[cols.lng >= 0 ? cols.lng : 0] || '');
            setPickerAlt(cols.alt >= 0 ? headers[cols.alt] : '');
            setPopupOpen(false); // 关闭主弹窗，专注于选列弹窗
            return;
          }
          break;
        }
        case "txt": case "csv": {
          const text = await file.text();
          const parsed = parseDelimited(text);
          if (!parsed.headers.length) throw new Error("空文件");
          const cols = detectCoordCols(parsed.headers);
          if (cols.wkt >= 0) {
            const geojson = rowsToGeoJsonFromWkt(parsed, cols.wkt, file.name);
            result = api.addDataSource({ geojson, name: file.name, kind: "geojson" });
            result = { ...result, count: geojson.features.length };
          } else if (cols.lat >= 0 && cols.lng >= 0) {
            const geojson = rowsToGeoJson(parsed, cols.lat, cols.lng, cols.alt, file.name);
            result = api.addDataSource({ geojson, name: file.name, kind: "geojson" });
            result = { ...result, count: geojson.features.length };
          } else {
            // 自动识别失败 → 弹手动列选择器
            setColPicker({ file: { name: file.name, ext }, parsed });
            setPickerMode('xy');
            setPickerLat(parsed.headers[0] || '');
            setPickerLng(parsed.headers[1] || '');
            setPickerAlt('');
            setPopupOpen(false);
            return;
          }
          break;
        }
        default:
          onError && onError(`不支持 .${ext}（仅支持 .geojson/.json/.kml/.czml/.glb/.gltf/.shp/.zip/.xlsx/.txt/.csv）`);
          return;
      }
      onAdd && onAdd({ id: result.id, name: file.name, format: ext, count: result.count, loading: result.loading });
    } catch (e) {
      console.error("[FileLoader]", e);
      onError && onError(`${file.name}：${e.message || "加载失败"}`);
    }
  }

  return (
    <>
      {/* 左上角图标按钮 */}
      <button
        className="file-loader-btn"
        onClick={() => setPopupOpen((v) => !v)}
        title="文件上传"
      >
        📂
        {loadedFiles.length > 0 && (
          <span className="file-loader-badge">{loadedFiles.length}</span>
        )}
      </button>

      {/* 弹窗 */}
      {popupOpen && (
        <div className="file-loader-popup" ref={popupRef}>
          <div className="file-loader-popup-header">
            <span>📂 文件上传</span>
            <button className="icon-btn" onClick={() => setPopupOpen(false)}>✕</button>
          </div>

          <div
            className={"file-drop-zone" + (dragging ? " active" : "")}
            onDragEnter={onDragEnter}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <div className="drop-zone-hint">
              拖文件到此处 · 或
              <button className="btn-link" onClick={() => fileInputRef.current?.click()}>浏览文件</button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".geojson,.json,.kml,.czml,.glb,.gltf,.shp,.dbf,.zip,.xlsx,.xls,.txt,.csv"
              aria-label="选择要导入的地理文件"
              style={{ display: "none" }}
              onChange={onPick}
            />
            <div className="drop-zone-formats">
              .geojson .json .kml .czml .glb .gltf .shp .zip .xlsx .csv
            </div>
          </div>

          {loadedFiles.length > 0 && (
            <div className="loaded-files">
              <div className="loaded-files-title">已加载文件 ({loadedFiles.length})</div>
              <ul>
                {loadedFiles.map((f) => (
                  <li key={f.id} className={f.visible === false ? "hidden" : ""}>
                    <span className="file-name" title={f.name}>{f.name}</span>
                    <span className="file-fmt">{FORMAT_LABEL[f.format] || f.format}</span>
                    <span className="file-count">{f.loading ? "…" : f.count ?? ""}</span>
                    <button className="icon-btn" onClick={() => onToggle && onToggle(f.id, f.visible === false)} title={f.visible === false ? "显示" : "隐藏"}>
                      {f.visible === false ? "👁‍🗨" : "👁"}
                    </button>
                    <button className="icon-btn" onClick={() => onZoom && onZoom(f.id)} aria-label={`飞到文件 ${f.name}`} title="飞向">🎯</button>
                    <button className="icon-btn danger" onClick={() => onRemove && onRemove(f.id)} aria-label={`移除文件 ${f.name}`} title="移除">✕</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 全场景图层（合并 editor + sandbox + datasource，借鉴 kepler.gl LayerManager）*/}
          {allLayers.length > 0 && (
            <div className="loaded-files all-layers">
              <div className="loaded-files-title">
                全场景图层 ({allLayers.length})
                <span className="all-layers-hint" title="合并 viewer.entities + editor 图层 + 文件数据源">
                  {' '}· <code>layers()</code>
                </span>
              </div>
              <ul>
                {allLayers.map((l) => (
                  <li key={l.id} className={l.visible === false ? 'hidden' : ''}>
                    <span className="file-name" title={l.id}>{l.name}</span>
                    <span className={'file-fmt source-' + l.source}>
                      {l.source === 'editor' ? '📐 editor' :
                       l.source === 'sandbox' ? '🧪 sandbox' :
                       '📂 data'}
                    </span>
                    <span className="file-count">{l.count != null ? l.count : ''}</span>
                    <button
                      className="icon-btn"
                      onClick={() => handleLayerToggle(l)}
                      title={l.visible === false ? '显示' : '隐藏'}
                    >
                      {l.visible === false ? '👁‍🗨' : '👁'}
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => handleLayerFly(l)}
                      title="飞向"
                    >
                      🎯
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ===== 手动列选择弹窗（CSV/XLSX 自动识别失败时） ===== */}
      {colPicker && (
        <div className="file-loader-popup col-picker-popup" ref={popupRef}>
          <div className="file-loader-popup-header">
            <span>🧩 选择列 - {colPicker.file.name}</span>
            <button className="icon-btn" onClick={resetPicker} aria-label="重置文件选择">✕</button>
          </div>
          <div className="col-picker-body">
            <div className="col-picker-mode">
              <label>
                <input
                  type="radio"
                  name="picker-mode"
                  checked={pickerMode === 'xy'}
                  onChange={() => setPickerMode('xy')}
                />
                <span>📍 经度 / 纬度（lat+lng）</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="picker-mode"
                  checked={pickerMode === 'wkt'}
                  onChange={() => setPickerMode('wkt')}
                />
                <span>🔷 WKT 几何（单列含 POINT/LINESTRING/POLYGON）</span>
              </label>
            </div>

            {pickerMode === 'xy' && (
              <div className="col-picker-fields">
                <label>
                  <span className="lbl">纬度 lat</span>
                  <select value={pickerLat} onChange={(e) => setPickerLat(e.target.value)}>
                    <option value="">-- 选列 --</option>
                    {colPicker.parsed.headers.map((h, i) => (
                      <option key={i} value={h}>{h}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="lbl">经度 lng</span>
                  <select value={pickerLng} onChange={(e) => setPickerLng(e.target.value)}>
                    <option value="">-- 选列 --</option>
                    {colPicker.parsed.headers.map((h, i) => (
                      <option key={i} value={h}>{h}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="lbl">高度 alt（可选）</span>
                  <select value={pickerAlt} onChange={(e) => setPickerAlt(e.target.value)}>
                    <option value="">-- 无 --</option>
                    {colPicker.parsed.headers.map((h, i) => (
                      <option key={i} value={h}>{h}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {pickerMode === 'wkt' && (
              <div className="col-picker-fields">
                <label>
                  <span className="lbl">WKT 几何列</span>
                  <select value={pickerWkt} onChange={(e) => setPickerWkt(e.target.value)}>
                    <option value="">-- 选列 --</option>
                    {colPicker.parsed.headers.map((h, i) => (
                      <option key={i} value={h}>{h}</option>
                    ))}
                  </select>
                </label>
                <div className="col-picker-hint muted small">
                  支持 POINT / LINESTRING / POLYGON。例如：
                  <code>POINT(116.40 39.90)</code>、<code>POLYGON((0 0,1 0,1 1,0 1,0 0))</code>
                </div>
              </div>
            )}

            <div className="col-picker-preview muted small">
              📋 检测到 {colPicker.parsed.headers.length} 列 / {colPicker.parsed.rows.length} 行
            </div>

            <div className="col-picker-actions">
              <button className="btn-link" onClick={resetPicker}>取消</button>
              <button
                className="btn-primary"
                disabled={
                  pickerMode === 'wkt'
                    ? !pickerWkt
                    : (!pickerLat || !pickerLng)
                }
                onClick={applyPicker}
              >
                解析并加载
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
