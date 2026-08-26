// useUndoStack — 命令模式
// 每个命令 { label, do, undo, source? }，push 时清空 redo stack
// 上限 100 步
// 阶段 11 扩展：
//   - source: 'user' | 'ai'（默认 'user'），用于 onInfo 区分
//   - pushBatch: AI 一次批准多工具时合并入栈为一条（do 顺序 / undo 反向）

import { useCallback, useRef, useState } from 'react';

const MAX_DEPTH = 100;

export function useUndoStack() {
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const [tick, setTick] = useState(0);

  const push = useCallback((cmd, source = 'user') => {
    if (!cmd || typeof cmd.do !== 'function' || typeof cmd.undo !== 'function') return;
    try { cmd.do(); } catch (e) { console.warn('[undoStack] do failed', e); return; }
    const tagged = { ...cmd, source };
    undoStackRef.current.push(tagged);
    if (undoStackRef.current.length > MAX_DEPTH) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    setTick((n) => n + 1);
  }, []);

  // 批量入栈：把多个命令合为 1 条复合命令。do 顺序执行，undo 反向。
  // 任一子命令 do 抛错 → 已执行过的子命令全部 undo + 不入栈（一致性优先）
  const pushBatch = useCallback((cmds, source = 'ai') => {
    if (!Array.isArray(cmds) || cmds.length === 0) return null;
    const valid = cmds.filter((c) => c && typeof c.do === 'function' && typeof c.undo === 'function');
    if (valid.length === 0) return null;
    const started = [];
    try {
      for (const c of valid) {
        started.push(c); // 一旦开始 do 就视为已执行，抛错也要 undo
        c.do();
      }
    } catch (e) {
      // 回滚已开始的（含 do 抛错的）
      console.warn('[undoStack] pushBatch.do failed, rolling back', e);
      for (let i = started.length - 1; i >= 0; i--) {
        try { started[i].undo(); } catch (_) {}
      }
      return null;
    }
    const batchCmd = {
      label: valid.map((c) => c.label || '?').join(' + '),
      do: () => { for (const c of valid) c.do(); },
      undo: () => { for (let i = valid.length - 1; i >= 0; i--) valid[i].undo(); },
      source,
      isBatch: true,
      children: valid,
    };
    undoStackRef.current.push(batchCmd);
    if (undoStackRef.current.length > MAX_DEPTH) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    setTick((n) => n + 1);
    return batchCmd;
  }, []);

  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    if (!stack.length) return null;
    const cmd = stack.pop();
    try { cmd.undo(); } catch (e) { console.warn('[undoStack] undo failed', e); }
    redoStackRef.current.push(cmd);
    setTick((n) => n + 1);
    return cmd;
  }, []);

  const redo = useCallback(() => {
    const stack = redoStackRef.current;
    if (!stack.length) return null;
    const cmd = stack.pop();
    try { cmd.do(); } catch (e) { console.warn('[undoStack] redo failed', e); }
    undoStackRef.current.push(cmd);
    setTick((n) => n + 1);
    return cmd;
  }, []);

  const clear = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    setTick((n) => n + 1);
  }, []);

  // 窥视栈顶 source（不弹栈），用于 UI 提示「撤销的是 AI 操作」
  const peekSource = useCallback(() => {
    const stack = undoStackRef.current;
    return stack.length ? stack[stack.length - 1].source || 'user' : null;
  }, []);

  // 当前 source 上下文：setSource('ai') → 之后 push() 的 cmd 自动打 source='ai'
  // pushBatch() 默认 source='ai' 已经满足大部分场景；setSource 给精细控制用。
  const sourceRef = useRef('user');
  const setSource = useCallback((src) => {
    sourceRef.current = (src === 'ai' || src === 'user') ? src : 'user';
  }, []);
  // withSource('ai', fn)：临时把 source 设为 'ai'，跑完恢复
  // 用法：editor.withSource('ai', () => editor.push(cmd))  —— 单次自动 source='ai'
  const withSource = useCallback((src, fn) => {
    const prev = sourceRef.current;
    sourceRef.current = (src === 'ai' || src === 'user') ? src : 'user';
    try {
      return typeof fn === 'function' ? fn() : undefined;
    } finally {
      sourceRef.current = prev;
    }
  }, []);

  // 让 push / pushBatch 走 sourceRef 而不是默认参数
  const pushWithCtx = useCallback((cmd) => {
    push(cmd, sourceRef.current);
  }, [push]);
  const pushBatchWithCtx = useCallback((cmds) => {
    return pushBatch(cmds, sourceRef.current);
  }, [pushBatch]);

  return {
    push: pushWithCtx,
    pushBatch: pushBatchWithCtx,
    undo,
    redo,
    clear,
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
    peekSource,
    setSource,
    withSource,
    _tick: tick,
  };
}