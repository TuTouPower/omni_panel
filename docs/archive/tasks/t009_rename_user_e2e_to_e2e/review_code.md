# Task review T009

- task：`T009_rename_user_e2e_to_e2e`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：文档+代码
- reviewed_at：2026-07-21 00:10 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

### T009_code_f001 — testing.md "打包 smoke" 行路径漏改

- 严重度：high
- 位置：`docs/guides/testing.md:27`
- 问题：分层表第 27 行 `打包 smoke | \`tests/user_e2e/packaged/\``，路径仍为 `user_e2e`。同表第 23 行 `用户 E2E`已改为`tests/e2e/specs/`，但同行表内 `打包 smoke`路径未同步，违反 spec 范围"更新引用 docs/guides/testing.md 的路径字样"。验收标准"全仓无`user_e2e` 残留引用（archive 除外）"未达成：`grep user_e2e docs/guides/testing.md` 命中第 27 行。
- 建议：将第 27 行路径改为 `tests/e2e/packaged/`，与 playwright.config.ts 中 `packaged` project testDir `./tests/e2e/packaged` 保持一致。

## 结论

代码改动（git mv 目录、playwright.config.ts 3 处 testDir/globalSetup、architecture.md tests/ 注释）符合 spec 范围，import 全部为相对路径（`../fixtures`、`../pages`），无绝对路径残留。tasks_index.md 标题行与 task 目录内 spec.md/plan.md 自身的 `user_e2e` 字样属合理保留（任务标题/历史描述）。

但 testing.md 分层表漏改 1 行（high），导致验收标准"全仓无 user_e2e 残留"不成立。修复后可通过。
