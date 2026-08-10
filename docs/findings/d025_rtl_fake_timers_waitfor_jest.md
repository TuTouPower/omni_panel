# d025 RTL fake timers 下 waitFor 依赖全局 jest（2026-08-08）

- 来源：t261
- 结论：`@testing-library/dom@10.4.1` 的 `waitFor` 无 `shouldAdvanceTime` 选项；fake timers 分支（`jestFakeTimersAreEnabled()`）直接调用全局 `jest.advanceTimersByTime`（`node_modules/@testing-library/dom/dist/wait-for.js`）。vitest 不提供 `jest` 全局，故需在 `beforeEach` `vi.stubGlobal("jest", vi)`，使 waitFor 走 fake-timers 轮询分支并能推进虚拟时钟。跨防抖等待用 `await act(async () => { await vi.advanceTimersByTimeAsync(ms); })`。
- 证据：`tests/unit/renderer/views/popup_view_t250.test.tsx` beforeEach/afterEach 与 `wait_debounce`；stub 后该文件 5 用例通过、单文件 0 条 act 警告。
- 影响：后续把真实计时器测试改 fake timers（消 act 警告）时，直接复用此方案；升级 `@testing-library/dom` 后可复核是否已有官方 `shouldAdvanceTime` 等价选项。
- 现状：有效
