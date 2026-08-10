# p054 本地默认 `pnpm test:e2e:web` 必挂 account_error_badge（需 MOCK_FIXTURE=synthetic）

- 来源：2026-08-05 /goal 全量 e2e 验证
- 内容：`pnpm test:e2e:web` 默认走 real fixture（responses.json），KIMI 三实例 state 无 item 级 error，`account_error_badge.spec.ts` 断言 `.error-badge` 必失败；`MOCK_FIXTURE=synthetic pnpm test:e2e:web`（CI smoke，docs/guides/testing.md:80 文档化）48 全绿。测试本身非回归（fe80caa2 未触该路径），属本地默认 fixture 与 synthetic-only 测试的配置分叉：daily 命令默认跑 real 却含 synthetic-only 用例。候选修法：该 spec 在非 synthetic fixture 下条件 skip，或 webServer 恒设 MOCK_FIXTURE=synthetic。
- 处理：t231
