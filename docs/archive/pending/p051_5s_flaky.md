# p051 整批并行下真实定时器集成测试偶发 5s 超时（系统性 flaky）

- 来源：t211 黑盒顺手发现（p049 同类的更广表现）
- 内容：`pnpm test` 高并行负载下，多个走真实定时器的集成/单测间歇 5s 超时或断言窗口被挤爆：refresh-service（重试循环、proxy resolver）、grok-oauth（5000ms）、secrets-store / file-vault（20 并发写 2s 窗口）、subscription-service（30ms 轮询 + 2s wait_for）。单文件隔离跑全部稳定通过，证明是负载敏感而非逻辑错误。分布每次不同、与改动文件无关。处置方向：给这些用例统一提 timeout / 改用伪时钟 / 缩小真实定时器间隔 / 限制 vitest 并行 worker 数。
- 处理：t218
