# CesiumJS 3D Gaussian Splat Pipeline 指南

> 周期 14 P1-4（2026-09-09）
> 来源：周期 13 调研 #4 + #12（CesiumJS Gaussian Splat 集成 + Microsoft campus 公共 splat 资源）
> 目标：从原始影像到 Cesium ion 可视化的完整 pipeline。

---

## 1. 什么是 3D Gaussian Splatting（3DGS）

3D Gaussian Splatting 是一种实时的神经渲染技术：
- 每个场景元素表示为 3D 高斯椭球（位置 + 协方差 + 不透明度 + 球谐函数颜色）
- 训练快（小时级），渲染快（30+ FPS），视觉质量接近 photogrammetry
- 适合：建筑、城市、文物、地形等场景的高保真重建
- 不适合：动态场景、超大规模场景（> 10GB）

---

## 2. 完整 pipeline（6 阶段）

### Stage 1：影像采集

- **设备**：手机（iPhone 12+ / Pixel 6+）、无人机（DJI Mavic 3）、360° 相机（Insta360）
- **关键**：GPS EXIF 必须保留；环绕主体拍摄 360°；重叠率 ≥ 70%
- **数量**：小物体 50-200 张，建筑/场景 500-2000 张
- **工具**：iOS RealityKit Capture、RealityCapture、DroneDeploy

### Stage 2：SfM（Structure from Motion）

从多视角照片重建稀疏点云 + 相机位姿。

**推荐工具**：
- **COLMAP**（开源，学术界标准）— GitHub: colmap/colmap
- **RealityCapture**（商业，快 10x，license 收费）
- **Meshroom**（AliceVision，开源）

**COLMAP 命令行**：
```bash
colmap automatic_reconstructor \
  --workspace_path ./project \
  --image_path ./images \
  --camera_model OPENCV \
  --dense 0
```

**输出**：`cameras.bin`、`images.bin`、`points3D.bin`

### Stage 3：Gaussian Splatting 训练

从 SfM 输出训练 3DGS 模型。

**官方实现**：
- INRIA 原版：github.com/graphdeco-inria/gaussian-splatting
- 要求：CUDA GPU（≥ 8GB VRAM）、Python 3.8+、PyTorch 2.0+

**简化实现**（CPU 友好）：
- gsplat：github.com/nerfstudio-project/gsplat
- 训练时间：1k 张 ≈ 30 分钟（RTX 3090）

**输出**：`.ply` 高斯点云（每点 62 字节：position 12B + scale 12B + rotation 16B + opacity 4B + SH 18B）

### Stage 4：地理参考（Geo-referencing）

将 PLY 输出从局部坐标系转换为真实地理坐标（EPSG:4326 / WGS84）。

**3 个 EXIF 来源**：
- 手机 GPS（精度 5-10m）
- RTK GNSS（精度 0.01-0.1m）
- 已知 GCP（Ground Control Points）

**流程**：
```python
import numpy as np
from pyproj import Transformer

# 局部坐标 → ECEF → 经纬高
# 使用 Helmert 7 参数转换 + 区域 WGS84 ↔ local ENU
```

**推荐工具**：
- **OpenDroneMap**（开源 drone pipeline，自动 geo-reference）
- **Pix4D**（商业，精度高）
- **Agisoft Metashape**（科研级）

**手动做法**：用 3 个以上 GCP（已知经纬高的地面点），3DGS 训练时固定它们的位姿。

### Stage 5：3D Tiles 转换

将 PLY 转成 3D Tiles 1.1 + KHR_gaussian_splatting extension。

**官方工具**：
- **3d-tiles-tools**：CesiumGS 官方 validator
- **Cesium ion**：上传 PLY → 自动转 3D Tiles（推荐新手）
- **tiler-tools**（开源）：github.com/CesiumGS/cesium/tree/main/tilers

**开源 pipeline**（推荐）：
- **georeferenced_gsplat**（manudelu）：github.com/manudelu/georeferenced_gsplat
  - 完整 Docker：GPS EXIF → COLMAP → SuGaR → Cesium ion
- **libTileSplat**（C++）：github.com/jin739738709/libTileSplat

