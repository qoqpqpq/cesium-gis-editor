// 坐标格式转换：decimal / DMS / UTM / MGRS
// 无外部依赖；MGRS 是 UTM 基础上叠加字母方格编码
// 用法：
//   decToDMS(116.39, 39.91)            → "116°23'24.0\"E 39°54'36.0\"N"
//   decToUTM(116.39, 39.91)            → "50N 448123 4415678"
//   decToMGRS(116.39, 39.91)           → "50TVD4812301567"
// 极区（lat ≥ 84°N 或 lat ≤ -80°S）：MGRS 不适用，返回带警告的 UTM

// ============================================================
// decimal ↔ DMS
// ============================================================

function pad(n, w) {
  const s = String(Math.abs(n));
  return s.length < w ? '0'.repeat(w - s.length) + s : s;
}

function decToDmsPart(decimal, isLat) {
  const hemi = isLat ? (decimal >= 0 ? 'N' : 'S') : (decimal >= 0 ? 'E' : 'W');
  const abs = Math.abs(decimal);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const s = (mFloat - m) * 60;
  return { hemi, d, m, s };
}

export function decToDMS(lng, lat, precision = 1) {
  const L = decToDmsPart(lng, false);
  const B = decToDmsPart(lat, true);
  return `${L.d}°${pad(L.m, 2)}'${sFixed(L.s, precision)}"${L.hemi} ` +
         `${B.d}°${pad(B.m, 2)}'${sFixed(B.s, precision)}"${B.hemi}`;
}

function sFixed(s, p) {
  return s.toFixed(p);
}

// ============================================================
// UTM（横轴墨卡托）
// 参考：https://en.wikipedia.org/wiki/Universal_Transverse_Mercator_coordinate_system
// ============================================================

const A = 6378137;                  // WGS84 长半轴
const F_INV = 298.257223563;        // 扁率倒数
const F = 1 / F_INV;
const E2 = F * (2 - F);             // 第一偏心率平方
const E_PRIME2 = E2 / (1 - E2);     // 第二偏心率平方
const K0 = 0.9996;                  // UTM 比例因子
const ZONE_WIDTH = 6;               // 每带宽度（度）

function utmZone(lng) {
  return Math.floor((lng + 180) / ZONE_WIDTH) + 1;
}

function isNorth(lat) {
  return lat >= 0;
}

// 计算带中心经度（弧度）
function zoneCentralMeridian(zone) {
  return ((zone - 1) * ZONE_WIDTH - 180 + ZONE_WIDTH / 2) * Math.PI / 180;
}

// 弧度 lng/lat → UTM easting/northing（米）
function latLngToUtm(lngRad, latRad, zone) {
  const lng0 = zoneCentralMeridian(zone);
  const N = A / Math.sqrt(1 - E2 * Math.sin(latRad) * Math.sin(latRad));
  const T = Math.tan(latRad) * Math.tan(latRad);
  const C = E_PRIME2 * Math.cos(latRad) * Math.cos(latRad);
  const Aterm = Math.cos(latRad) * (lngRad - lng0);
  const M = A * (
    (1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * E2 * E2 * E2 / 256) * latRad
    - (3 * E2 / 8 + 3 * E2 * E2 / 32 + 45 * E2 * E2 * E2 / 1024) * Math.sin(2 * latRad)
    + (15 * E2 * E2 / 256 + 45 * E2 * E2 * E2 / 1024) * Math.sin(4 * latRad)
    - (35 * E2 * E2 * E2 / 3072) * Math.sin(6 * latRad)
  );
  const easting = K0 * N * (Aterm
    + (1 - T + C) * Aterm * Aterm * Aterm / 6
    + (5 - 18 * T + T * T + 72 * C - 58 * E_PRIME2) * Math.pow(Aterm, 5) / 120
  ) + 500000;
  let northing = K0 * (M + N * Math.tan(latRad) * (
    Aterm * Aterm / 2
    + (5 - T + 9 * C + 4 * C * C) * Math.pow(Aterm, 4) / 24
    + (61 - 58 * T + T * T + 600 * C - 330 * E_PRIME2) * Math.pow(Aterm, 6) / 720
  ));
  if (latRad < 0) northing += 10000000;
  return { easting, northing };
}

