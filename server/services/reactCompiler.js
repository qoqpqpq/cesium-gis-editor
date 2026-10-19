// server/services/reactCompiler.js
// 周期 15 R6: React 19 Compiler 配置助手
// 提供 React 19 Compiler 的 Vite 集成配置 + 使用分析

'use strict';

/**
 * 创建 React 19 Compiler 配置
 * @param {object} opts
 * @param {boolean} [opts.enabled=true] - 是否启用 Compiler
 * @param {string} [opts.target='react-compiler'] - Compiler 目标
 * @param {string} [opts.reactVersion='19.0.0'] - React 版本
 * @param {object} [opts.compilerOptions] - Compiler 选项
 * @returns {object} configuration
 */
function createCompilerConfig(opts = {}) {
  const enabled = opts.enabled !== false;
  const target = opts.target || 'react-compiler';
  const reactVersion = opts.reactVersion || '19.0.0';
  const compilerOptions = opts.compilerOptions || {};

  return {
    enabled,
    target,
    reactVersion,
    compilerOptions: {
      target,
      ...compilerOptions,
    },
    /**
     * 生成 Vite 插件配置
     */
    vitePlugin() {
      if (!enabled) {
        return { name: 'react-compiler-disabled', apply: 'build' };
      }
      return {
        name: '@vitejs/plugin-react-compiler',
        babel() {
          return {
            plugins: [
              [
                'babel-plugin-react-compiler',
                {
                  target: 'react-compiler',
                  ...compilerOptions,
                },
              ],
            ],
          };
        },
      };
    },
    /**
     * 检查 React 版本是否支持 Compiler
     */
    isCompatible(version = reactVersion) {
      const [major, minor] = version.split('.').map(Number);
      return major >= 19 || (major === 18 && minor >= 3);
    },
    /**
     * 获取推荐依赖
     */
    getDependencies() {
      return {
        react: `^${reactVersion}`,
        'react-dom': `^${reactVersion}`,
        'babel-plugin-react-compiler': '^1.0.0',
        '@vitejs/plugin-react': '^4.2.1',
      };
    },
    /**
     * 检查配置是否有效
     */
    isValid() {
      const errors = [];
      if (!enabled) {
        errors.push('compiler disabled');
      }
      if (!this.isCompatible()) {
        errors.push(`React ${reactVersion} not compatible with compiler`);
      }
      return {
        valid: errors.length === 0,
        errors,
      };
    },
  };
}

/**
 * 分析组件是否需要 memoization
 * @param {string} componentName - 组件名
 * @param {object} opts - 组件选项
 * @returns {object} analysis result
 */
function analyzeComponent(componentName, opts = {}) {
  const {
    hasProps = false,
    hasState = false,
    hasEffects = false,
    isPure = true,
    renderCount = 1,
  } = opts;

  const needsMemo = hasProps && !isPure;
  const canUseCompiler = !hasEffects || hasState;

  return {
    componentName,
    needsMemo,
    canUseCompiler,
    recommendation: needsMemo ? 'use React Compiler' : 'no action needed',
    estimatedBenefit: needsMemo ? {
      renderReduction: renderCount > 1 ? `${(1 - 1/renderCount) * 100}%` : '0%',
      rebaseCost: renderCount > 1 ? 'low' : 'none',
    } : {
      renderReduction: '0%',
      rebaseCost: 'none',
    },
  };
}

/**
 * 生成 React 19 Compiler 迁移报告
 * @param {Array} components - 组件列表
 * @returns {object} migration report
 */
function generateMigrationReport(components = []) {
  const analyses = components.map((c) => analyzeComponent(c.name, c));
  const summary = {
    totalComponents: components.length,
    needsMigration: analyses.filter((a) => a.needsMemo).length,
    canUseCompiler: analyses.filter((a) => a.canUseCompiler).length,
  };

  return {
    summary,
    components: analyses,
    recommendations: [
      `Upgrade React to ^${components.length > 0 ? '19.0.0' : '19.0.0'}`,
      `Add babel-plugin-react-compiler ^1.0.0`,
      `Configure @vitejs/plugin-react with compiler: true`,
      `Test all components for behavior changes`,
    ],
  };
}

module.exports = {
  createCompilerConfig,
  analyzeComponent,
  generateMigrationReport,
};
