// client/src/hooks/useOptimisticMarker.test-instructions.js
// 周期 13 P2-3: jsdom + RTL 集成测试脚手架
//
// 背景：
//   - 周期 12 L12-5 反思：客户端 hook 只做静态导入 + 手动状态机模拟，未挂真实 React
//   - 周期 13 P2-3：编写"集成测试运行说明 + mock 模板"作为脚手架
//
// 用法（开发者本地运行时）：
//   1. 安装依赖：
//      cd client
//      npm install --save-dev jsdom @testing-library/react @testing-library/jest-dom
//   2. Vitest / Jest 配置：
//      client/vitest.config.js:
//        import { defineConfig } from 'vitest/config';
//        export default defineConfig({
//          test: {
//            environment: 'jsdom',
//            globals: true,
//            setupFiles: ['./test-setup.js'],
//          },
//        });
//   3. test-setup.js:
//        import '@testing-library/jest-dom/vitest';
//
//   4. 写测试（client/src/hooks/useOptimisticMarker.test.js）：
//        import { renderHook, act } from '@testing-library/react';
//        import { useOptimisticMarker } from './useOptimisticMarker';
//
//        describe('useOptimisticMarker', () => {
//          it('should optimistically add then confirm', async () => {
//            const { result } = renderHook(() => useOptimisticMarker({
//              onAdd: async () => ({ id: 1, name: 'ok' }),
//            }));
//            await act(async () => {
//              await result.current.addMarker({ name: 'test' });
//            });
//            expect(result.current.markers).toHaveLength(1);
//            expect(result.current.markers[0].id).toBe(1);
//          });
//        });
//
// 注意：本仓库本周期不引入 jsdom 依赖，避免 package.json 修改；
//       本文件仅作为"未来集成测试基础设施"的契约文档。

'use strict';

export const INSTALL_INSTRUCTIONS = {
  devDependencies: ['jsdom', '@testing-library/react', '@testing-library/jest-dom'],
  setupFiles: ['./test-setup.js'],
  exampleTest: `
import { renderHook, act } from '@testing-library/react';
import { useOptimisticMarker } from './useOptimisticMarker';

describe('useOptimisticMarker', () => {
  it('optimistic + confirm lifecycle', async () => {
    const { result } = renderHook(() => useOptimisticMarker({
      onAdd: async () => ({ id: 1, name: 'ok' }),
    }));
    await act(async () => {
      await result.current.addMarker({ name: 'test' });
    });
    expect(result.current.markers).toHaveLength(1);
    expect(result.current.markers[0].id).toBe(1);
    expect(result.current.pending).toBe(false);
  });

  it('failure rolls back optimistic', async () => {
    const { result } = renderHook(() => useOptimisticMarker({
      onAdd: async () => { throw new Error('server fail'); },
    }));
    await act(async () => {
      try { await result.current.addMarker({ name: 'test' }); } catch (_) {}
    });
    expect(result.current.markers).toHaveLength(0);
    expect(result.current.error).not.toBeNull();
  });
});
`,
};

export default INSTALL_INSTRUCTIONS;