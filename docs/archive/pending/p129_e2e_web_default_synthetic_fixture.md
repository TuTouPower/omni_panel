# p129 web e2e 默认 fixture 与脚本注入摩擦

- 来源：t301 黑盒发现（技术债自查）
- 内容：`pnpm test:e2e:web` 脚本不注入 `MOCK_FIXTURE`，本地裸跑走 real fixture，`plugin_failure_modes.spec.ts` 期望 failed connector（仅 synthetic fixture 含）而稳定失败，易被误判为回归；`docs/blueprint/testing.md` 已文档化「本地与 CI 均须 MOCK_FIXTURE=synthetic」，但脚本层未兜底。评估：在 `test:e2e:web` 脚本注入 `MOCK_FIXTURE=synthetic`（或使 fixture 选择对缺 failed connector 的场景更宽容）以消除误导。
- 处理：t301
