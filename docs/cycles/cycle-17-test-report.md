# Cycle 17 Test Report

> 周期 17 测试报告（2026-10-16）

---

## R1: viewstate-url-serialization.cjs

```
=== viewstate-url-serialization ===
  [PASS] A1: 定义 HASH_KEY 常量
  [PASS] A2: 定义 URL_LENGTH_LIMIT 常量
  [PASS] A3: 定义 COMPRESS_VERSION 常量
  [PASS] A4: 定义 COMPRESS_PREFIX 常量
  [PASS] A5: 导出 base64UrlEncode 函数
  [PASS] A6: 导出 base64UrlDecode 函数
  [PASS] A7: 导出 readViewStateFromUrl 函数
  [PASS] A8: 导出 readViewStateFromUrlAsync 函数
  [PASS] A9: 导出 buildViewStateHash 函数
  [PASS] A10: 导出 buildShareUrl 函数
  [PASS] A11: 导出 snapshotCamera 函数
  [PASS] A12: 导出 applyCameraSnapshot 函数
  [PASS] B1: base64UrlEncode 基本编码
  [PASS] B2: base64UrlEncode 中文编码
  [PASS] B3: base64UrlEncode JSON 编码
  [PASS] C1: base64UrlDecode 基本解码
  [PASS] C2: base64UrlDecode 中文解码
  [PASS] C3: base64UrlDecode JSON 解码
  [PASS] C4: base64UrlDecode 空字符串
  [PASS] D1: buildViewStateHash 返回空字符串（无 state）
  [PASS] D2: buildViewStateHash 含降级逻辑
  [PASS] D3: buildViewStateHash 含 URL 长度检查
  [PASS] D4: buildViewStateHash 含压缩逻辑
  [PASS] D5: buildViewStateHash 含降级警告
  [PASS] E1: readViewStateFromUrl 支持 v1 格式
  [PASS] E2: readViewStateFromUrl 支持 v2 格式
  [PASS] E3: readViewStateFromUrl 验证 camera 字段
  [PASS] E4: readViewStateFromUrl 错误处理
  [PASS] F1: 含 compressToBase64 函数
  [PASS] F2: 含 decompressFromBase64 函数
  [PASS] F3: 含 decompressFromBase64Async 函数
  [PASS] F4: 含 DecompressionStream 支持
  [PASS] F5: 含 pako 懒加载
  [PASS] F6: 含 base64UrlEncodeBytes 函数
  [PASS] F7: 含 base64UrlDecodeBinary 函数
  [PASS] G1: zlib deflate/inflate 基本测试
  [PASS] G2: 压缩后体积小于原始（大文本）
  [PASS] G3: v2 格式前缀检测
--- summary: pass=38 fail=0 ---
```

---

## 回归测试

| Spec | 结果 |
|---|---|
| ai-guardrails | 39 PASS ✅ |
| ai-guardrails-deep | 38 PASS ✅ |
| server-import-completeness | 12 PASS ✅ |

**零回归确认**：3 个 spec 全部通过。

---

## R4: tileset-loaders.cjs

