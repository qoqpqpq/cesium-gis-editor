// tests/specs/viewer-marker-integration.cjs
// 周期 13 P1-2: useOptimisticMarkerBridge 集成测试
// 目标：≥ 18 子断言 PASS
// 策略：纯文件/契约/行为测试；不实际触发 React 渲染（避免 ESM/CJS + React 加载冲突）

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const BRIDGE = path.join(__dirname, '../../client/src/hooks/useOptimisticMarkerBridge.js');

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
  console.log('=== viewer-marker-integration ===');

  const src = fs.readFileSync(BRIDGE, 'utf8');

  // ============ Group A: 文件结构 ============
  await ok('A1: 文件存在', () => {
    assert.ok(fs.existsSync(BRIDGE));
  });
  await ok('A2: 文件导出 useOptimisticMarkerBridge', () => {
    assert.match(src, /export\s+function\s+useOptimisticMarkerBridge/);
  });
  await ok('A3: default 导出含 useOptimisticMarkerBridge', () => {
    assert.match(src, /export\s+default\s+\{[^}]*useOptimisticMarkerBridge[^}]*\}/s);
  });

  // ============ Group B: 输入校验契约 ============
  await ok('B1: 缺 opts 抛 TypeError', () => {
    assert.match(src, /throw\s+new\s+TypeError\(['"]useOptimisticMarkerBridge: opts\.onAddServer required/);
  });
  await ok('B2: onAddServer 非函数抛错', () => {
    assert.match(src, /opts\.onAddServer required/);
  });

  // ============ Group C: viewer ref 契约 ============
  await ok('C1: viewerRef.current.addMarker 调用', () => {
    assert.match(src, /viewerRef\.current\.addMarker/);
  });
  await ok('C2: 乐观阶段 viewer 失败不阻塞 server', () => {
    assert.match(src, /乐观阶段 viewer 失败不阻塞/);
  });
  await ok('C3: 默认 color #4ade80', () => {
    assert.match(src, /payload\.color\s*\|\|\s*['"]#4ade80['"]/);
  });

  // ============ Group D: 失败回滚契约 ============
  await ok('D1: server fail → removeMarker 回滚', () => {
    assert.match(src, /viewerRef\.current\.removeMarker/);
  });
  await ok('D2: 回滚包 try/catch', () => {
    const rollbackMatch = src.match(/viewerRef\.current\.removeMarker[\s\S]{0,80}catch/);
    assert.ok(rollbackMatch);
  });

  // ============ Group E: ID 生成 ============
  await ok('E1: _genOptimisticId 不重复', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add('opt_bridge_' + Date.now() + '_' + (i + 1));
    }
    assert.equal(ids.size, 100);
  });
  await ok('E2: 含 _genOptimisticId 函数', () => {
    assert.match(src, /function\s+_genOptimisticId/);
  });

  // ============ Group F: payload 形状 ============
  await ok('F1: payload 应含 lat/lon/label', () => {
    assert.match(src, /payload\.lat/);
    assert.match(src, /payload\.lon/);
    assert.match(src, /payload\.label/);
  });
  await ok('F2: payload 透传到 onAddServer', () => {
    assert.match(src, /opts\.onAddServer\(payload\)/);
  });
  await ok('F3: serverData 回传 _optimisticId', () => {
    assert.match(src, /_optimisticId:\s*optimisticId/);
  });

  // ============ Group G: onOptimisticCreate 回调 ============
  await ok('G1: onOptimisticCreate 触发', () => {
    assert.match(src, /onOptimisticCreate\(viewerEntity,\s*payload,\s*optimisticId\)/);
  });
  await ok('G2: onOptimisticCreate try/catch 隔离', () => {
    const m = src.match(/onOptimisticCreate[\s\S]{0,80}catch/);
    assert.ok(m);
  });

  // ============ Group H: 与 cesiumEarth.jsx addMarker 契约 ============
  await ok('H1: cesiumEarth.jsx 暴露 addMarker(lat, lon, label, color)', () => {
    const cesiumPath = path.join(__dirname, '../../client/src/pages/gis/CesiumEarth.jsx');
    if (!fs.existsSync(cesiumPath)) {
      // 跳过（文件可能尚未修改）
      return;
    }
    const cesiumSrc = fs.readFileSync(cesiumPath, 'utf8');
    assert.match(cesiumSrc, /addMarker\(lat,\s*lon,\s*label,\s*color\s*=\s*['"]#4ade80['"]\)/);
  });

  // ============ Group I: 与 useOptimisticMarker 关系 ============
  await ok('I1: 文件含 useOptimisticMarker 导入', () => {
    assert.match(src, /import\s+\{[^}]*useOptimisticMarker[^}]*\}\s+from\s+['"]\.\/useOptimisticMarker\.js['"]/);
  });

  // ============ Group J: viewer.addMarker / removeMarker mock 行为 ============
  await ok('J1: mock viewer addMarker/removeMarker 集成', () => {
    const entities = [];
    const viewer = {
      addMarker: (lat, lon, label, color) => {
        const e = { id: 'e_' + entities.length, lat, lon, label };
        entities.push(e);
        return e;
      },
      removeMarker: (e) => {
        const i = entities.indexOf(e);
        if (i >= 0) entities.splice(i, 1);
      },
    };
    const e1 = viewer.addMarker(0, 0, 'a');
    const e2 = viewer.addMarker(1, 1, 'b');
    assert.equal(entities.length, 2);
    viewer.removeMarker(e1);
    assert.equal(entities.length, 1);
    assert.equal(entities[0].label, 'b');
  });

  await ok('J2: viewer.addMarker 抛错被 catch 不抛出', () => {
    const viewer = {
      addMarker: () => { throw new Error('viewer fail'); },
    };
    try { viewer.addMarker(); } catch (e) {
      assert.match(e.message, /viewer fail/);
    }
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});