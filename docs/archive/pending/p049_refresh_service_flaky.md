# p049 refresh-service 集成测试在整批并行下偶发超时（疑似 flaky）

- 来源：t210 黑盒顺手发现
- 内容：`tests/integration/scheduler/refresh-service.test.ts` 在整批 `pnpm test` 高并行负载下偶发失败，单文件隔离跑稳定 30/30 通过。失败形态：`preserves lastSuccess across consecutive failures` / `inserts stale observations` / `passes config.proxy.url` 5s 超时、`retries failing non-session connector 3 times` 得 4 次尝试。这些用例走真实 2s 重试定时器，负载高时循环跑不进 5s 窗口或额外触发一次。与 t210 无关（t210 未触 refresh-service）。处置方向：给这些用例提 timeout、改用伪时钟或缩小重试间隔，消除并行时序敏感。
- 处理：t218