```
=== tileset-loaders ===
  [PASS] A1: 定义 SPLAT_QUALITY_PRESETS
  [PASS] A2: 导出 classifySplatQuality 函数
  [PASS] A3: 导出 loadGaussianSplatTileset 函数
  [PASS] A4: 导出 getSplatLODConfig 函数
  [PASS] A5: 导出 getRecommendedPreset 函数
  [PASS] A6: 导出 SPLAT_QUALITY_PRESETS 常量
  [PASS] A7: 导出默认对象
  [PASS] B1: SPLAT_QUALITY_PRESETS 含 5 个预设
  [PASS] B2: classifySplatQuality 检查 sse 类型
  [PASS] B3: classifySplatQuality 返回 unknown 当无效
  [PASS] B4: loadGaussianSplatTileset 检查 viewer
  [PASS] B5: loadGaussianSplatTileset 检查 assetId 类型
  [PASS] B6: getSplatLODConfig 检查 viewer._splatTileset
  [PASS] B7: getRecommendedPreset 默认 balanced
  [PASS] C1: 定义 KNOWN_GAUSSIAN_EXTS
  [PASS] C2: 定义 KNOWN_VECTOR_EXTS
  [PASS] C3: 定义 KNOWN_VOXEL_EXTS
  [PASS] C4: 导出 classifyTileset 函数
  [PASS] C5: 导出 chooseRenderMode 函数
  [PASS] C6: 导出 isFeatureSupported 函数
  [PASS] C7: 导出 isTileset2x 函数
  [PASS] C8: 导出 KNOWN_*_EXTS 常量
  [PASS] C9: 导出默认对象
  [PASS] D1: classifyTileset 检查输入类型
  [PASS] D2: classifyTileset 检查 root 或 asset 字段
  [PASS] D3: classifyTileset 检测 gltfUpAxis
  [PASS] D4: classifyTileset 检测 version 2.1
  [PASS] D5: classifyTileset 检测 Gaussian splat
  [PASS] D6: classifyTileset 检测 vector tiles
  [PASS] D7: classifyTileset 检测 voxel
  [PASS] D8: chooseRenderMode 优先级 hybrid > gaussian > vector > legacy
  [PASS] D9: isFeatureSupported 检查 feature 类型
  [PASS] D10: isFeatureSupported 检查 gaussian-splat
  [PASS] D11: isFeatureSupported 检查 vector-tiles
  [PASS] D12: isFeatureSupported 检查 voxel
  [PASS] D13: isTileset2x 检查 gltfVersion 2.1
  [PASS] E1: 1.x tileset (仅 root)
  [PASS] E2: 2.0 tileset (asset.gltfUpAxis)
  [PASS] E3: 2.1 tileset (asset.version)
  [PASS] E4: Gaussian splat tileset
  [PASS] E5: Vector tiles tileset
  [PASS] E6: 无效输入返回空对象
  [PASS] F1: 无 cls 返回 legacy
  [PASS] F2: 1.x 返回 legacy
  [PASS] F3: Gaussian splat 返回 gaussian-splat
  [PASS] F4: Vector tiles 返回 vector-tiles
  [PASS] F5: Hybrid 返回 hybrid
--- summary: pass=47 fail=0 ---
```

---

## 回归测试（R4）

| Spec | 结果 |
|---|---|
| ai-guardrails | 39 PASS ✅ |
| ai-guardrails-deep | 38 PASS ✅ |
| server-import-completeness | 12 PASS ✅ |

**零回归确认**：3 个 spec 全部通过。

---

## R3: sessionkeys-management.cjs

```
=== sessionkeys-management ===
  [PASS] A1: 导出 getAll 函数
  [PASS] A2: 导出 get 函数
  [PASS] A3: 导出 set 函数
  [PASS] A4: 导出 remove 函数
  [PASS] A5: 导出 clearAll 函数
  [PASS] A6: 导出 hasAny 函数
  [PASS] A7: 导出 maskKey 函数
  [PASS] B1: 定义 store 对象
  [PASS] B2: 定义 notify 函数
  [PASS] B3: notify 使用 dispatchEvent
  [PASS] B4: notify 使用 CustomEvent
  [PASS] C1: getAll 接受 opts 参数
  [PASS] C2: getAll 支持 withRemark 选项
  [PASS] C3: getAll 使用 Object.entries
  [PASS] C4: getAll 返回 platform 字段
  [PASS] C5: getAll 返回 apiKey 字段
  [PASS] C6: getAll 返回 baseUrl 字段
  [PASS] C7: getAll 返回 modelName 字段
  [PASS] C8: getAll 返回 savedAt 字段
  [PASS] C9: getAll 条件返回 remark 字段
  [PASS] D1: get 检查 store[platform]
  [PASS] D2: get 返回 null 当不存在
  [PASS] D3: get 返回包含 platform 的对象
  [PASS] E1: set 存储 apiKey
  [PASS] E2: set 存储 baseUrl（默认空字符串）
  [PASS] E3: set 存储 modelName（默认空字符串）
  [PASS] E4: set 存储 remark（默认空字符串）
  [PASS] E5: set 存储 savedAt（默认当前时间）
  [PASS] E6: set 调用 notify
  [PASS] F1: remove 检查 store[platform]
  [PASS] F2: remove 删除 store[platform]
  [PASS] F3: remove 调用 notify
  [PASS] G1: clearAll 遍历 store 键
  [PASS] G2: clearAll 删除每个键
  [PASS] G3: clearAll 调用 notify
  [PASS] H1: hasAny 检查 store 键数量
  [PASS] I1: maskKey 空值返回空字符串
  [PASS] I2: maskKey 短字符串（≤8）返回 ****
  [PASS] I3: maskKey 长字符串返回前4后4
  [PASS] J1: maskKey 空字符串返回空
  [PASS] J2: maskKey null 返回空
  [PASS] J3: maskKey 短字符串返回 ****
  [PASS] J4: maskKey 长字符串返回前4后4
  [PASS] J5: maskKey 边界值（9字符）
--- summary: pass=44 fail=0 ---
```

