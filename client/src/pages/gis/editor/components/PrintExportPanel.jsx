// PrintExportPanel — 阶段 2B · 打印 / 导出 面板
//
// 6 种格式：
//   - PNG  (Cesium scene.canvas → toDataURL)
//   - PDF  (弹窗 + window.print()，避免引 jsPDF)
//   - GeoJSON (已有 toGeoJSON)
//   - KML   (已有 toKML)
//   - CSV   (属性表 featuresToCsv)
//   - Shapefile (.shp/.shx/.dbf/.prj zip，自实现)
//
// 数据源选择：当前 DataSource 全部要素
// 选项：
//   - 仅选中（如果有 selectedIds）
//   - 文件名
//   - PNG 分辨率（默认原画布尺寸）

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  snapshotPng, exportPdf, downloadGeoJSON, downloadKML,
} from '../utils/exporter.js';
import { downloadShapefile } from '../utils/shapefileExporter.js';
import { featuresToCsv, downloadCsv } from '../utils/attrTableUtils.js';
import { useDraggableResizable } from '../hooks/useDraggableResizable.js';

export default function PrintExportPanel({
  api,
  open,
  onClose,
  dataSource,
  selectedIds,         // Set<featureId>
  features,            // 当前全部 feature（CSV 用）
  onInfo,
}) {
  const panelRef = useRef(null);
  useDraggableResizable({
    ref: panelRef,
    storageKey: 'editor-print-export-panel',
    defaultSize: { w: 320, h: 280 },
    defaultPosition: { x: 140, y: 160 },
    dragHandleSelector: '.print-export-header',
  });

  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [exportScope, setExportScope] = useState('all'); // all | selected
  const [pngWidth, setPngWidth] = useState(0); // 0 = 原画布尺寸
  const [pngHeight, setPngHeight] = useState(0);
  const [filename, setFilename] = useState(() => defaultFilename());

  useEffect(() => {
    if (!open) { setLastResult(null); setBusy(false); }
  }, [open]);

  useEffect(() => {
    setFilename(defaultFilename());
  }, [open]);

  const selectedCount = selectedIds ? selectedIds.size : 0;
  const effectiveScope = exportScope === 'selected' && selectedCount > 0 ? 'selected' : 'all';
  const totalCount = features ? features.length : 0;
  const exportCount = effectiveScope === 'selected' ? selectedCount : totalCount;

  // 用于覆盖 dataSource 的"仅选中"过滤
  const scopedDataSource = useMemo(() => {
    if (effectiveScope !== 'selected' || !dataSource || !selectedIds || selectedIds.size === 0) {
      return dataSource;
    }
    // 临时 new 一个 CustomDataSource（Cesium）会过重 —— 直接复用 dataSource 但导出时按 ids 过滤
    return dataSource;
  }, [dataSource, effectiveScope, selectedIds]);

  const handlePng = async () => {
    setBusy(true); setLastResult(null);
    try {
      const viewer = api && api.viewer;
      const dataUrl = snapshotPng(viewer, {
        width: pngWidth > 0 ? pngWidth : undefined,
        height: pngHeight > 0 ? pngHeight : undefined,
      });
      if (!dataUrl) {
        setLastResult({ kind: 'error', text: '截图失败（Cesium canvas 不可用）' });
        return;
      }
      const a = document.createElement('a');
      a.href = dataUrl; a.download = filename + '.png';
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setLastResult({ kind: 'ok', text: `PNG 已导出（${Math.round(dataUrl.length / 1024)} KB）` });
      onInfo && onInfo('PNG 已导出');
    } catch (e) {
      setLastResult({ kind: 'error', text: String(e.message || e) });
    } finally { setBusy(false);
    }
  };

  const handlePdf = async () => {
    setBusy(true); setLastResult(null);
    try {
      const viewer = api && api.viewer;
      const png = snapshotPng(viewer, {
        width: pngWidth > 0 ? pngWidth : undefined,
        height: pngHeight > 0 ? pngHeight : undefined,
      });
      if (!png) {
        setLastResult({ kind: 'error', text: '截图失败（Cesium canvas 不可用）' });
        return;
      }
      const filteredDs = filterDataSourceBySelection(scopedDataSource, selectedIds, effectiveScope);
      const result = exportPdf(viewer, filteredDs, {
        title: filename,
        width: pngWidth > 0 ? pngWidth : undefined,
        height: pngHeight > 0 ? pngHeight : undefined,
      });
      if (!result.ok) {
        setLastResult({ kind: 'error', text: result.error || 'PDF 导出失败' });
        return;
      }
      setLastResult({ kind: 'ok', text: `PDF 打印对话框已打开（${result.count} 个要素）` });
      onInfo && onInfo('PDF 打印对话框已打开');
    } catch (e) {
      setLastResult({ kind: 'error', text: String(e.message || e) });
    } finally { setBusy(false);
    }
  };

  const handleGeoJSON = () => {
    setBusy(true); setLastResult(null);
    try {
      const filteredDs = filterDataSourceBySelection(scopedDataSource, selectedIds, effectiveScope);
      downloadGeoJSON(filteredDs, filename + '.geojson');
      setLastResult({ kind: 'ok', text: 'GeoJSON 已下载' });
      onInfo && onInfo('GeoJSON 已下载');
    } catch (e) {
      setLastResult({ kind: 'error', text: String(e.message || e) });
    } finally { setBusy(false);
    }
  };

  const handleKml = () => {
    setBusy(true); setLastResult(null);
    try {
      const filteredDs = filterDataSourceBySelection(scopedDataSource, selectedIds, effectiveScope);
      downloadKML(filteredDs, filename + '.kml');
      setLastResult({ kind: 'ok', text: 'KML 已下载' });
      onInfo && onInfo('KML 已下载');
    } catch (e) {
      setLastResult({ kind: 'error', text: String(e.message || e) });
    } finally { setBusy(false);
    }
  };

  const handleCsv = () => {
    setBusy(true); setLastResult(null);
    try {
      const subset = effectiveScope === 'selected' && selectedIds && features
          ? features.filter((f) => selectedIds.has(f.featureId))
          : features || [];
      const csv = featuresToCsv(subset, /* visibleCols */ null);
      downloadCsv(csv, filename + '.csv');
      setLastResult({ kind: 'ok', text: `CSV 已下载（${subset.length} 行）` });
      onInfo && onInfo('CSV 已下载');
    } catch (e) {
      setLastResult({ kind: 'error', text: String(e.message || e) });
    } finally { setBusy(false);
    }
  };

  const handleShapefile = async () => {
    setBusy(true); setLastResult(null);
    try {
      const filteredDs = filterDataSourceBySelection(scopedDataSource, selectedIds, effectiveScope);
      const res = await downloadShapefile(filteredDs, filename);
      if (!res.ok) {
        setLastResult({ kind: 'error', text: res.error || 'Shapefile 导出失败' });
        return;
      }
      setLastResult({ kind: 'ok', text: `Shapefile zip 已下载（${Math.round((res.size || 0) / 1024)} KB）` });
      onInfo && onInfo('Shapefile 已下载');
    } catch (e) {
      setLastResult({ kind: 'error', text: String(e.message || e) });
    } finally { setBusy(false);
    }
  };

  if (!open) return null;

  const disabled = busy || exportCount === 0;

  return (
    <div className="print-export-panel" ref={panelRef}>
      <div className="print-export-header">
        <span>🖨 打印 / 导出</span>
        <button className="attr-table-btn close" onClick={onClose} aria-label="关闭打印导出面板">✕</button>
      </div>
      <div className="print-export-body">
        <div className="print-export-row">
          <label>文件名</label>
          <input
            type="text"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="export"
          />
        </div>

        <div className="print-export-row">
          <label>范围</label>
          <select value={exportScope} onChange={(e) => setExportScope(e.target.value)}>
            <option value="all">全部要素（{totalCount}）</option>
            <option value="selected" disabled={selectedCount === 0}>
              仅选中（{selectedCount}）{selectedCount === 0 ? '（无选中）' : ''}
            </option>
          </select>
        </div>

        <div className="print-export-row">
          <label>PNG 尺寸</label>
          <div className="print-export-size">
            <input
              type="number"
              min={0}
              placeholder="宽 (px, 0=原)"
              value={pngWidth}
              onChange={(e) => setPngWidth(Math.max(0, Number(e.target.value) || 0))}
            />
            <span>×</span>
            <input
              type="number"
              min={0}
              placeholder="高 (px, 0=原)"
              value={pngHeight}
              onChange={(e) => setPngHeight(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </div>

        <div className="print-export-grid">
          <button className="attr-table-btn" onClick={handlePng} disabled={busy}>🖼 PNG</button>
          <button className="attr-table-btn" onClick={handlePdf} disabled={busy}>📄 PDF / 打印</button>
          <button className="attr-table-btn" onClick={handleGeoJSON} disabled={busy}>🌐 GeoJSON</button>
          <button className="attr-table-btn" onClick={handleKml} disabled={busy}>🗺 KML</button>
          <button className="attr-table-btn" onClick={handleCsv} disabled={disabled || !features || !features.length}>📊 CSV</button>
          <button className="attr-table-btn" onClick={handleShapefile} disabled={disabled}>📦 Shapefile</button>
        </div>

        {disabled && exportCount === 0 && (
          <div className="print-export-hint">
            当前作用域无要素。请先绘制要素，或切换"全部要素"。
          </div>
        )}

        {lastResult && (
          <div className={'print-export-result' + (lastResult.kind === 'error' ? ' error' : '')}>
            {lastResult.kind === 'error' ? '⚠ ' : '✓ '}{lastResult.text}
          </div>
        )}

        <div className="print-export-hint" style={{ marginTop: 8 }}>
          📌 PDF 走浏览器打印对话框（Ctrl+P → 另存为 PDF），不引入新依赖。
          <br />📌 Shapefile 自实现 ESRI 规范（.shp/.shx/.dbf/.prj 打包为 zip），WGS84。
        </div>
      </div>
    </div>
  );
}

function defaultFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `gis-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// 通过 entity.properties.featureId 过滤 entities
function filterDataSourceBySelection(dataSource, selectedIds, effectiveScope) {
  if (!dataSource) return null;
  if (effectiveScope !== 'selected' || !selectedIds || selectedIds.size === 0) return dataSource;
  // 返回一个浅包装对象（含 entities 数组），所有用到 dataSource.entities.values 的 exporter 都能跑
  const all = dataSource.entities ? dataSource.entities.values : [];
  const filtered = all.filter((e) => {
    const p = e.properties;
    if (!p) return false;
    const fid = (p.featureId && p.featureId.getValue) ? p.featureId.getValue() : p.featureId;
    return selectedIds.has(fid);
  });
  // 提供兼容的 .entities.values 接口
  return {
    entities: { values: filtered },
    __filtered: true,
    __original: dataSource,
  };
}