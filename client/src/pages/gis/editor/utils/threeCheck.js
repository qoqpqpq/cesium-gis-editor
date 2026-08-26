// threeCheck.js — GIS 预处理三项检查（位置 / 几何 / 属性）
// 来源：GeoLibre 文章的"分析前先做三项检查"框架
// 返回 { position, geometry, attributes, summary }，每条 issue 含 severity + field

import * as turf from '@turf/turf';
import { entityToTurfFeature } from './analysis.js';

const MAX_BBOX_DEG = 360; // 简单合理性阈值（地球周长约 360°）

// 把 entity 列表拍平为 turf features（保留 properties 以便做属性检查）
function collectFeatures(entities) {
  const out = [];
  for (const e of entities) {
    const f = entityToTurfFeature(e);
    if (f) out.push(f);
  }
  return out;
}

// ---------- 位置检查 ----------
function checkPosition(features) {
  const issues = [];
  if (!features.length) {
    return { ok: false, issues: [{ severity: 'error', field: '_global', message: '没有可检查的要素' }] };
  }
  const bboxes = [];
  let outOfRange = 0;
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    let bbox;
    try {
      bbox = turf.bbox(f); // [minX, minY, maxX, maxY]
    } catch (e) {
      issues.push({
        severity: 'error',
        field: `feature[${i}]`,
        message: `bbox 计算失败：${e.message}`,
      });
      continue;
    }
    const [minX, minY, maxX, maxY] = bbox;
    if (minX < -180 || maxX > 180 || minY < -90 || maxY > 90) {
      outOfRange++;
      issues.push({
        severity: 'error',
        field: `feature[${i}].bbox`,
        message: `经纬度超出合法范围（lng[-180,180] / lat[-90,90]），可能坐标系不是 WGS84`,
        value: { minX, minY, maxX, maxY },
      });
    }
    bboxes.push(bbox);
  }
  if (outOfRange > 0) {
    issues.push({
      severity: 'warn',
      field: '_global',
      message: `${outOfRange}/${features.length} 个要素经纬度越界，建议优先检查坐标系`,
    });
  }

  // 整体跨度合理性
  if (bboxes.length) {
    const globalBbox = bboxes.reduce(
      (acc, b) => [
        Math.min(acc[0], b[0]),
        Math.min(acc[1], b[1]),
        Math.max(acc[2], b[2]),
        Math.max(acc[3], b[3]),
      ],
      [Infinity, Infinity, -Infinity, -Infinity],
    );
    const [gMinX, gMinY, gMaxX, gMaxY] = globalBbox;
    const spanLng = gMaxX - gMinX;
    const spanLat = gMaxY - gMinY;
    if (spanLng > MAX_BBOX_DEG || spanLat > 180) {
      issues.push({
        severity: 'warn',
        field: '_global.bbox',
        message: `整体跨度异常（lng=${spanLng.toFixed(2)}°, lat=${spanLat.toFixed(2)}°），要素可能落在不同大洲`,
        value: { minX: gMinX, minY: gMinY, maxX: gMaxX, maxY: gMaxY },
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

// ---------- 几何检查 ----------
function checkGeometry(features) {
  const issues = [];
  if (!features.length) {
    return { ok: false, issues: [{ severity: 'error', field: '_global', message: '没有可检查的要素' }] };
  }
  let invalidCount = 0;
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    let valid = true;
    try {
      valid = turf.booleanValid(f, { mutate: false });
    } catch (e) {
      valid = false;
      issues.push({
        severity: 'error',
        field: `feature[${i}]`,
        message: `几何校验失败：${e.message}`,
      });
    }
    if (valid === false) {
      invalidCount++;
      issues.push({
        severity: 'error',
        field: `feature[${i}].geometry`,
        message: '几何无效（自相交 / 环未闭合 / 顶点过少等）',
      });
    }
  }
  if (invalidCount > 0 && invalidCount === features.length) {
    issues.push({
      severity: 'warn',
      field: '_global',
      message: '全部要素几何无效，分析结果可能为空',
    });
  }
  return { ok: issues.length === 0, issues };
}

// ---------- 属性检查 ----------
function checkAttributes(features) {
  const issues = [];
  if (!features.length) {
    return { ok: true, issues: [] };
  }
  // 字段类型统计
  const fieldTypes = {};
  for (const f of features) {
    const props = f.properties || {};
    for (const [k, v] of Object.entries(props)) {
      if (k.startsWith('_')) continue; // 跳过内部字段
      if (!fieldTypes[k]) {
        fieldTypes[k] = { numeric: 0, text: 0, boolean: 0, nullish: 0, sample: v };
      }
      const t = fieldTypes[k];
      if (v === null || v === undefined || v === '') t.nullish++;
      else if (typeof v === 'number') t.numeric++;
      else if (typeof v === 'boolean') t.boolean++;
      else t.text++;
    }
  }

  for (const [k, t] of Object.entries(fieldTypes)) {
    const total = t.numeric + t.text + t.boolean + t.nullish;
    if (t.text === total && total >= 3) {
      // 全部为文本，提示用作统计/分桶时注意
      issues.push({
        severity: 'warn',
        field: k,
        message: `字段「${k}」全部为文本（${total} 个），不能直接做数值聚合`,
      });
    } else if (t.numeric + t.text > 0 && t.numeric > 0 && t.text > 0) {
      // 混合类型
      issues.push({
        severity: 'warn',
        field: k,
        message: `字段「${k}」类型混杂（数字 ${t.numeric} / 文本 ${t.text}），统计前需清洗`,
      });
    }
    if (t.nullish > total / 2) {
      issues.push({
        severity: 'warn',
        field: k,
        message: `字段「${k}」空值占比 ${Math.round((t.nullish / total) * 100)}%，聚合时会被忽略`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

// ---------- 顶层入口 ----------
export function runThreeCheck(entities) {
  const features = collectFeatures(entities);
  const position = checkPosition(features);
  const geometry = checkGeometry(features);
  const attributes = checkAttributes(features);

  const errorCount = [position, geometry, attributes].reduce(
    (n, r) => n + r.issues.filter((i) => i.severity === 'error').length,
    0,
  );
  const warnCount = [position, geometry, attributes].reduce(
    (n, r) => n + r.issues.filter((i) => i.severity === 'warn').length,
    0,
  );

  return {
    position,
    geometry,
    attributes,
    summary: {
      featureCount: features.length,
      errorCount,
      warnCount,
      passed: errorCount === 0,
    },
  };
}