---

## 回归测试（R3）

| Spec | 结果 |
|---|---|
| ai-guardrails | 39 PASS ✅ |
| ai-guardrails-deep | 38 PASS ✅ |
| server-import-completeness | 12 PASS ✅ |

**零回归确认**：3 个 spec 全部通过。

---

## R4: tileset-loaders.cjs

```
=== tileset-loaders ===
  [PASS] A1: 定义 SPLAT_QUALITY_PRESETS
  [PASS] A2: 导出 classifySplatQuality 函数
  [PASS] A3: 导出 loadGaussianSplatTileset 函数
  [PASS] A4: 导出 getSplatLODConfig 函数
  [PASS] A5: 导出 getRecommendedPreset 函数
  [PASS] A6: 导出 SPLAT_QUALITY_PRESETS 常量
  [PASS] A7: 导出默认对象
  [PASS] B1: SPLAT_QUALITY_PRESETS 含 5 个预设
  [PASS] B2: classifySplatQuality 检查 sse 类型
  [PASS] B3: classifySplatQuality 返回 unknown 当无效
  [PASS] B4: loadGaussianSplatTileset 检查 viewer
  [PASS] B5: loadGaussianSplatTileset 检查 assetId 类型
  [PASS] B6: getSplatLODConfig 检查 viewer._splatTileset
  [PASS] B7: getRecommendedPreset 默认 balanced
  [PASS] C1: 定义 KNOWN_GAUSSIAN_EXTS
  [PASS] C2: 定义 KNOWN_VECTOR_EXTS
  [PASS] C3: 定义 KNOWN_VOXEL_EXTS
  [PASS] C4: 导出 classifyTileset 函数
  [PASS] C5: 导出 chooseRenderMode 函数
  [PASS] C6: 导出 isFeatureSupported 函数
  [PASS] C7: 导出 isTileset2x 函数
  [PASS] C8: 导出 KNOWN_*_EXTS 常量
  [PASS] C9: 导出默认对象
  [PASS] D1: classifyTileset 检查输入类型
  [PASS] D2: classifyTileset 检查 root 或 asset 字段
  [PASS] D3: classifyTileset 检测 gltfUpAxis
  [PASS] D4: classifyTileset 检测 version 2.1
  [PASS] D5: classifyTileset 检测 Gaussian splat
  [PASS] D6: classifyTileset 检测 vector tiles
  [PASS] D7: classifyTileset 检测 voxel
  [PASS] D8: chooseRenderMode 优先级 hybrid > gaussian > vector > legacy
  [PASS] D9: isFeatureSupported 检查 feature 类型
  [PASS] D10: isFeatureSupported 检查 gaussian-splat
  [PASS] D11: isFeatureSupported 检查 vector-tiles
  [PASS] D12: isFeatureSupported 检查 voxel
  [PASS] D13: isTileset2x 检查 gltfVersion 2.1
  [PASS] E1: 1.x tileset (仅 root)
  [PASS] E2: 2.0 tileset (asset.gltfUpAxis)
  [PASS] E3: 2.1 tileset (asset.version)
  [PASS] E4: Gaussian splat tileset
  [PASS] E5: Vector tiles tileset
  [PASS] E6: 无效输入返回空对象
  [PASS] F1: 无 cls 返回 legacy
  [PASS] F2: 1.x 返回 legacy
  [PASS] F3: Gaussian splat 返回 gaussian-splat
  [PASS] F4: Vector tiles 返回 vector-tiles
  [PASS] F5: Hybrid 返回 hybrid
--- summary: pass=47 fail=0 ---
```

---

## 回归测试（R4）

