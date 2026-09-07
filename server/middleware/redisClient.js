// server/middleware/redisClient.js
// 周期 4 P0-2: 极简 Redis 客户端（手写 RESP 协议，零依赖）
//
// 背景：
//   - 周期 3 P2-2 抽 RateLimiterStore 接口 + RedisStore stub（不真连 Redis）
//   - 周期 4 升级为真实 Redis 实现：手写 RESP 协议 + Sliding Window
//   - 不引入 ioredis / redis 依赖（避免新增部署面）
//   - 仅支持周期 4 实际用到的命令：PING / ZADD / ZREMRANGEBYSCORE / ZCARD / DEL / EXPIRE
//
// RESP 协议：https://redis.io/docs/latest/develop/reference/protocol-spec/
//   - 命令：RESP 数组（*N\r\n$N\r\narg\r\n...）
//   - 简单字符串：+OK\r\n
//   - 错误：-Error message\r\n
//   - 整数：:123\r\n
//   - bulk string：$6\r\nfoobar\r\n（空为 $-1\r\n）
//   - 数组：*N\r\n...（空为 *-1\r\n）

'use strict';

const net = require('node:net');
const { EventEmitter } = require('node:events');

class RedisClient extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.host = opts.host || process.env.REDIS_HOST || '127.0.0.1';
    this.port = opts.port || parseInt(process.env.REDIS_PORT || '6379', 10);
    this.password = opts.password || process.env.REDIS_PASSWORD || null;
    this.db = parseInt(opts.db || process.env.REDIS_DB || '0', 10);
    this.socket = null;
    this.connected = false;
    this._connectPromise = null;
    this._buffer = Buffer.alloc(0);
    this._cmdQueue = []; // FIFO: {resolve, reject, parts}
    this._inAuth = false;
    this._closed = false;
  }

  /**
   * 连接到 Redis（懒连接，首次命令时自动连）
   */
  async connect() {
    if (this.connected) return;
    if (this._connectPromise) return this._connectPromise;
    this._connectPromise = new Promise((resolve, reject) => {
      if (this._closed) return reject(new Error('RedisClient 已关闭'));
      const sock = net.createConnection({ host: this.host, port: this.port });
      this.socket = sock;
      sock.setNoDelay(true);

      sock.once('connect', () => {
        this.connected = true;
        if (this.password) {
          this._inAuth = true;
          this._rawCommand(['AUTH', this.password])
            .then(() => {
              this._inAuth = false;
              if (this.db > 0) {
                return this._rawCommand(['SELECT', String(this.db)]);
              }
              return null;
            })
            .then(() => {
              this._connectPromise = null;
              resolve();
            })
            .catch((e) => {
              this._connectPromise = null;
              reject(e);
            });
        } else if (this.db > 0) {
          this._rawCommand(['SELECT', String(this.db)])
            .then(() => {
              this._connectPromise = null;
              resolve();
            })
            .catch((e) => {
              this._connectPromise = null;
              reject(e);
            });
        } else {
          this._connectPromise = null;
          resolve();
        }
      });
      sock.once('error', (e) => {
        this.connected = false;
        this._connectPromise = null;
        this._rejectAllPending(e);
        reject(e);
      });
      sock.on('data', (chunk) => this._onData(chunk));
      sock.on('close', () => {
        this.connected = false;
        this._rejectAllPending(new Error('Redis 连接已关闭'));
      });
    });
    return this._connectPromise;
  }

  async close() {
    this._closed = true;
    if (this.socket) this.socket.destroy();
    this.connected = false;
  }

  /**
   * 发送 RESP 命令
   * @param {string[]} parts
   * @returns {Promise<any>}
   */
  async _rawCommand(parts) {
    if (this._closed) throw new Error('RedisClient 已关闭');
    if (!this.connected) await this.connect();
    return new Promise((resolve, reject) => {
      this._cmdQueue.push({ resolve, reject, parts });
      this._send(parts);
    });
  }

  _send(parts) {
    const buf = encodeCommand(parts);
    try {
      this.socket.write(buf);
    } catch (e) {
      this._rejectAllPending(e);
    }
  }

  _onData(chunk) {
    this._buffer = Buffer.concat([this._buffer, chunk]);
    this._parseBuffer();
  }

  _parseBuffer() {
    while (this._buffer.length > 0) {
      const c = this._cmdQueue[0];
      if (!c) return; // 没在等的命令
      try {
        const { value, consumed } = parseReply(this._buffer);
        if (consumed === 0) return; // 数据不够
        this._buffer = this._buffer.slice(consumed);
        this._cmdQueue.shift();
        c.resolve(value);
      } catch (e) {
        if (e && e.code === 'EAGAIN') return; // 需更多数据
        // 协议错误：整条命令失败
        const c2 = this._cmdQueue.shift();
        if (c2) c2.reject(e);
        // 同步断开避免后续解析错位
        if (this.socket) this.socket.destroy();
      }
    }
  }

  _rejectAllPending(err) {
    while (this._cmdQueue.length > 0) {
      const c = this._cmdQueue.shift();
      try { c.reject(err); } catch (_) {}
    }
  }

  // ---- 高层命令（仅 Sliding Window 用到的） ----

  async ping() {
    return this._rawCommand(['PING']);
  }

  async zadd(key, score, member) {
    return this._rawCommand(['ZADD', key, String(score), member]);
  }

  async zremrangebyscore(key, min, max) {
    return this._rawCommand(['ZREMRANGEBYSCORE', key, min, max]);
  }

  async zcard(key) {
    return this._rawCommand(['ZCARD', key]);
  }

  async expire(key, seconds) {
    return this._rawCommand(['EXPIRE', key, String(seconds)]);
  }

  async del(key) {
    return this._rawCommand(['DEL', key]);
  }

  // ---- 周期 5 P0-2: Lua 脚本（atomic）----

  /**
   * EVAL 一次性执行 Lua 脚本
   * @param {string} script
   * @param {number} numkeys
   * @param {...string} args — keys + argv
   * @returns {Promise<any>}
   */
  async eval(script, numkeys, ...args) {
    return this._rawCommand(['EVAL', script, String(numkeys), ...args]);
  }

  /**
   * EVALSHA 通过 SHA1 缓存执行 Lua 脚本（更省带宽）
   * @param {string} sha1 — 40 字符 hex
   * @param {number} numkeys
   * @param {...string} args
   * @returns {Promise<any>}
   */
  async evalsha(sha1, numkeys, ...args) {
    return this._rawCommand(['EVALSHA', sha1, String(numkeys), ...args]);
  }

  /**
   * SCRIPT LOAD 加载脚本到 Redis 缓存，返回 SHA1
   * @param {string} script
   * @returns {Promise<string>} SHA1 hex
   */
  async scriptLoad(script) {
    return this._rawCommand(['SCRIPT', 'LOAD', script]);
  }
}

