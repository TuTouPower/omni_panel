# Task review T012

- task：`T012_electron_project_reorg`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：文档+代码
- reviewed_at：2026-07-21 02:10 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

### T012_code_f001 — CI yaml 仍调用已删除的 `pnpm test:e2e`，下次 CI 必失败

- 严重度：critical
- 位置：`.github/workflows/ci.yml:68`、`.github/workflows/nightly.yml:32`
- 问题：`package.json` 把 `test:e2e` 重命名为 `test:e2e:electron`（第 33 行），原 `test:e2e` script 已不存在。两个 CI workflow 仍 `run: pnpm test:e2e`，下一次 push/nightly 触发即 `Error: Missing script: test:e2e`，e2e job 整段红。owner 在 plan.md:15 自己列了风险"default project 改名影响 CI/其他脚本引用 → grep 全仓确认"，但实际 grep 只覆盖 `e2e/specs|project=default`（见 verification facts），未覆盖 `test:e2e`，导致漏判。
- 建议：二选一，最小修法是把 CI 改为 `pnpm test:e2e:web`（与 spec "日常 e2e 用 test:e2e:web" 一致，CI 跑得动、不需 Electron 产物）；若 CI 原意是跑 Electron 专属，改 `pnpm test:e2e:electron` 并补 build/ABI/Xvfb 前置（成本高，T013 再议）。推荐前者。本 task 范围虽未列 CI，但"改 script 名 + 不同步调用方"属于 rename 的完整性职责，不能遗留。

### T012_code_f002 — `docs/guides/testing.md:10` 运行命令示例保留失效命令

- 严重度：medium
- 位置：`docs/guides/testing.md:10`
- 问题：分层表第 26 行已正确改为 `Electron E2E | tests/e2e/electron/`，但同文件"运行命令"小节第 10 行仍写 `pnpm test:e2e             # Playwright 用户 E2E`。该 script 不存在，读者复制粘贴即报错。spec 范围明确要求 testing.md 同步（分层表 + 路径），运行命令块同属 testing.md 文档一致性范围。
- 建议：第 10 行改为 `pnpm test:e2e:web       # Playwright Web E2E（日常）`，下一行（或紧跟）补 `pnpm test:e2e:electron  # Playwright Electron E2E（手动）`。

### T012_code_f003 — `README.md:78` 开发小节保留失效命令

- 严重度：medium
- 位置：`README.md:78`
- 问题：`pnpm test:e2e         # Playwright E2E` 同样指向已删除 script。README 是仓库门面，面向新贡献者，第一手复制粘贴即失败。
- 建议：改为 `pnpm test:e2e:web     # Playwright Web E2E`；如需列 Electron 手动跑，补一行 `pnpm test:e2e:electron  # Playwright Electron E2E（手动）`。

### T012_code_f004 — `playwright.config.ts` electron project 配置正确，仅记录核对结论

- 严重度：suggestion（无问题，核对留痕）
- 位置：`playwright.config.ts:22-25`
- 问题：无问题。`name: "electron"` + `testDir: "./tests/e2e/electron"`，未加 `use.baseURL`（Electron project 不该继承 web 的 baseURL，正确），未残留 default/specs 字面量，与 spec 范围逐字对齐。
- 建议：保留现状。

### T012_code_f005 — `package.json` `test:e2e:electron` 组成正确，仅记录核对结论

- 严重度：suggestion（无问题，核对留痕）
- 位置：`package.json:33`
- 问题：无问题。`node scripts/ensure_electron_abi.mjs && playwright test --config=playwright.config.ts --project=electron`，前置 ABI 校验保留，`--project=electron` 与新 project name 一致。`test:e2e:web`（第 34 行）未动，保持 T010/T011 成果。
- 建议：保留现状。

### T012_code_f006 — 非范围守住：spec 内容/web/packaged/fixtures/pages 未动

- 严重度：suggestion（无问题，核对留痕）
- 位置：working tree 全部
- 问题：无问题。23 个 spec 仅 `git mv`，内容零字节变化（`git diff` 空输出，仅 R 状态）；web/、packaged/、fixtures/、pages/ 全无修改。与 spec "非范围" 完全对齐。
- 建议：保留现状。

## 结论

3 条需改 finding（f001 critical + f002/f003 medium）+ 3 条核对留痕（f004/f005/f006 无问题）。

核心判断：**目录改名 + playwright config + package.json script 三件主体改动正确、完整、守住非范围**，但 owner 的 grep 漏了 `test:e2e` 字面量，导致 4 处活跃文档/CI 引用残留失效命令（2 个 CI workflow + testing.md + README）。f001 不修则下次 CI 必红，必须在 adoption 阶段立即修复。f002/f003 同源问题，文档一致性，一并修。

建议 adoption：

- f001：采纳，CI 两处改 `pnpm test:e2e:web`（日常 e2e 与 spec 语境一致，无需 Electron 产物）。触代码（yaml），回 step 4 黑盒验证：`pnpm test:e2e:web` 跑通即可，不必真跑 CI。
- f002/f003：采纳，文档改，笔误类直接继续。
- f004/f005/f006：无需修改。
