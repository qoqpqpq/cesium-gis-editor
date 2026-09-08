# 3D Tiles 2.0 + WebGPU Pipeline 评估

> **周期**: 10（2026-09-08）P2-1
> **目的**: 评估 CesiumJS v2+ WebGPU backend + 3D Tiles 2.0（含 Gaussian Splatting）的可行性
> **结论（先）**: **暂不切换 backend**。当前 cesiumJS WebGL 已足够；周期 11+ 关注 3D Tiles 2.0 兼容性

## 1. 现状（CesiumJS + WebGL）

- cesiumJS 当前用 WebGL 1/2（不是 WebGPU）
- 3D Tiles 1.0 已支持（3D Tiles Loader + Instanced Mesh）
- 性能：CPU 渲染开销仍较高；GPU 利用率受限
- 浏览器支持：WebGL 2 全主流浏览器（Chrome / Firefox / Safari / Edge）

## 2. WebGPU 趋势

| 维度 | WebGL 2 | WebGPU |
| ---- | ------- | ------ |
| 浏览器支持 | 全主流 | Chrome 113+ / Firefox 121+ / Safari 17+（2024 Q2+） |
| 性能 | 中 | 高（CPU 开销降 80-95%） |
| 计算着色器 | 无 | 有（compute pipeline） |
| 现代 API | 旧 | 新（基于 Vulkan / Metal / D3D12） |
| 生态 | 成熟 | 演进中 |

## 3. cesiumJS v2 WebGPU 状态

- 官方 [Cesium v2 Roadmap](https://github.com/CesiumGS/cesium/milestones) 提到 WebGPU backend 探索（2026 仍 experimental）
- 切换成本：API 不完全兼容，部分老 shader / 材质需重写
- 收益：CPU 占用降 80-95%（osgeo.cn 2026 全景）

## 4. 3D Tiles 2.0 状态

- 3D Tiles 2.0 含 Gaussian Splatting（3DGS）：高质量神经渲染
- cesiumJS v1.110+ 开始支持 3DGS（experimental）
- 浏览器 / GPU 要求：WebGL 2 + 8GB+ VRAM
- 数据来源：Polycam / Luma AI / 商用 scanner

## 5. 决策矩阵

| 维度 | 现状 WebGL | WebGPU 切换 | 3D Tiles 2.0 |
| ---- | ---------- | ----------- | ------------ |
| 部署成本 | 0 | +2 | +1 |
| 性能提升 | 0 | +80% | +30% |
| 浏览器兼容 | 全主流 | Chrome 113+（2024 Q2+） | WebGL 2 |
| 维护成本 | 0 | +1（双 backend） | +1 |
| 收益场景 | 全 | 大数据量 / 高帧率 | 高斯泼溅 |

## 6. 推荐路径

**短期（周期 11-12）**：保持 WebGL；监控 cesiumJS v2 GA 时间。

**中期（周期 13-15）**：
1. 评估 cesiumJS v2 WebGPU backend experimental
2. spec 验证现有 viewer 与 WebGPU 兼容性
3. 双 backend（环境变量切换）

**长期（周期 16+）**：
1. 3D Tiles 2.0 Gaussian Splatting 集成
2. AI 驱动的 3D 重建工作流（Polycam / Luma AI）

## 7. 风险清单

| 风险 | 等级 | 缓解 |
| ---- | ---- | ---- |
| WebGPU 浏览器兼容（Safari < 17） | 高 | 检测 + fallback WebGL |
| 现有 viewer 代码可能与 WebGPU API 不兼容 | 中 | spec 测试 + 分支处理 |
| 3D Tiles 2.0 数据格式变化 | 中 | 兼容层 |
| GPU VRAM 要求（8GB+） | 中 | 客户端 GPU 探测 |
| 老 CesiumJS v1.x 与 v2.x API 变化 | 高 | 升级路径 + EOL 规划 |
| 双 backend 维护成本 | 中 | 抽象层封装 |

## 8. 落地本周期

- ✅ 写本文档（`docs/evaluation/webgpu-3d-tiles.md`）
- ✅ 写 `tests/specs/webgpu-3d-tiles-eval.cjs`（6 子断言）

## 9. 参考资料

1. osgeo.cn GIS 前端主流新技术 2026 全景：<https://osgeo.cn/post/1cca5/>
2. CesiumJS GitHub Milestones：<https://github.com/CesiumGS/cesium/milestones>
3. 3D Tiles Specification：<https://github.com/CesiumGS/3d-tiles>
4. WebGPU 浏览器支持：<https://caniuse.com/webgpu>
5. Gaussian Splatting 论文：3D Gaussian Splatting for Real-Time Radiance Field Rendering（SIGGRAPH 2023）