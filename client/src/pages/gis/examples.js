// Sandcastle 风格的 Cesium 示例代码库
// 这些脚本在 sandbox 中可用 viewer / Cesium / scene / entities / canvas 变量

// expected —— 期望比对（用户运行后右侧"状态栏"会显示 ✓/✗）
//   featureDelta: 期望 features 数量变化（+N 表示加 N 个，-N 表示删 N 个）
//   logIncludes:   期望 console.* 输出包含某段字符串（粗匹配：substring）
//   noEntityChange: 期望 features 数量不变（仅做相机/UI 调整）
export const EXAMPLES = [
  {
    id: 'fly-home',
    title: '飞到中国上空',
    code: `// 把镜头移到中国上空
viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromDegrees(110, 35, 4_000_000),
  duration: 1.5,
});
console.log('已飞向中国');`,
    expected: { featureDelta: 0, logIncludes: '已飞向中国', hint: '纯飞行演示，地球要素不变，相机高度 ≈ 4000 km' },
  },
  {
    id: 'add-pin',
    title: '在纽约加一个引脚',
    code: `// 添加一个高亮标记 + 文字标签
entities.add({
  id: 'pin-' + Date.now(),
  position: Cesium.Cartesian3.fromDegrees(-74.006, 40.7128),
  point: {
    pixelSize: 16,
    color: Cesium.Color.fromCssColorString('#ff5e5e'),
    outlineColor: Cesium.Color.WHITE,
    outlineWidth: 2,
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
  },
  label: {
    text: '纽约',
    font: '14px sans-serif',
    fillColor: Cesium.Color.WHITE,
    outlineColor: Cesium.Color.BLACK,
    outlineWidth: 2,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    pixelOffset: new Cesium.Cartesian2(0, -28),
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
  },
});
console.log('已添加纽约标记');`,
    expected: { featureDelta: 1, logIncludes: '已添加纽约标记', hint: '纽约位置应该出现一个红点 + 标签"纽约"' },
  },
  {
    id: 'drop-pin-shanghai',
    title: '上海 + 北京 双引脚',
    code: `// 同时添加两个城市引脚
const cities = [
  { name: '北京', lon: 116.4074, lat: 39.9042 },
  { name: '上海', lon: 121.4737, lat: 31.2304 },
];
cities.forEach((c) => {
  entities.add({
    id: 'pin-' + c.name,
    position: Cesium.Cartesian3.fromDegrees(c.lon, c.lat),
    point: {
      pixelSize: 14,
      color: Cesium.Color.fromCssColorString('#5ad1ff'),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    },
    label: {
      text: c.name,
      font: '13px sans-serif',
      fillColor: Cesium.Color.WHITE,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      pixelOffset: new Cesium.Cartesian2(0, -22),
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    },
  });
});
console.log('已放置 ' + cities.length + ' 个引脚');`,
    expected: { featureDelta: 2, logIncludes: '已放置 2 个引脚', hint: '应同时出现 2 个蓝色引脚：北京 + 上海' },
  },
  {
    id: 'draw-rect',
    title: '在东京画矩形区域',
    code: `const tokyo = { lon: 139.6503, lat: 35.6762 };
const d = 3;
entities.add({
  id: 'rect-tokyo',
  name: '东京区域',
  polygon: {
    hierarchy: Cesium.Cartesian3.fromDegreesArray([
      tokyo.lon - d, tokyo.lat - d,
      tokyo.lon + d, tokyo.lat - d,
      tokyo.lon + d, tokyo.lat + d,
      tokyo.lon - d, tokyo.lat + d,
      tokyo.lon - d, tokyo.lat - d,
    ]),
    material: Cesium.Color.fromCssColorString('rgba(108,140,255,0.3)'),
    outline: true,
    outlineColor: Cesium.Color.fromCssColorString('#6c8cff'),
  },
});
viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(tokyo.lon, tokyo.lat, 1_500_000), duration: 1.2 });
console.log('矩形已绘制');`,
    expected: { featureDelta: 1, logIncludes: '矩形已绘制', hint: '东京上空出现一个蓝色矩形区域（边长 6° ≈ 666km），相机飞到 1500km 高度' },
  },
  {
    id: 'draw-flight-path',
    title: '北京→纽约飞行路径',
    code: `// 用 SampledPositionProperty 画一条 4 秒的飞行轨迹
const start = Cesium.JulianDate.now();
const stop = Cesium.JulianDate.addSeconds(start, 4, new Cesium.JulianDate());

const position = new Cesium.SampledPositionProperty();
position.addSample(start, Cesium.Cartesian3.fromDegrees(116.4074, 39.9042, 0));
position.addSample(stop, Cesium.Cartesian3.fromDegrees(-74.006, 40.7128, 0));

entities.add({
  id: 'flight-' + Date.now(),
  availability: new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({ start, stop })]),
  position,
  point: { pixelSize: 12, color: Cesium.Color.YELLOW },
  path: {
    resolution: 1,
    material: new Cesium.PolylineGlowMaterialProperty({
      glowPower: 0.2,
      color: Cesium.Color.fromCssColorString('#ffd166'),
    }),
    width: 6,
  },
});

viewer.clock.startTime = start.clone();
viewer.clock.stopTime = stop.clone();
viewer.clock.currentTime = start.clone();
viewer.clock.shouldAnimate = true;

console.log('飞行轨迹已启动');`,
    expected: { featureDelta: 1, logIncludes: '飞行轨迹已启动', hint: '地球上一条黄色光带从北京飞到纽约，时钟自动播放 4 秒' },
  },
  {
    id: '3d-tile',
    title: '3D 立方体演示',
    code: `// 演示一个旋转的 3D 立方体
const box = entities.add({
  id: 'box-' + Date.now(),
  name: '立方体',
  position: Cesium.Cartesian3.fromDegrees(116.4074, 39.9042, 200000),
  box: {
    dimensions: new Cesium.Cartesian3(300000, 300000, 300000),
    material: Cesium.Color.fromCssColorString('#a78bfa').withAlpha(0.85),
    outline: true,
    outlineColor: Cesium.Color.WHITE,
  },
});
viewer.flyTo(box);
console.log('立方体已添加');`,
    expected: { featureDelta: 1, logIncludes: '立方体已添加', hint: '北京上空 200km 处出现一个紫色立方体（边长 300km），相机飞过去' },
  },
  {
    id: 'clear',
    title: '清空所有 entities（除了城市预设）',
    code: `// 只移除运行时添加的实体，保留 id 以 'preset-' 开头的城市预设
const list = entities.values.slice();
let removed = 0;
list.forEach((e) => {
  if (!String(e.id || '').startsWith('preset-')) {
    entities.remove(e);
    removed++;
  }
});
console.log('清除了 ' + removed + ' 个实体');`,
    expected: { logMatches: /^清除了 \d+ 个实体/, hint: '会移除所有运行时 entity，id 以 preset- 开头的城市会被保留' },
  },
  {
    id: 'time-line',
    title: '显示时间轴并暂停',
    code: `viewer.timeline.zoomTo(
  Cesium.JulianDate.now(),
  Cesium.JulianDate.addHours(Cesium.JulianDate.now(), 12, new Cesium.JulianDate())
);
console.log('时间轴缩放到未来 12 小时');`,
    expected: { noEntityChange: true, logIncludes: '时间轴缩放到未来 12 小时', hint: '时间轴控件显示未来 12 小时窗口，地球要素不变' },
  },
];

export const DEFAULT_CODE = `// 👋 这是 Sandcastle 风格的 Cesium 控制台。
// - 可用变量：viewer / Cesium / scene / entities / canvas
// - 点 ▶ Run 执行；console 输出会出现在输出台
// - 点击 "示例 ▼" 加载预设脚本
// - 在左侧 AI 对话页输入 "在伦敦添加一个引脚" 等指令，AI 会输出代码块并自动出现 ▶ 运行按钮

viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromDegrees(110, 35, 5_000_000),
  duration: 1.5,
});
console.log('🌍 Hello from Cesium');`;
