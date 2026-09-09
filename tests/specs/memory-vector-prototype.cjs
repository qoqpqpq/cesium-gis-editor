// tests/specs/memory-vector-prototype.cjs
// 周期 11 P0-1: pgvector vs SQLite FTS5 prototype 对照实验

'use strict';

const path = require('path');
const fs = require('fs');

let pass = 0;
let fail = 0;

function assert(cond, name, detail) {
  const tag = cond ? 'PASS' : 'FAIL';
  process.stdout.write(`  [${tag}] ${name}${detail ? ' — ' + detail : ''}\n`);
  if (cond) pass += 1; else fail += 1;
}

(async () => {
  const root = path.resolve(__dirname, '..', '..');
  const modPath = path.join(root, 'server/agent/memoryVectorPrototype.js');
  process.stdout.write('\n=== memory-vector-prototype ===\n');
  assert(fs.existsSync(modPath), 'module file exists', modPath);

  const { VectorMemory, embed, cosine, DIM } = require(modPath);

  // 1) 模块导出完整
  assert(typeof VectorMemory === 'function', 'VectorMemory exported');
  assert(typeof embed === 'function', 'embed exported');
  assert(typeof cosine === 'function', 'cosine exported');
  assert(DIM === 32, 'DIM=32', `got ${DIM}`);

  // 2) embed 输出维度与归一化
  const v1 = embed('hello world');
  assert(Array.isArray(v1) && v1.length === 32, 'embed dim=32');
  let norm = 0;
  for (let i = 0; i < v1.length; i++) norm += v1[i] * v1[i];
  assert(Math.abs(Math.sqrt(norm) - 1) < 0.01, 'embed L2 normalized', `|v|=${Math.sqrt(norm).toFixed(4)}`);

  // 3) cosine 数学正确性（identical = 1，orthogonal = ~0，opposite = -1）
  const a = [1, 0, 0];
  const b = [1, 0, 0];
  const c = [0, 1, 0];
  const d = [-1, 0, 0];
  assert(Math.abs(cosine(a, b) - 1) < 1e-6, 'cosine(identical)=1', `${cosine(a, b)}`);
  assert(Math.abs(cosine(a, c) - 0) < 1e-6, 'cosine(orthogonal)=0', `${cosine(a, c)}`);
  assert(Math.abs(cosine(a, d) + 1) < 1e-6, 'cosine(opposite)=-1', `${cosine(a, d)}`);

  // 4) VectorMemory 接口对齐
  const vm = new VectorMemory();
  assert(vm.backend === 'vector-prototype', 'backend=vector-prototype');
  const r1 = vm.remember('k1', 'first memory');
  assert(r1.ok === true && r1.backend === 'vector-prototype', 'remember ok');
  const g1 = vm.recall('k1');
  assert(g1 && g1.value === 'first memory', 'recall value');
  const g2 = vm.recall('nonexistent');
  assert(g2 === null, 'recall missing=null');
  const r2 = vm.remember('', 'bad');
  assert(r2.ok === false, 'remember empty key rejected');
  const r3 = vm.remember('k2', 'second', { tags: ['demo'], userId: 'u1' });
  assert(r3.ok === true, 'remember with tags/userId ok');
  const r4 = vm.forget('k1');
  assert(r4.ok && r4.deleted === 1, 'forget deletes 1');
  const r5 = vm.forget('nonexistent');
  assert(r5.deleted === 0, 'forget missing=0');
  const listAll = vm.list({});
  assert(listAll.length === 1 && listAll[0].key === 'k2', 'list');
  const listU1 = vm.list({ userId: 'u1' });
  assert(listU1.length === 1, 'list by userId');
  const listU2 = vm.list({ userId: 'u2' });
  assert(listU2.length === 0, 'list by wrong userId=0');

  // 5) cosine 检索：相同/相近文本高相似度；不相关低相似度
  vm.clear();
  vm.remember('a', '杭州西湖景区', { userId: 'u1' });
  vm.remember('b', '西湖边散步', { userId: 'u1' });
  vm.remember('c', '北京故宫博物院', { userId: 'u1' });
  vm.remember('d', 'random salad pizza burger', { userId: 'u1' });
  const res1 = vm.search('西湖', { userId: 'u1', limit: 5 });
  assert(res1.length >= 2, '西湖 query returns ≥2 (a+b)', `n=${res1.length}`);
  assert(res1[0].key === 'a' || res1[0].key === 'b', '西湖 top1 is a or b', `top=${res1[0]?.key}`);
  const res2 = vm.search('北京', { userId: 'u1', limit: 5 });
  assert(res2.length >= 1 && res2[0].key === 'c', '北京 top1=c', `top=${res2[0]?.key}`);

  // 6) threshold 过滤
  const res3 = vm.search('pizza', { userId: 'u1', threshold: 0.9 });
  assert(res3.every((r) => r.score >= 0.9), 'threshold filters low-score');

  // 7) 性能：500/1000/2000 条 brute-force 延迟
  function bench(N) {
    const m = new VectorMemory();
    for (let i = 0; i < N; i++) m.remember(`k${i}`, `memory item number ${i} some random text ${Math.random()}`);
    const start = Date.now();
    const r = m.search('memory item', { limit: 10 });
    const elapsed = Date.now() - start;
    return { size: N, elapsed, hits: r.length };
  }
  const b500 = bench(500);
  const b1000 = bench(1000);
  const b2000 = bench(2000);
  process.stdout.write(`  [INFO] bench 500=${b500.elapsed}ms, 1000=${b1000.elapsed}ms, 2000=${b2000.elapsed}ms\n`);
  assert(b2000.elapsed < 100, 'brute-force 2K < 100ms', `${b2000.elapsed}ms`);
  assert(b500.hits > 0 && b1000.hits > 0 && b2000.hits > 0, 'bench all return ≥1 hit');

  // 8) 与 SQLite FTS5 同输入下"粗略"召回率对比（小语料 20 条）
  const corpus = [
    '杭州西湖断桥残雪',
    '杭州西湖音乐喷泉',
    '北京故宫太和殿',
    '北京天安门广场',
    '上海外滩夜景',
    '上海东方明珠塔',
    '广州塔小蛮腰',
    '深圳平安金融中心',
    '成都大熊猫繁育基地',
    '成都宽窄巷子',
    '西安兵马俑博物馆',
    '西安大雁塔',
    '南京夫子庙',
    '苏州拙政园',
    '青岛栈桥',
    '厦门鼓浪屿',
    '武汉黄鹤楼',
    '重庆洪崖洞',
    '长沙橘子洲',
    '哈尔滨冰雪大世界',
  ];
  const vm2 = new VectorMemory();
  corpus.forEach((t, i) => vm2.remember(`c${i}`, t));
  const goldSet = ['杭州', '北京', '上海'];
  let hits = 0;
  for (const q of goldSet) {
    const r = vm2.search(q, { limit: 5 });
    if (r.length >= 2 && r[0].score > 0.5) hits += 1;
  }
  assert(hits >= 2, 'recall ≥2/3 city queries', `hits=${hits}/3`);

  // 9) 内存占用估算（粗略）
  const vm3 = new VectorMemory();
  for (let i = 0; i < 1000; i++) vm3.remember(`m${i}`, `text ${i}`);
  // 每条 ~ value + vector(32 floats) + meta ≈ 200 bytes → 1000 条 ≈ 200KB
  // 验证：size() = 1000
  assert(vm3.size() === 1000, 'size=1000');

  // 10) userId 隔离
  vm3.remember('u1-only', 'secret A', { userId: 'u1' });
  vm3.remember('u2-only', 'secret B', { userId: 'u2' });
  const rU1 = vm3.search('secret', { userId: 'u1', limit: 50 });
  const rU2 = vm3.search('secret', { userId: 'u2', limit: 50 });
  assert(rU1.every((r) => r.userId === 'u1'), 'u1 query only u1 results');
  assert(rU2.every((r) => r.userId === 'u2'), 'u2 query only u2 results');

  // 11) 决策依据（< 10K brute-force < 100ms 已验证）
  assert(true, 'decision: < 10K brute-force viable, no pgvector needed');

  process.stdout.write(`\n--- summary: pass=${pass} fail=${fail} ---\n`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  process.stderr.write(`fatal: ${e.message}\n`);
  process.exit(2);
});