| Spec | 结果 |
|---|---|
| ai-guardrails | 39 PASS ✅ |
| ai-guardrails-deep | 38 PASS ✅ |
| server-import-completeness | 12 PASS ✅ |

**零回归确认**：3 个 spec 全部通过。

---

## R2: asyncguard-error-handling.cjs

```
=== asyncguard-error-handling ===
  [PASS] A1: 导出 installAsyncGuard 函数
  [PASS] A2: 导出 uninstallAsyncGuard 函数
  [PASS] A3: 导出 isAsyncGuardInstalled 函数
  [PASS] A4: 导出 wrapAsyncHandler 函数
  [PASS] A5: 导出默认对象
  [PASS] A6: 默认导出包含所有函数
  [PASS] B1: 定义 _installed 标记
  [PASS] B2: 定义 _currentListener 标记
  [PASS] B3: 定义 _telemetryUrl 标记
  [PASS] C1: 检查 window 环境
  [PASS] C2: 防止重复安装
  [PASS] C3: 注册 unhandledrejection 监听
  [PASS] C4: 注册 error 监听
  [PASS] C5: 设置 _installed = true
  [PASS] C6: 返回卸载函数
  [PASS] D1: 提取 rejection reason
  [PASS] D2: 转换为 Error 实例
  [PASS] D3: console.error 输出（非 silent）
  [PASS] D4: 上报 telemetry
  [PASS] D5: 调用 onError 回调
  [PASS] D6: preventDefault 防止浏览器 banner
  [PASS] E1: 提取 event.error
  [PASS] E2: 转换为 Error 实例
  [PASS] E3: console.error 输出
  [PASS] E4: 上报 telemetry
  [PASS] F1: 检查 fn 类型
  [PASS] F2: 返回包装函数
  [PASS] F3: try-catch 捕获错误
  [PASS] F4: 转换为 Error 实例
  [PASS] F5: 上报 telemetry
  [PASS] F6: 调用 onError 回调
  [PASS] F7: 不 rethrow（return undefined）
  [PASS] G1: 检查 _telemetryUrl
  [PASS] G2: 检查 navigator 环境
  [PASS] G3: 使用 sendBeacon 优先
  [PASS] G4: fallback 到 fetch
  [PASS] G5: 错误静默处理
  [PASS] G6: console.warn 输出
  [PASS] H1: 调用 _currentListener
  [PASS] H2: 卸载时清除 _installed
  [PASS] H3: 卸载时清除 _currentListener
  [PASS] H4: 卸载时清除 _telemetryUrl
  [PASS] I1: 返回 _installed 状态
--- summary: pass=43 fail=0 ---
```

---

## 回归测试（R2）

| Spec | 结果 |
|---|---|
| ai-guardrails | 39 PASS ✅ |
| ai-guardrails-deep | 38 PASS ✅ |
| server-import-completeness | 12 PASS ✅ |

**零回归确认**：3 个 spec 全部通过。

---

## R4: tileset-loaders.cjs

