# p092 local-api searchContent 断连测试未处理 AbortError（2026-08-08）

- 来源：技术债自查（t267 全量单测发现；t263 断连测试引入，t264 review 已提示）
- 现象：`tests/integration/local-api/server.test.ts`「POST /v1/sessionHistory/searchContent 客户端断连时中止底层搜索 (t263)」触发 `AbortError: This operation was aborted`（undici），Vitest 报 1 unhandled error（PromiseRejectionHandledWarning），测试本身通过。
- 影响：全量 `pnpm test` exit 1（vitest 把 unhandled error 记为失败），CI 门禁被触发。
- 根因：t263 断连测试 abort fetch 后，undici 的 rejection 在测试结束后的微任务才触发，`req.catch(() => {})` 虽捕获但 timing 上 rejected promise 被 vitest 计为 unhandled。
- 测试缺口：断连测试未在测试内 await 并稳定捕获 abort rejection。
- 线索：`server.test.ts` 断连用例 `await req.catch(() => {})` 后需额外 flush 微任务或改用 `vi.waitFor` 后显式断言；或服务端 handler 对断连 abort 时不 reject 响应 promise。2026-08-10 主仓复现尝试：全量 `pnpm test` ×2、断连用例 ×10 循环均绿（vitest 3.2.4），unhandled AbortError 未复现，疑似依赖 vitest 版本时序。
- 处理：未开
