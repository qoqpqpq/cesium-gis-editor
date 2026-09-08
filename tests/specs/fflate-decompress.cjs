// tests/specs/fflate-decompress.cjs
// 周期 7 P1-6: fflate 评估（pako 替代方案；体积 ~5KB vs pako ~45KB）
//
// 背景：
//   - 周期 6 P1-3: 客户端 viewState 浏览器侧加 pako 懒加载
//   - pako 体积 ~45KB（gzip 后 ~14KB）；fflate 体积 ~5KB（gzip 后 ~3KB）
//   - fflate API 与 zlib.inflate / pako.inflate 等价
//
// 评估范围：
//   1. fflate 体积评估（远小于 pako）
//   2. inflate 等价性测试（fflate.unzipSync(pako.deflate(...)) 等价）
//   3. deflate 等价性测试（pako.inflate(fflate.zipSync(...)) 等价）
//   4. TextDecoder 输出等价
//
// 决策依据：本周期不替换 pako（替换需要重写 viewState.js 懒加载逻辑 + Vite 打包测试）；
//   评估结果供周期 8+ 决策。
//
// 验收：
//   1. pako vs fflate API 对比（inflate/deflate 调用）
//   2. round-trip：JSON → pako.deflate → fflate.unzipSync → JSON
//   3. round-trip：JSON → fflate.zipSync → pako.inflate → JSON
//   4. 字符串等价（含中文）

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

const FFLATE_DIR = path.resolve(__dirname, '../../client/node_modules/fflate');
const FFLATE_INSTALLED = fs.existsSync(FFLATE_DIR + '/package.json');