```
=== tileset-loaders ===
  [PASS] A1: 定义 SPLAT_QUALITY_PRESETS
  [PASS] A2: 导出 classifySplatQuality 函数
  [PASS] A3: 导出 loadGaussianSplatTileset 函数
  [PASS] A4: 导出 getSplatLODConfig 函数
  [PASS] A5: 导出 getRecommendedPreset 函数
  [PASS] A6: 导出 SPLAT_QUALITY_PRESETS 常量
  [PASS] A7: 导出默认对象
  [PASS] B1: SPLAT_QUALITY_PRESETS 含 5 个预设
  [PASS] B2: classifySplatQuality 检查 sse 类型
  [PASS] B3: classifySplatQuality 返回 unknown 当无效
  [PASS] B4: loadGaussianSplatTileset 检查 viewer
  [PASS] B5: loadGaussianSplatTileset 检查 assetId 类型
  [PASS] B6: getSplatLODConfig 检查 viewer._splatTileset
  [PASS] B7: getRecommendedPreset 默认 balanced
  [PASS] C1: 定义 KNOWN_GAUSSIAN_EXTS
  [PASS] C2: 定义 KNOWN_VECTOR_EXTS
  [PASS] C3: 定义 KNOWN_VOXEL_EXTS
  [PASS] C4: 导出 classifyTileset 函数
  [PASS] C5: 导出 chooseRenderMode 函数
  [PASS] C6: 导出 isFeatureSupported 函数
  [PASS] C7: 导出 isTileset2x 函数
  [PASS] C8: 导出 KNOWN_*_EXTS 常量
  [PASS] C9: 导出默认对象
  [PASS] D1: classifyTileset 检查输入类型
  [PASS] D2: classifyTileset 检查 root 或 asset 字段
  [PASS] D3: classifyTileset 检测 gltfUpAxis
  [PASS] D4: classifyTileset 检测 version 2.1
  [PASS] D5: classifyTileset 检测 Gaussian splat
  [PASS] D6: classifyTileset 检测 vector tiles
  [PASS] D7: classifyTileset 检测 voxel
  [PASS] D8: chooseRenderMode 优先级 hybrid > gaussian > vector > legacy
  [PASS] D9: isFeatureSupported 检查 feature 类型
  [PASS] D10: isFeatureSupported 检查 gaussian-splat
  [PASS] D11: isFeatureSupported 检查 vector-tiles
  [PASS] D12: isFeatureSupported 检查 voxel
  [PASS] D13: isTileset2x 检查 gltfVersion 2.1
  [PASS] E1: 1.x tileset (仅 root)
  [PASS] E2: 2.0 tileset (asset.gltfUpAxis)
  [PASS] E3: 2.1 tileset (asset.version)
  [PASS] E4: Gaussian splat tileset
  [PASS] E5: Vector tiles tileset
  [PASS] E6: 无效输入返回空对象
  [PASS] F1: 无 cls 返回 legacy
  [PASS] F2: 1.x 返回 legacy
  [PASS] F3: Gaussian splat 返回 gaussian-splat
  [PASS] F4: Vector tiles 返回 vector-tiles
  [PASS] F5: Hybrid 返回 hybrid
--- summary: pass=47 fail=0 ---
```

---

## 回归测试（R4）

| Spec | 结果 |
|---|---|
| ai-guardrails | 39 PASS ✅ |
| ai-guardrails-deep | 38 PASS ✅ |
| server-import-completeness | 12 PASS ✅ |

**零回归确认**：3 个 spec 全部通过。

---

## R3: sessionkeys-management.cjs

```
=== sessionkeys-management ===
  [PASS] A1: 导出 getAll 函数
  [PASS] A2: 导出 get 函数
  [PASS] A3: 导出 set 函数
  [PASS] A4: 导出 remove 函数
  [PASS] A5: 导出 clearAll 函数
  [PASS] A6: 导出 hasAny 函数
  [PASS] A7: 导出 maskKey 函数
  [PASS] B1: 定义 store 对象
  [PASS] B2: 定义 notify 函数
  [PASS] B3: notify 使用 dispatchEvent
  [PASS] B4: notify 使用 CustomEvent
  [PASS] C1: getAll 接受 opts 参数
  [PASS] C2: getAll 支持 withRemark 选项
  [PASS] C3: getAll 使用 Object.entries
  [PASS] C4: getAll 返回 platform 字段
  [PASS] C5: getAll 返回 apiKey 字段
  [PASS] C6: getAll 返回 baseUrl 字段
  [PASS] C7: getAll 返回 modelName 字段
  [PASS] C8: getAll 返回 savedAt 字段
  [PASS] C9: getAll 条件返回 remark 字段
  [PASS] D1: get 检查 store[platform]
  [PASS] D2: get 返回 null 当不存在
  [PASS] D3: get 返回包含 platform 的对象
  [PASS] E1: set 存储 apiKey
  [PASS] E2: set 存储 baseUrl（默认空字符串）
  [PASS] E3: set 存储 modelName（默认空字符串）
  [PASS] E4: set 存储 remark（默认空字符串）
  [PASS] E5: set 存储 savedAt（默认当前时间）
  [PASS] E6: set 调用 notify
  [PASS] F1: remove 检查 store[platform]
  [PASS] F2: remove 删除 store[platform]
  [PASS] F3: remove 调用 notify
  [PASS] G1: clearAll 遍历 store 键
  [PASS] G2: clearAll 删除每个键
  [PASS] G3: clearAll 调用 notify
  [PASS] H1: hasAny 检查 store 键数量
  [PASS] I1: maskKey 空值返回空字符串
  [PASS] I2: maskKey 短字符串（≤8）返回 ****
  [PASS] I3: maskKey 长字符串返回前4后4
  [PASS] J1: maskKey 空字符串返回空
  [PASS] J2: maskKey null 返回空
  [PASS] J3: maskKey 短字符串返回 ****
  [PASS] J4: maskKey 长字符串返回前4后4
  [PASS] J5: maskKey 边界值（9字符）
--- summary: pass=44 fail=0 ---
```