**手动 3DGS → 3D Tiles**：
```bash
# 用 CesiumGS 的 tiler（实验性）
npx @cesium/cesium-3d-tiler --input model.ply --output tileset.json
```

### Stage 6：Cesium ion 可视化

```javascript
// 周期 13 P2-1 splatLoader.js 已落 API
import { loadGaussianSplatTileset } from './utils/splatLoader';

const tileset = await loadGaussianSplatTileset(viewer, {
  assetId: 4547222, // Microsoft Redmond campus 110M splats
  maxScreenSpaceError: 16,
});
```

**预设（周期 13 splatLoader.js）**：
- `quality` (sse=8) — 高保真，桌面 GPU
- `balanced` (sse=16) — 推荐
- `performance` (sse=32) — 笔记本
- `ultra-perf` (sse=64) — 移动端

---

## 3. Microsoft campus 公共 splat（开箱即用）

Cesium 提供了 Microsoft Redmond campus 110M 高斯 splat：

| 资源 | 值 |
|---|---|
| Asset ID | 4547222 |
| 大小 | 427.7 gigapixels |
| 覆盖 | 3.7 平方公里 |
| Splat 数 | 110M |
| LOD 配置 | maxScreenSpaceError 8 / 16 / 24 / 32 / 64 |

**加载代码**（参考周期 13 P2-1）：
```javascript
const viewer = new Cesium.Viewer('cesiumContainer');
const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(4547222, {
  maximumScreenSpaceError: 16,
});
viewer.scene.primitives.add(tileset);
```

---

## 4. 周期 13 / 14 本项目落地

| 周期 | 落地 |
|---|---|
| C13 P2-1 | `client/src/utils/splatLoader.js` — `classifySplatQuality(5 档)` + `loadGaussianSplatTileset()` stub + `getRecommendedPreset(fps)` |
| C14 P1-4 | `docs/guides/splat-pipeline.md`（本文档） |
| 后续周期 | CesiumJS 1.144 升级 + KHR_gaussian_splatting_compression_spz_2 支持 |

---

## 5. 性能 & 限制

| 维度 | 数据 |
|---|---|
| 单 splat 数据 | 62 字节（无压缩） / 12-25 字节（SPZ 压缩） |
| 1M splats 加载 | ~100-300ms（首屏） |
| 内存占用 | ~60-100MB / 1M splats |
| 推荐 GPU | NVIDIA RTX 2060+ / Apple M2+ |
| 不支持 | WebGL1（需 WebGL2）、移动端低端 GPU |
| 替代方案 | Cesium 3D Tiles（普通 mesh）/ photogrammetry mesh |

---

## 6. 调试 & 验证 checklist

- [ ] PLY 文件 header 正确（gaussian-splatting 训练输出格式）
- [ ] GPS EXIF 保留（用 `exiftool` 验证）
- [ ] SfM 重投影误差 < 1px
- [ ] 3DGS 训练 loss < 0.05
- [ ] Geo-reference 误差 < 1m（用 3 个 GCP 验证）
- [ ] 3D Tiles JSON 校验通过（用 `3d-tiles-tools validate`）
- [ ] Cesium ion 上传后能加载（asset ID 正确）
- [ ] maxScreenSpaceError 16 时帧率 ≥ 30 FPS

---

## 7. 资源链接

- CesiumJS 官方 splat 教程：https://cesium.com/learn/cesiumjs-learn/3d-guassian-splat-tilesets-lods/
- 3DGS 论文：https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/
- COLMAP：https://colmap.github.io/
- georeferenced_gsplat：https://github.com/manudelu/georeferenced_gsplat
- Microsoft campus asset：https://cesium.com/learn/cesiumjs-learn/3d-guassian-splat-tilesets-lods/
- KHR_gaussian_splatting extension：Khronos Group / OGC 候选标准 2026-Q3

---

## 8. 决策记录

- 周期 13 P2-1 决定：暂不切换到 WebGPU backend（覆盖率 73% < 80% 门槛）
- 周期 13 P2-1 决定：splat 加载走 Cesium ion（不开自托管 tileset server）
- 周期 14 P1-4 决定：升级 CesiumJS 至 1.144+（splat 支持稳定）待评估
- 周期 14 P1-4 决定：使用 Microsoft Redmond campus 作公共 demo（asset 4547222）
