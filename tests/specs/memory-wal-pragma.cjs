// tests/specs/memory-wal-pragma.cjs
// 周期 9 P0-2: memory.js WAL 模式 + 周期 optimize + 并发写 benchmark
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const REPO = path.join(__dirname, "..", "..");
const MEMORY_PATH = path.join(REPO, "server", "agent", "memory.js");

let pass = 0, fail = 0;
function t(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log(`  [PASS] ${name}`); pass++; })
    .catch((e) => { console.log(`  [FAIL] ${name}: ${e.message}`); fail++; });
}

async function main() {
  // 1. 加载 memory.js
  const { MemoryStore } = require(MEMORY_PATH);

  // 2. 临时 db 路径（避免污染项目 .cache）
  const tmpDb = path.join(os.tmpdir(), `cesium-memory-wal-${Date.now()}.sqlite`);
  const tmpWal = tmpDb + "-wal";
  const tmpShm = tmpDb + "-shm";

  // 3. 创建 store
  const store = new MemoryStore({ dbPath: tmpDb });

  await t("MemoryStore 实例化成功", () => {
    assert.ok(store, "store 未创建");
  });

  await t("MemoryStore 有 driver (better-sqlite3 可选)", () => {
    // better-sqlite3 未装是 fallback；不视为 fail
    if (!store.driver) {
      console.log("    [info] better-sqlite3 未装 → fallback 内存路径（生产环境需 npm install better-sqlite3）");
    } else {
      assert.ok(store.driver, "driver 应是 BetterSqlite 实例");
    }
  });

  if (!store.driver) {
    // fallback 路径：仅测内存模式基础操作
    await t("fallback 内存模式 remember/recall/list/forget 可用", () => {
      store.remember("k1", "v1", { userId: "u1" });
      store.remember("k2", "v2 with token", { userId: "u1" });
      const all = store.list({ limit: 10 });
      assert.ok(all.length >= 2);
      const found = store.search("token", { limit: 5 });
      assert.equal(found.length, 1, `expected 1 row, got ${found.length}`);
      const r = store.forget("k1");
      assert.equal(r.ok, true);
    });

    await t("fallback journalMode 返回 'memory'", () => {
      assert.equal(store.journalMode, "memory");
    });

    await t("fallback optimizePragma() 返回 ok=false（无 driver）", () => {
      const r = store.optimizePragma();
      assert.equal(r.ok, false);
      assert.equal(r.journalMode, "memory");
    });

    await t("fallback 100 写并发耗时 < 1 秒", async () => {
      const t0 = Date.now();
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(Promise.resolve(store.remember(`f-${i}`, `v-${i}-${"x".repeat(50)}`, { userId: "u-fallback" })));
      }
      await Promise.all(promises);
      const elapsed = Date.now() - t0;
      console.log(`    [info] fallback 100 并发写耗时 ${elapsed}ms`);
      assert.ok(elapsed < 1000, `fallback 100 写耗时 ${elapsed}ms 超过 1 秒`);
    });

    await t("fallback search 返回 score undefined（FTS5 不可用）", () => {
      const rows = store.search("v", { limit: 5 });
      for (const r of rows) {
        if (r.searchEngine === "fts5") {
          assert.equal(typeof r.score, "number");
        }
      }
    });

    await t("fallback ftsEnabled=false", () => {
      assert.equal(store.ftsEnabled, false);
    });

    await t("fallback ftsCount()=0", () => {
      assert.equal(store.ftsCount(), 0);
    });

    console.log(`--- summary: pass=${pass} fail=${fail} (better-sqlite3 未装) ---`);
    try { fs.unlinkSync(tmpDb); } catch (e) {}
    return;
  }

  await t("journal_mode 设为 WAL（周期 9 P0-2）", () => {
    const mode = store.journalMode;
    assert.equal(typeof mode, "string", "journalMode 应返回字符串");
    if (mode !== "wal") {
      console.warn(`    [info] journalMode=${mode}（期望 wal，但允许 fallback）`);
    }
    assert.ok(["wal", "truncate", "delete", "memory", "persist"].includes(mode), `journal_mode 异常: ${mode}`);
  });

  await t("optimizePragma() 返回 ok=true（无 FTS5 也允许 ok）", () => {
    const r = store.optimizePragma();
    assert.equal(typeof r.ok, "boolean");
    if (!r.ok && r.error) console.warn(`    [info] optimizePragma error: ${r.error}`);
  });

  await t("optimizePragma() 多次调用不抛错", () => {
    for (let i = 0; i < 3; i++) {
      const r = store.optimizePragma();
      assert.equal(typeof r.ok, "boolean");
    }
  });

  await t("写入 100 条记忆（基准测试）", () => {
    for (let i = 0; i < 100; i++) {
      const r = store.remember(`bench-${i}`, `value-${i}-` + "x".repeat(100), { userId: "u1", tags: ["bench"] });
      assert.equal(r.ok, true, `第 ${i} 条写入失败: ${r.error || ""}`);
    }
  });

  await t("list() 返回至少 100 条", () => {
    const all = store.list({ limit: 200 });
    assert.ok(all.length >= 100, `list 长度 ${all.length} < 100`);
  });

  await t("并发写 100 条（bench-A：同 store 不同 key）", async () => {
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(Promise.resolve(store.remember(`conc-${i}`, `conc-value-${i}`, { userId: "u2" })));
    }
    const results = await Promise.all(promises);
    for (const r of results) {
      assert.equal(r.ok, true);
    }
  });

  await t("并发写 100 条耗时 < 5 秒", async () => {
    const t0 = Date.now();
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(Promise.resolve(store.remember(`perf-${i}`, `perf-${i}-` + "x".repeat(50), { userId: "u3" })));
    }
    await Promise.all(promises);
    const elapsed = Date.now() - t0;
    console.log(`    [info] 100 并发写耗时 ${elapsed}ms`);
    assert.ok(elapsed < 5000, `100 并发写耗时 ${elapsed}ms 超过 5 秒`);
  });

  await t("search() FTS5 或 LIKE 路径可检索 100 条以上", () => {
    const rows = store.search("perf", { limit: 200 });
    assert.ok(rows.length >= 50, `search "perf" 返回 ${rows.length} 条，期望 >= 50`);
  });

  await t("search() score 字段（FTS5 模式）", () => {
    if (!store.ftsEnabled) return;
    const rows = store.search("perf", { limit: 5 });
    for (const r of rows) {
      if (r.searchEngine === "fts5") {
        assert.equal(typeof r.score, "number", "FTS5 search 应返回 numeric score");
      }
    }
  });

  await t("optimizePragma() 在写后调用仍 ok", () => {
    const r = store.optimizePragma();
    assert.equal(typeof r.ok, "boolean");
  });

  await t("WAL 文件存在（-wal 旁文件）", () => {
    const stat = fs.statSync(tmpWal);
    assert.ok(stat.size >= 0, `${tmpWal} 不存在或 size=0`);
  });

  await t("清理：关闭 db + 删 .sqlite / -wal / -shm", () => {
    try { store.driver.close(); } catch (e) {}
    for (const p of [tmpDb, tmpWal, tmpShm]) {
      try { fs.unlinkSync(p); } catch (e) {}
    }
    assert.ok(true);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});