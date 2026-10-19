// server/services/useActionState.js
// 周期 15 R6: useActionState hook 实现
// 模拟 React 19 useActionState 行为（状态管理 + action 执行）

'use strict';

/**
 * 创建 useActionState 状态机
 * @param {object} opts
 * @param {Function} opts.initialState - 初始状态
 * @param {Function} opts.action - action 函数 (prevState, payload) => newState
 * @param {object} [opts.initialPayload] - 初始 payload
 * @returns {object} state machine instance
 */
function createActionState(opts = {}) {
  const initialState = typeof opts.initialState === 'function' ? opts.initialState() : opts.initialState;
  const action = opts.action;
  const initialPayload = opts.initialPayload || null;

  let current = {
    state: initialState,
    pending: false,
    isPending: false,
    error: null,
    lastPayload: initialPayload,
    history: [initialState],
  };

  return {
    /**
     * 获取当前状态
     */
    getState() {
      return { ...current, history: [...current.history] };
    },

    /**
     * 获取状态值
     */
    getValue() {
      return current.state;
    },

    /**
     * 检查是否 pending
     */
    isPending() {
      return current.pending || current.isPending;
    },

    /**
     * 检查是否有错误
     */
    hasError() {
      return current.error !== null;
    },

    /**
     * 执行 action
     * @param {any} payload - action payload
     * @returns {Promise<object>} result
     */
    async dispatch(payload) {
      if (current.pending) {
        return { ok: false, error: 'action_pending' };
      }

      current.pending = true;
      current.isPending = true;
      current.error = null;
      current.lastPayload = payload;

      try {
        if (typeof action !== 'function') {
          throw new Error('action must be a function');
        }
        const newState = await action(current.state, payload);
        current.state = newState;
        current.history.push(newState);
        current.pending = false;
        current.isPending = false;
        return { ok: true, state: newState };
      } catch (e) {
        current.error = e.message;
        current.pending = false;
        current.isPending = false;
        return { ok: false, error: e.message };
      }
    },

    /**
     * 重置状态
     */
    reset() {
      const resetState = typeof opts.initialState === 'function' ? opts.initialState() : opts.initialState;
      current = {
        state: resetState,
        pending: false,
        isPending: false,
        error: null,
        lastPayload: initialPayload,
        history: [resetState],
      };
      return { ok: true, state: resetState };
    },

    /**
     * 获取历史
     */
    getHistory() {
      return [...current.history];
    },

    /**
     * 获取最后 payload
     */
    getLastPayload() {
      return current.lastPayload;
    },

    /**
     * 获取错误信息
     */
    getError() {
      return current.error;
    },
  };
}

/**
 * 创建表单状态机（useActionState for forms）
 * @param {object} opts
 * @param {object} opts.initialFormData - 初始表单数据
 * @param {Function} opts.onSubmit - 提交处理函数
 * @param {object} [opts.initialStatus] - 初始状态
 * @returns {object} form state machine
 */
function createFormState(opts = {}) {
  const initialFormData = opts.initialFormData || {};
  const onSubmit = opts.onSubmit;
  const initialStatus = opts.initialStatus || {
    status: 'idle',
    error: null,
    isSubmitting: false,
  };

  let current = {
    ...initialStatus,
    formData: { ...initialFormData },
    submissions: 0,
    lastSubmittedAt: null,
  };

  return {
    /**
     * 获取当前状态
     */
    getState() {
      return { ...current, formData: { ...current.formData } };
    },

    /**
     * 设置表单字段
     */
    setField(name, value) {
      current.formData = { ...current.formData, [name]: value };
      current.error = null;
      return { ok: true };
    },

    /**
     * 设置多个字段
     */
    setFields(fields) {
      current.formData = { ...current.formData, ...fields };
      current.error = null;
      return { ok: true };
    },

    /**
     * 提交表单
     */
    async submit() {
      if (current.isSubmitting) {
        return { ok: false, error: 'already_submitting' };
      }

      current.isSubmitting = true;
      current.status = 'submitting';
      current.error = null;
      current.submissions += 1;
      current.lastSubmittedAt = Date.now();

      try {
        if (typeof onSubmit !== 'function') {
          throw new Error('onSubmit must be a function');
        }
        const result = await onSubmit(current.formData, current);
        current.isSubmitting = false;
        current.status = result && result.ok === false ? 'error' : 'success';
        if (result && result.ok === false && result.error) {
          current.error = result.error;
        }
        return { ok: true, status: current.status };
      } catch (e) {
        current.isSubmitting = false;
        current.status = 'error';
        current.error = e.message;
        return { ok: false, error: e.message };
      }
    },

    /**
     * 重置表单
     */
    reset() {
      current = {
        ...initialStatus,
        formData: { ...initialFormData },
        submissions: 0,
        lastSubmittedAt: null,
      };
      return { ok: true };
    },

    /**
     * 获取字段值
     */
    getField(name) {
      return current.formData[name];
    },

    /**
     * 获取提交次数
     */
    getSubmissions() {
      return current.submissions;
    },
  };
}

module.exports = {
  createActionState,
  createFormState,
};
