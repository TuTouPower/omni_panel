# p057 SessionLibrary 测试 act() 警告（异步 mock resolve 在 act 外）

- 来源：t227 test reviewer round 2（f007 minor）
- 内容：`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx` 13 个用例渲染后 `getSessions`/`query` mock 的异步 resolve 落在 act 外，vitest 打印 "not wrapped in act(...)" 警告；不导致失败，纯 dev 噪声。候选修法：render 后 `await act(async () => {})` 冲刷微任务，或断言统一改用 findBy/waitFor 前先 act。
- 处理：t233