---

## 回归测试（R3）

| Spec | 结果 |
|---|---|
| ai-guardrails | 39 PASS ✅ |
| ai-guardrails-deep | 38 PASS ✅ |
| server-import-completeness | 12 PASS ✅ |

**零回归确认**：3 个 spec 全部通过。

---

## R4: tileset-loaders.cjs

```
=== tileset-loaders ===
  [PASS] A1: 定义 SPLAT_QUALITY_PRESETS
  [PASS] A2: 导出 classifySplatQuality 函数
  [PASS] A3: 导出 loadGaussianSplatTileset 函数
  [PASS] A4: 导出 getSplatLODConfig 函数
  [PASS] A5: 导出 getRecommendedPreset 函数
  [PASS] A6: 导出 SPLAT_QUALITY_PRESETS 常量
  [PASS] A7: 导出默认对象
  [PASS] B1: SPLAT_QUALITY_PRESETS 含 5 个预设
  [PASS] B2: classifySplatQuality 检查 sse 类型
  [PASS] B3: classifySplatQuality 返回 unknown 当无效
  [PASS] B4: loadGaussianSplatTileset 检查 viewer
  [PASS] B5: loadGaussianSplatTileset 检查 assetId 类型
  [PASS] B6: getSplatLODConfig 检查 viewer._splatTileset
  [PASS] B7: getRecommendedPreset 默认 balanced
  [PASS] C1: 定义 KNOWN_GAUSSIAN_EXTS
  [PASS] C2: 定义 KNOWN_VECTOR_EXTS
  [PASS] C3: 定义 KNOWN_VOXEL_EXTS
  [PASS] C4: 导出 classifyTileset 函数
  [PASS] C5: 导出 chooseRenderMode 函数
  [PASS] C6: 导出 isFeatureSupported 函数
  [PASS] C7: 导出 isTileset2x 函数
  [PASS] C8: 导出 KNOWN_*_EXTS 常量
  [PASS] C9: 导出默认对象
  [PASS] D1: classifyTileset 检查输入类型
  [PASS] D2: classifyTileset 检查 root 或 asset 字段
  [PASS] D3: classifyTileset 检测 gltfUpAxis
  [PASS] D4: classifyTileset 检测 version 2.1
  [PASS] D5: classifyTileset 检测 Gaussian splat
  [PASS] D6: classifyTileset 检测 vector tiles
  [PASS] D7: classifyTileset 检测 voxel
  [PASS] D8: chooseRenderMode 优先级 hybrid > gaussian > vector > legacy
  [PASS] D9: isFeatureSupported 检查 feature 类型
  [PASS] D10: isFeatureSupported 检查 gaussian-splat
  [PASS] D11: isFeatureSupported 检查 vector-tiles
  [PASS] D12: isFeatureSupported 检查 voxel
  [PASS] D13: isTileset2x 检查 gltfVersion 2.1
  [PASS] E1: 1.x tileset (仅 root)
  [PASS] E2: 2.0 tileset (asset.gltfUpAxis)
  [PASS] E3: 2.1 tileset (asset.version)
  [PASS] E4: Gaussian splat tileset
  [PASS] E5: Vector tiles tileset
  [PASS] E6: 无效输入返回空对象
  [PASS] F1: 无 cls 返回 legacy
  [PASS] F2: 1.x 返回 legacy
  [PASS] F3: Gaussian splat 返回 gaussian-splat
  [PASS] F4: Vector tiles 返回 vector-tiles
  [PASS] F5: Hybrid 返回 hybrid
--- summary: pass=47 fail=0 ---
```

---

## 回归测试（R4）

| Spec | 结果 |
|---|---|
| ai-guardrails | 39 PASS ✅ |
| ai-guardrails-deep | 38 PASS ✅ |
| server-import-completeness | 12 PASS ✅ |

**零回归确认**：3 个 spec 全部通过。
