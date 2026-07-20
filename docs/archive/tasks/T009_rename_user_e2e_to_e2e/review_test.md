# Task review T009

- task：`T009_rename_user_e2e_to_e2e`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：测试
- reviewed_at：2026-07-21 01:57 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

### T009_test_f001 — `docs/guides/testing.md` 打包 smoke 路径未同步改名

- 严重度：medium
- 位置：`docs/guides/testing.md:27`
- 问题：spec 验收标准第 1 条明文要求「全仓无 `user_e2e` 残留引用（archive 除外）」。`docs/guides/testing.md:27`（活跃文档，非 archive）的测试分层表"打包 smoke"行仍写 `tests/user_e2e/packaged/`，与实际目录 `tests/e2e/packaged/` 不一致。同一张表第 26 行的用户 E2E 已更新为 `tests/e2e/specs/`，独漏打包 smoke 一行。全仓 grep user_e2e 命中点除本行外只剩 `docs/archive/`（符合 spec 例外）、task 工作区与历史 log（亦属归档语义）。
- 建议：owner adoption 阶段把 `docs/guides/testing.md:27` 的 `tests/user_e2e/packaged/` 改为 `tests/e2e/packaged/`。纯文档笔误，不需重跑测试。

### T009_test_f002 — spec 验收"test:e2e 跑通"降级为 typecheck+grep，未做运行时验证

- 严重度：low
- 位置：`spec.md:22`（验收标准第 2 条）；owner 未跑 `pnpm test:e2e`
- 问题：spec 验收第 2 条是「`pnpm test:e2e` 跑通（Electron 驱动 specs/ 不变）」，owner 以"机械改名 + T010 即将重写"为由降级为 typecheck + grep，未真实启动 Electron 跑 27 个 spec。
- 风险评估（核对后确认低）：
    - `playwright.config.ts` 三个 testDir/globalSetup 路径已全部更新（globalSetup、default、packaged）。
    - `package.json:33` 的 `test:e2e` 通过 `--config=playwright.config.ts` 解析，不硬编码 `user_e2e` 字面量。
    - `tests/e2e/` 内部 import 全是相对路径（`./electron_app`、`./app_fixture`、`../../../src/shared/lib/logger`），目录改名后相对层级不变，运行时模块解析不受影响。
    - 27 个 spec 文件 `git diff --stat` 显示 zero content change（纯 rename），内容完整性保证。
    - typecheck 已过 → TS 编译期路径解析全绿。
    - 运行时仅剩 Electron 真实启动 + better-sqlite3 native module ABI rebuild（`ensure_electron_abi.mjs`），这部分风险与 T009 改名无关，是 Electron e2e 本身固有风险。
- 建议：降级在本 task 机械性质 + T010 即将重写前提下**可接受**。但需把"test:e2e 未跑"在 `task_report.md` 遗留问题中显式列出，并在 T010 收尾时强制真实跑 e2e（届时既有 web 新基建、又有残存 Electron spec），以闭环 T009 未覆盖的运行时验证。若 T010 timeline 不确定，建议本 task 收尾前至少手动跑一次 `pnpm test:e2e --project=default` 验证 default project 全绿（不含 packaged，免去打包依赖）。

## 结论

2 个 finding。

- f001 是 spec 验收第 1 条的硬违规（活跃文档残留 `user_e2e`），必须当场修，属文档笔误。
- f002 是 spec 验收第 2 条的降级，风险经逐项核查确属低（配置/路径/import/内容四方面均已覆盖），但应在 task_report 显式遗留，T010 收尾时补真跑。

测试维度无 critical 阻塞：改名机械性质成立，Playwright testDir 可发现性正确，spec/fixture/page object 内容未被破坏，typecheck 绿。f001 修后可进入 adoption。
