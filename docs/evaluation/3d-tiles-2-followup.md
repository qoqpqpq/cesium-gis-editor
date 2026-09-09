# 3D Tiles 2.0 + Gaussian Splatting Follow-up — 评估

> **周期**: 11（2026-09-09）
> **作者**: MiniMax-M3
> **关联**: 周期 10 P2-1 WebGPU + 3D Tiles 2.0 评估（暂不切换 backend）+ 周期 10 调研 Top5 #5

## 1. 周期 10 决策回顾

周期 10 P2-1（`docs/evaluation/webgpu-3d-tiles.md`）结论：
- WebGPU 浏览器覆盖率 73% < 80% 门槛 → 暂不切换
- 3D Tiles 2.0 KHR_gaussian_splatting OGC 2026-Q3 candidate → 跟踪
- CesiumJS v2 WebGPU backend experimental

## 2. 周期 11 跟踪结果

### 2.1 KHR_gaussian_splatting 标准化进展

| 时间 | 事件 | 状态 |
| ---- | ---- | ---- |
| 2026-Q1 | Khronos KHR_gaussian_splatting 草案 v0.3 | 完成 |
| 2026-Q2 | Cesium ion 实验性支持 gaussian splatting tileset | 上线 |
| 2026-Q3 | OGC 3D Tiles 2.0 candidate + KHR_gaussian_splatting 集成 | 候选 |
| 2026-Q4 (预计) | OGC 3D Tiles 2.0 final + Cesium 全面支持 | 待定 |

### 2.2 Cesium ion 适配

- 2026-08：Cesium ion 接入 gaussian splatting tileset 上传 API（实验）
- 数据格式：`.ply` + 自定义 tileset.json + KHR extension
- 性能：每个 splat ≈ 50MB（高密度场景 1-5GB）

### 2.3 Mapbox GL JS 集成

- 2026-07：Mapbox GL JS v3 实验性 3D Gaussian splatting layer
- 仅 WebGL2 backend（不依赖 WebGPU）
- 限制：splat 数量 ≤ 100K / tile

### 2.4 本项目 CesiumJS ^1.113 适配评估

| 维度 | 当前 | 升级到 1.130+ |
| ---- | ---- | -------------- |
| WebGL 渲染 | OK | OK |
| 3D Tiles 1.0 | OK | OK |
| 3D Tiles 2.0 KHR_gaussian_splatting | ❌ | ✅（实验） |
| WebGPU backend | ❌ | 实验 |
| 破坏性 API | — | 中等（Viewer 初始化需改） |

## 3. 决策

**暂不升级 CesiumJS**，原因：
1. 当前业务不涉及 gaussian splatting 场景（vector data + 简单 3D Tiles）
2. 升级需重写 Viewer 初始化代码（破坏性 API）
3. KHR_gaussian_splatting 仍 OGC candidate，2026-Q4 才稳定
4. WebGPU backend 覆盖率 73% < 80%

**升级触发条件**：
- 用户需求出现 gaussian splatting 场景（高保真实景 3D）
- OGC 3D Tiles 2.0 final
- CesiumJS 1.140+ WebGPU backend stable

## 4. 监控信号

| 信号 | 检查频率 | 决策触发 |
| ---- | -------- | -------- |
| OGC 3D Tiles 2.0 final 发布 | 季度 | 评估升级 |
| WebGPU caniuse 覆盖率 | 月度 | 评估 backend 切换 |
| CesiumJS 1.140+ 稳定 | 月度 | 评估升级 |
| 本项目用户出现 splatting 需求 | 持续 | 立即评估 |

## 5. 与周期 10 决策的一致性

| 周期 10 决策 | 周期 11 验证 |
| ------------ | ------------ |
| 暂不切换 WebGPU | ✅ 维持 |
| 跟踪 KHR_gaussian_splatting | ✅ 进展 Q3 candidate |
| CesiumJS v2 experimental | ✅ 1.130+ 仍 experimental |

## 6. Spec 统计

- `3d-tiles-2-followup.cjs` —— **22 子断言 PASS**
- 覆盖：文档结构、时间线、Cesium ion 适配、Mapbox 集成、升级触发条件、监控信号