// ---- RESP 编解码 ----

function encodeCommand(parts) {
  const partsBuf = parts.map((p) => Buffer.from(String(p), 'utf8'));
  return Buffer.concat([
    Buffer.from(`*${partsBuf.length}\r\n`, 'ascii'),
    ...partsBuf.map((b) => Buffer.concat([
      Buffer.from(`$${b.length}\r\n`, 'ascii'),
      b,
      Buffer.from('\r\n', 'ascii'),
    ])),
  ]);
}

class NeedMoreDataError extends Error {
  constructor() { super('need more data'); this.code = 'EAGAIN'; }
}

function parseReply(buf) {
  if (buf.length === 0) throw new NeedMoreDataError();
  const c = String.fromCharCode(buf[0]);
  if (c === '+') {
    // 简单字符串 +OK\r\n
    const idx = buf.indexOf('\r\n', 1);
    if (idx < 0) throw new NeedMoreDataError();
    return { value: buf.slice(1, idx).toString('utf8'), consumed: idx + 2 };
  }
  if (c === '-') {
    const idx = buf.indexOf('\r\n', 1);
    if (idx < 0) throw new NeedMoreDataError();
    const msg = buf.slice(1, idx).toString('utf8');
    const e = new Error('Redis 错误: ' + msg);
    throw e;
  }
  if (c === ':') {
    const idx = buf.indexOf('\r\n', 1);
    if (idx < 0) throw new NeedMoreDataError();
    return { value: parseInt(buf.slice(1, idx).toString('ascii'), 10), consumed: idx + 2 };
  }
  if (c === '$') {
    // bulk string
    const idx = buf.indexOf('\r\n', 1);
    if (idx < 0) throw new NeedMoreDataError();
    const len = parseInt(buf.slice(1, idx).toString('ascii'), 10);
    if (len === -1) return { value: null, consumed: idx + 2 };
    if (buf.length < idx + 2 + len + 2) throw new NeedMoreDataError();
    // consumed = $（1） + len 数字 + \r\n（2） + bulk（len） + \r\n（2） = idx + 2 + len + 2
    // 例如 $6\r\nfoobar\r\n: idx=2, consumed = 2 + 2 + 6 + 2 = 12
    return { value: buf.slice(idx + 2, idx + 2 + len).toString('utf8'), consumed: idx + 2 + len + 2 };
  }
  if (c === '*') {
    // 数组
    const idx = buf.indexOf('\r\n', 1);
    if (idx < 0) throw new NeedMoreDataError();
    const len = parseInt(buf.slice(1, idx).toString('ascii'), 10);
    if (len === -1) return { value: null, consumed: idx + 2 };
    let off = idx + 2;
    const arr = [];
    for (let i = 0; i < len; i += 1) {
      const r = parseReply(buf.slice(off));
      arr.push(r.value);
      off += r.consumed;
    }
    return { value: arr, consumed: off };
  }
  throw new Error('未知的 RESP 起始字符: ' + c);
}

module.exports = {
  RedisClient,
  encodeCommand,
  parseReply,
  NeedMoreDataError,
};