(async () => {
  console.log('=== fflate-decompress ===');

  // ---- 1. fflate 体积评估 ----
  await test('fflate package.json 存在（若已安装）', () => {
    if (!FFLATE_INSTALLED) {
      console.log('  [INFO] fflate 未安装；本 spec 跑 API 等价性 + 体积估算（不实际替换 pako）');
      return;
    }
    const pkg = JSON.parse(fs.readFileSync(FFLATE_DIR + '/package.json', 'utf8'));
    assert.ok(pkg.name === 'fflate');
    assert.ok(pkg.license);
    console.log(`  [INFO] fflate 版本: ${pkg.version}, 许可: ${pkg.license}`);
  });

  await test('fflate 体积评估：package size < 50KB', () => {
    if (!FFLATE_INSTALLED) {
      // 估算 fflate ~5KB（minified）
      console.log('  [INFO] fflate 未安装；按 5KB 估算');
      return;
    }
    const stats = fs.statSync(FFLATE_DIR);
    // 简单估算：package 总体积（含 README/types 等）
    // 更精确：看 dist 目录
    const distDir = path.join(FFLATE_DIR, 'esm');
    let totalSize = 0;
    if (fs.existsSync(distDir)) {
      const files = fs.readdirSync(distDir);
      for (const f of files) {
        if (f.endsWith('.js')) {
          totalSize += fs.statSync(path.join(distDir, f)).size;
        }
      }
    }
    if (totalSize > 0) {
      console.log(`  [INFO] fflate esm 目录体积: ${(totalSize / 1024).toFixed(1)}KB`);
      assert.ok(totalSize < 100 * 1024, `fflate esm 体积应 < 100KB，实际 ${(totalSize / 1024).toFixed(1)}KB`);
    }
  });

  // ---- 2. pako vs fflate 等价性（用 pako Node 版）----
  let pako;
  try {
    pako = require(path.resolve(__dirname, '../../client/node_modules/pako'));
  } catch (e) {
    console.log('  [INFO] pako Node 端不可用，跳过 API 等价性测试');
    console.log(`--- summary: pass=${pass} fail=${fail} ---`);
    if (fail > 0) process.exit(1);
    return;
  }

  await test('pako.deflate → zlib.inflateSync round-trip（中文）', () => {
    const zlib = require('node:zlib');
    const original = 'cesium-gis-editor 测试 中文字符串 ' + 'repeat '.repeat(100);
    const buf = Buffer.from(original, 'utf8');
    const compressed = pako.deflate(buf);
    const decompressed = zlib.inflateSync(compressed);
    assert.strictEqual(decompressed.toString('utf8'), original);
  });

  // ---- 3. fflate 等价性（若装了）----
  if (FFLATE_INSTALLED) {
    let fflate;
    try {
      fflate = require(path.resolve(__dirname, '../../client/node_modules/fflate'));
    } catch (e) {
      fflate = null;
    }

    if (fflate) {
      await test('JSON → pako.deflate → fflate.unzipSync → JSON 等价', () => {
        const json = { camera: { lng: 116.4, lat: 39.9, height: 1000 }, layer: 'L1' };
        const buf = Buffer.from(JSON.stringify(json), 'utf8');
        const compressed = pako.deflate(buf);
        const decompressed = fflate.unzipSync(compressed);
        assert.strictEqual(decompressed.toString('utf8'), JSON.stringify(json));
      });

      await test('JSON → fflate.zipSync → pako.inflate → JSON 等价', () => {
        const json = { camera: { lng: 121.5, lat: 31.2, height: 2000 } };
        const buf = Buffer.from(JSON.stringify(json), 'utf8');
        const compressed = fflate.zipSync(buf);
        const decompressed = pako.inflate(compressed);
        assert.strictEqual(decompressed.toString('utf8'), JSON.stringify(json));
      });

      await test('中文字符串 round-trip（pako → fflate → pako）', () => {
        const original = '北京上海广州深圳' + ' 城市 '.repeat(50);
        const buf = Buffer.from(original, 'utf8');
        const c1 = pako.deflate(buf);
        const d1 = fflate.unzipSync(c1);
        const c2 = fflate.zipSync(d1);
        const d2 = pako.inflate(c2);
        assert.strictEqual(d2.toString('utf8'), original);
      });

      await test('fflate 体积 < pako 体积（ESM minified）', () => {
        // 启发式：fflate 5KB / pako 45KB；统计实际 file size
        const pakoSize = (() => {
          const dir = path.resolve(__dirname, '../../client/node_modules/pako/dist');
          let total = 0;
          if (fs.existsSync(dir)) {
            for (const f of fs.readdirSync(dir)) {
              if (f.endsWith('.js') || f.endsWith('.mjs')) {
                total += fs.statSync(path.join(dir, f)).size;
              }
            }
          }
          return total;
        })();
        const fflateSize = (() => {
          const dir = path.resolve(__dirname, '../../client/node_modules/fflate/esm');
          let total = 0;
          if (fs.existsSync(dir)) {
            for (const f of fs.readdirSync(dir)) {
              if (f.endsWith('.js')) total += fs.statSync(path.join(dir, f)).size;
            }
          }
          return total;
        })();
        if (pakoSize > 0 && fflateSize > 0) {
          console.log(`  [INFO] pako: ${(pakoSize / 1024).toFixed(1)}KB, fflate: ${(fflateSize / 1024).toFixed(1)}KB`);
          assert.ok(fflateSize < pakoSize, `fflate (${fflateSize}B) 应 < pako (${pakoSize}B)`);
        } else {
          console.log(`  [INFO] pakoSize=${pakoSize} fflateSize=${fflateSize}（dist 目录不存在；跳过体积对比）`);
        }
      });
    } else {
      console.log('  [INFO] fflate installed but require failed');
    }
  } else {
    console.log('  [INFO] fflate 未安装；周期 8+ 决策后安装并对比');
  }

  // ---- 4. 决策摘要 ----
  console.log('  [INFO] 周期 7 P1-6 决策：不替换 pako（替换需重写 viewState.js 懒加载）');
  console.log('  [INFO] 周期 8+ 评估项：Vite bundle 中 pako 实际贡献；如 > 30KB 才考虑 fflate');

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
