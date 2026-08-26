// importer — GeoJSON → editor 实体集合
// 接受 FeatureCollection 或单个 Feature / Feature[]

import * as Cesium from 'cesium';
import { lngLatHeightsToCartesians, newFeatureId } from './geometry.js';

function addFeature(api, feature, defaultLayerId, defaultStyle) {
  if (!feature || !feature.geometry) return null;
  const fid = feature.id || newFeatureId(feature.geometry.type.toLowerCase());
  const props = feature.properties || {};
  const kind = props.kind || inferKind(feature.geometry);
  const style = { ...defaultStyle, ...(props.style || {}) };
  const layerId = props.layerId || defaultLayerId;
  // 提取用户属性：所有非保留字段
  const attrs = {};
  for (const [k, v] of Object.entries(props)) {
    if (['kind', 'featureId', 'layerId', 'selected', 'style', 'name', 'attrs'].includes(k)) continue;
    attrs[k] = v;
  }
  // 也支持嵌套 {attrs: {...}} 形式
  if (props.attrs && typeof props.attrs === 'object') {
    Object.assign(attrs, props.attrs);
  }

  let positions = [];
  if (feature.geometry.type === 'Point') {
    positions = lngLatHeightsToCartesians([feature.geometry.coordinates]);
  } else if (feature.geometry.type === 'LineString') {
    positions = lngLatHeightsToCartesians(feature.geometry.coordinates);
  } else if (feature.geometry.type === 'Polygon') {
    positions = lngLatHeightsToCartesians(feature.geometry.coordinates[0] || []);
  } else {
    return null;
  }
  if (!positions.length) return null;

  const cbPos = new Cesium.CallbackProperty(() => positions, false);
  const cbHierarchy = new Cesium.CallbackProperty(
    () => new Cesium.PolygonHierarchy(positions),
    false
  );

  const opts = {
    id: fid,
    name: props.name || kind,
    properties: { kind, featureId: fid, layerId, selected: false, style, attrs },
  };
  if (kind === 'point') {
    opts.position = positions[0];
    opts.point = {
      pixelSize: style.pointSize,
      color: Cesium.Color.fromCssColorString(style.pointColor),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    };
  } else if (kind === 'polyline') {
    opts.polyline = {
      positions: cbPos,
      width: style.strokeWidth,
      material: Cesium.Color.fromCssColorString(style.strokeColor),
    };
  } else {
    opts.polygon = {
      hierarchy: cbHierarchy,
      material: Cesium.Color.fromCssColorString(style.fillColor),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString(style.strokeColor),
      outlineWidth: style.strokeWidth,
    };
  }
  return api.addEditorEntity(opts);
}

function inferKind(geom) {
  if (geom.type === 'Point') return 'point';
  if (geom.type === 'LineString') return 'polyline';
  return 'polygon';
}

export function importGeoJSON(api, json, defaultLayerId = 'default', defaultStyle) {
  const ds = api && api.getEditorDataSource && api.getEditorDataSource();
  if (!ds) return [];
  const fc = json && json.type === 'FeatureCollection' ? json
    : Array.isArray(json) ? { features: json }
    : json && json.type === 'Feature' ? { features: [json] }
    : null;
  if (!fc) return [];
  const created = [];
  fc.features.forEach((f) => {
    const e = addFeature(api, f, defaultLayerId, defaultStyle);
    if (e) created.push(e);
  });
  return created;
}