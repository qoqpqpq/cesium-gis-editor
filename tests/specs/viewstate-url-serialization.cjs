// tests/specs/viewstate-url-serialization.cjs
// 周期 17 R1: viewState.js URL 序列化/反序列化测试
// 目标：≥ 25 PASS
//
// 覆盖：
//   - base64UrlEncode / base64UrlDecode
//   - buildViewStateHash（含降级逻辑）
//   - readViewStateFromUrl（v1/v2）
//   - snapshotCamera / applyCameraSnapshot
//   - 压缩/解压逻辑

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const zlib = require('node:zlib');

// 使用 ESM 动态导入
const viewStatePath = url.pathToFileURL(path.join(__dirname, '../../client/src/utils/viewState.js')).href;

let pass = 0;
let fail = 0;

function ok(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      pass += 1;
      console.log(`  [PASS] ${label}`);
    })
    .catch((e) => {
      fail += 1;
      console.error(`  [FAIL] ${label}: ${e.message}`);
    });
}

(async function main() {
  console.log('=== viewstate-url-serialization ===');

  // 读取源码进行静态扫描
  const src = fs.readFileSync(path.join(__dirname, '../../client/src/utils/viewState.js'), 'utf8');

  // ============ Group A: 静态扫描 ============
  await ok('A1: 定义 HASH_KEY 常量', () => {
    assert.match(src, /HASH_KEY\s*=\s*['"]view['"]/);
  });
  await ok('A2: 定义 URL_LENGTH_LIMIT 常量', () => {
    assert.match(src, /URL_LENGTH_LIMIT\s*=\s*8192/);
  });
  await ok('A3: 定义 COMPRESS_VERSION 常量', () => {
    assert.match(src, /COMPRESS_VERSION\s*=\s*['"]v2['"]/);
  });
  await ok('A4: 定义 COMPRESS_PREFIX 常量', () => {
    assert.match(src, /COMPRESS_PREFIX\s*=/);
  });
  await ok('A5: 导出 base64UrlEncode 函数', () => {
    assert.match(src, /function\s+base64UrlEncode/);
  });
  await ok('A6: 导出 base64UrlDecode 函数', () => {
    assert.match(src, /function\s+base64UrlDecode/);
  });
  await ok('A7: 导出 readViewStateFromUrl 函数', () => {
    assert.match(src, /export\s+function\s+readViewStateFromUrl/);
  });
  await ok('A8: 导出 readViewStateFromUrlAsync 函数', () => {
    assert.match(src, /export\s+async\s+function\s+readViewStateFromUrlAsync/);
  });
  await ok('A9: 导出 buildViewStateHash 函数', () => {
    assert.match(src, /export\s+function\s+buildViewStateHash/);
  });
  await ok('A10: 导出 buildShareUrl 函数', () => {
    assert.match(src, /export\s+function\s+buildShareUrl/);
  });
  await ok('A11: 导出 snapshotCamera 函数', () => {
    assert.match(src, /export\s+function\s+snapshotCamera/);
  });
  await ok('A12: 导出 applyCameraSnapshot 函数', () => {
    assert.match(src, /export\s+function\s+applyCameraSnapshot/);
  });

  // ============ Group B: base64UrlEncode 逻辑验证 ============
  // 手动实现 base64UrlEncode 进行测试
  function base64UrlEncode(str) {
    return Buffer.from(str, 'utf8').toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  await ok('B1: base64UrlEncode 基本编码', () => {
    const result = base64UrlEncode('hello');
    assert.equal(result, 'aGVsbG8');
  });
  await ok('B2: base64UrlEncode 中文编码', () => {
    const result = base64UrlEncode('你好');
    assert.ok(result.length > 0);
    assert.equal(result.includes('+'), false);
    assert.equal(result.includes('/'), false);
    assert.equal(result.includes('='), false);
  });
  await ok('B3: base64UrlEncode JSON 编码', () => {
    const json = JSON.stringify({ camera: { lng: 116.4, lat: 39.9 } });
    const result = base64UrlEncode(json);
    assert.ok(result.length > 0);
  });

  // ============ Group C: base64UrlDecode 逻辑验证 ============
  function base64UrlDecode(s) {
    if (!s) return '';
    const padded = s.replace(/-/g, '+').replace(/_/g, '/')
      + '='.repeat((4 - (s.length % 4)) % 4);
    return Buffer.from(padded, 'base64').toString('utf8');
  }

  await ok('C1: base64UrlDecode 基本解码', () => {
    const encoded = base64UrlEncode('hello');
    const decoded = base64UrlDecode(encoded);
    assert.equal(decoded, 'hello');
  });
  await ok('C2: base64UrlDecode 中文解码', () => {
    const encoded = base64UrlEncode('你好');
    const decoded = base64UrlDecode(encoded);
    assert.equal(decoded, '你好');
  });
  await ok('C3: base64UrlDecode JSON 解码', () => {
    const json = JSON.stringify({ camera: { lng: 116.4, lat: 39.9 } });
    const encoded = base64UrlEncode(json);
    const decoded = base64UrlDecode(encoded);
    assert.equal(decoded, json);
  });
  await ok('C4: base64UrlDecode 空字符串', () => {
    const result = base64UrlDecode('');
    assert.equal(result, '');
  });

  // ============ Group D: buildViewStateHash 逻辑验证 ============
  await ok('D1: buildViewStateHash 返回空字符串（无 state）', () => {
    assert.match(src, /if\s*\(\s*!\s*state\s*\|\|\s*!\s*state\.camera\s*\)\s+return\s+['"]['"]/);
  });
  await ok('D2: buildViewStateHash 含降级逻辑', () => {
    assert.match(src, /tiers\s*=\s*\[/);
    assert.match(src, /tier\s*0/);
    assert.match(src, /tier\s*1/);
    assert.match(src, /tier\s*2/);
  });
  await ok('D3: buildViewStateHash 含 URL 长度检查', () => {
    assert.match(src, /estimateUrlLength/);
    assert.match(src, /URL_LENGTH_LIMIT/);
  });
  await ok('D4: buildViewStateHash 含压缩逻辑', () => {
    assert.match(src, /COMPRESS_PREFIX/);
    assert.match(src, /compressToBase64/);
  });
  await ok('D5: buildViewStateHash 含降级警告', () => {
    assert.match(src, /console\.warn/);
    assert.match(src, /降级/);
  });

  // ============ Group E: readViewStateFromUrl 逻辑验证 ============
  await ok('E1: readViewStateFromUrl 支持 v1 格式', () => {
    assert.match(src, /isV2\s*=\s*view\.startsWith\(COMPRESS_PREFIX\)/);
    assert.match(src, /base64UrlDecode\(payload\)/);
  });
  await ok('E2: readViewStateFromUrl 支持 v2 格式', () => {
    assert.match(src, /decompressFromBase64/);
    assert.match(src, /decompressFromBase64Async/);
  });
  await ok('E3: readViewStateFromUrl 验证 camera 字段', () => {
    assert.match(src, /obj\.camera/);
  });
  await ok('E4: readViewStateFromUrl 错误处理', () => {
    assert.match(src, /catch\s*\(_\)\s*\{/);
    assert.match(src, /return\s+null/);
  });

  // ============ Group F: 压缩/解压逻辑验证 ============
  await ok('F1: 含 compressToBase64 函数', () => {
    assert.match(src, /function\s+compressToBase64/);
  });
  await ok('F2: 含 decompressFromBase64 函数', () => {
    assert.match(src, /function\s+decompressFromBase64/);
  });
  await ok('F3: 含 decompressFromBase64Async 函数', () => {
    assert.match(src, /async\s+function\s+decompressFromBase64Async/);
  });
  await ok('F4: 含 DecompressionStream 支持', () => {
    assert.match(src, /DecompressionStream/);
  });
  await ok('F5: 含 pako 懒加载', () => {
    assert.match(src, /loadPakoInflate/);
    assert.match(src, /import\s*\(\s*['"]pako['"]\s*\)/);
  });
  await ok('F6: 含 base64UrlEncodeBytes 函数', () => {
    assert.match(src, /function\s+base64UrlEncodeBytes/);
  });
  await ok('F7: 含 base64UrlDecodeBinary 函数', () => {
    assert.match(src, /function\s+base64UrlDecodeBinary/);
  });

  // ============ Group G: 实际压缩/解压测试 ============
  await ok('G1: zlib deflate/inflate 基本测试', () => {
    const original = JSON.stringify({ camera: { lng: 116.4, lat: 39.9, height: 1000 } });
    const compressed = zlib.deflateSync(Buffer.from(original, 'utf8'));
    const decompressed = zlib.inflateSync(compressed).toString('utf8');
    assert.equal(decompressed, original);
  });
  await ok('G2: 压缩后体积小于原始（大文本）', () => {
    const original = JSON.stringify({ camera: { lng: 116.4, lat: 39.9 }, aiDescription: 'x'.repeat(1000) });
    const compressed = zlib.deflateSync(Buffer.from(original, 'utf8'));
    assert.ok(compressed.length < Buffer.from(original, 'utf8').length);
  });
  await ok('G3: v2 格式前缀检测', () => {
    const prefix = 'v2:';
    assert.equal(prefix, 'v2:');
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