export function decToUTM(lng, lat) {
  const lngRad = lng * Math.PI / 180;
  const latRad = lat * Math.PI / 180;
  const zone = utmZone(lng);
  const { easting, northing } = latLngToUtm(lngRad, latRad, zone);
  const band = `${zone}${isNorth(lat) ? 'N' : 'S'}`;
  return `${band} ${Math.round(easting)} ${Math.round(northing)}`;
}

// ============================================================
// MGRS（在 UTM 基础上加 100km 方格字母）
// 方格字母规则：列号 A–Z（跳过 I/O）按行循环
// ============================================================

// MGRS 纬度带字母：C(80–84°S) ... X(72–84°N)，跳过 I 和 O
function mgrsLatBandLetter(lat) {
  if (lat < -80 || lat > 84) return null; // 极区不支持
  // 把 -90..90 映射到 0..19（20 个字母）
  const idx = Math.floor((lat + 80) / 8);
  const letters = ['C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T','U','V','W','X'];
  return letters[Math.max(0, Math.min(19, idx))];
}

// 100km 方格字母：横坐标 easting 每 100km 模 20 → 列；纵坐标 northing 每 100km 模 20 → 行
// 但实际是按 set 划分（set 1/2/3/odd/even by zone），这里用简化版（按 zone%6 选 set）
// 返回 [列字母, 行字母]
function mgrs100kLetters(zone, easting, northing) {
  // 列字母 set（按 zone%3 选，标准 MGRS 规则）
  const colSets = {
    1: ['A','B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T','U','V'],
    2: ['F','G','H','J','K','L','M','N','P','Q','R','S','T','U','V','A','B','C','D','E'],
    3: ['L','M','N','P','Q','R','S','T','U','V','A','B','C','D','E','F','G','H','J','K'],
  };
  const rowSetsOdd  = ['A','B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T','U','V'];
  const rowSetsEven = ['J','K','L','M','N','P','Q','R','S','T','U','V','A','B','C','D','E','F','G','H'];
  const colSet = colSets[((zone - 1) % 3) + 1];
  const rowSet = (zone % 2 === 1) ? rowSetsOdd : rowSetsEven;
  // col: MGRS 列从 100000m 起，每 100km 一格
  const col = Math.floor((easting - 100000) / 100000) % 20;
  const row = Math.floor(northing / 100000) % 20;
  return [colSet[col < 0 ? col + 20 : col], rowSet[row < 0 ? row + 20 : row]];
}

export function decToMGRS(lng, lat, precision = 5) {
  const band = mgrsLatBandLetter(lat);
  if (!band) {
    return '⚠outside-MGRS: ' + decToUTM(lng, lat);
  }
  const lngRad = lng * Math.PI / 180;
  const latRad = lat * Math.PI / 180;
  const zone = utmZone(lng);
  const { easting, northing } = latLngToUtm(lngRad, latRad, zone);
  const [colL, rowL] = mgrs100kLetters(zone, easting, northing);
  // 100km 内的数字部分（precision 位 = 1m/10m/100m/1km/10km）
  const inSquareE = Math.floor(easting % 100000);
  const inSquareN = Math.floor(northing % 100000);
  const factor = Math.pow(10, 5 - precision);
  const ePart = String(Math.floor(inSquareE / factor)).padStart(precision, '0');
  const nPart = String(Math.floor(inSquareN / factor)).padStart(precision, '0');
  return `${zone}${band} ${colL}${rowL} ${ePart} ${nPart}`;
}

// ============================================================
// 统一入口
// ============================================================

export function formatCoord(lng, lat, format = 'dec', opts = {}) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return '';
  switch (format) {
    case 'dms':  return decToDMS(lng, lat, opts.precision || 1);
    case 'utm':  return decToUTM(lng, lat);
    case 'mgrs': return decToMGRS(lng, lat, opts.precision || 5);
    case 'dec':
    default:     return `${lng.toFixed(opts.precision || 5)}°, ${lat.toFixed(opts.precision || 5)}°`;
  }
}