# p056 vault/secrets-store 集成测试全量并行超时 flaky

- 来源：t227 实施观察（2026-08-06）
- 内容：`tests/integration/config/secrets-store.test.ts` 与 `tests/integration/vault/file-vault-backend.test.ts`（crypto 密集 + 文件锁/互斥）在 `pnpm test` 全量并行时随机 5s 超时（一次 0-4 个 test 失败），单独运行两文件 38 全过。与 t218 处置的定时器 flaky 类似，属集成测试并行资源竞争模式；非 t227 改动引入（vault/config 零交集）。候选修法：提高这两文件 `testTimeout`（如 15000），或全量跑时串行化 crypto 密集套件。
- 处理：已验证不存在（2026-08-07 核实）——全局 `testTimeout`/`hookTimeout` 已提至 60s，热点用例单独放宽（commit `ea59096e`），原 5s 超时条件不成立。
