# Adoption T009

逐条处置 `review_code.md` 和 `review_test.md` 的 finding。流程见 AGENTS.md step 7。

| finding_id     | decision | rationale                                         | status |
| -------------- | -------- | ------------------------------------------------- | ------ |
| T009_code_f001 | 采纳     | testing.md:27 打包 smoke 行路径漏改               | 已修   |
| T009_test_f001 | 采纳     | 同 code_f001（同一处漏改，两 agent 都捕获）       | 已修   |
| T009_test_f002 | 采纳     | test:e2e 降级为 typecheck+grep 可接受,T010 补真跑 | 已修   |

## 处置说明

- **T009_code_f001 / T009_test_f001（已修）**：`docs/guides/testing.md:27` 打包 smoke 行路径 `tests/user_e2e/packaged/` → `tests/e2e/packaged/`。owner 之前只改了 L26 用户 E2E 行，漏 L27。改后 `grep user_e2e`（活跃文档）达成 spec 验收第 1 条。仅文档改动，不触发重审。
- **T009_test_f002（已修）**：spec 验收第 2 条 `pnpm test:e2e` 降级为 typecheck + grep。理由成立（机械改名、27 spec zero content change、typecheck 绿、import 全相对路径）。`task_report.md` 遗留问题显式记录，T010 mock 基建收尾时用真实 web e2e 跑通补齐运行时验证。
