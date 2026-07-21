# Task review T011

- task：`T011_migrate_web_specs`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：文档+代码
- reviewed_at：2026-07-21 14:35 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

### T011_code_f001 — log 分类遗漏 `popup_token_panel`，且"留 specs/（21 个）"与实际文件数不符

- 严重度：low
- 位置：`docs/tasks/T011_migrate_web_specs/log.md:10,21-28`；`tests/e2e/specs/popup_token_panel.spec.ts`
- 问题：
    - log L10 把 `popup_token_panel` 列入"纯 DOM 可平移（~11 个）"，实际未迁，也未在 L22-28 "留 specs/" 分类清单中出现。
    - L21 声明"留 specs/（21 个）"，L22-28 实际列 22 个（托盘 3 + powerMonitor 1 + restart 3 + seed_fake_plugin 9 + createTestWithSetup 2 + window.outerHeight 2 + popup_theme 1 + settings_view 回退 1 = 22）。
    - 当前 `tests/e2e/specs/` 目录实际 23 个 `.spec.ts`，差额正好是 `popup_token_panel`。
    - `popup_token_panel.spec.ts` 是纯 DOM 断言（`.token-card`、`Total Tokens`、`时间范围按钮`），仅靠 `VITE_ENABLE_TOKEN_PANEL=1` env gate；web build 默认未开该 flag，理论上可平移（web build 配置开 flag 后），也可显式留 specs/。
- 建议：在 log "留 specs/" 清单中显式归类 `popup_token_panel`（推荐归到"env flag / web build 未开"或类似理由），并把"21 个"订正为"23 个"（含 popup_theme + popup_token_panel + settings_view）。不必补迁——T012 转 electron/ 时与 popup_theme 一同处置即可。

### T011_code_f002 — tasks_index.md 同时新增 T014 行（非 T011 范围）

- 严重度：low
- 位置：`docs/tasks_index.md`（git diff +4 -3）
- 问题：T011 的 working tree diff 中，tasks_index.md 除把 T011 从 `backlog` 改 `active` 外，还顺带新增 T014（修复 app 图标）一整行。T014 与 T011 无依赖与语义关联，按"一个 task = 一个 commit，精准修改"原则，T014 登记应独立于 T011 commit。
- 建议：T011 commit 不带 T014 行；T014 另起 commit 或作为独立 task 启动时登记。若 T014 已实际在别处启动，可在本 task commit 说明中标注"顺带登记 backlog"并接受，但不推荐。

## 其他核心检查项（全部通过，无 finding）

- **Electron 残留**：5 个 web spec 文件 grep `omni\.|omni\b|app\.firstWindow|openViaIpc|app\.evaluate|app\.stop` 全部无命中。
- **fixture import 路径**：5 个 web spec 均为 `import { expect, test } from "../fixtures/test_web"`（web/ 下相对路径正确），fixture 解构 `{ webPage }`。
- **openSettings rewrite**：`app_lifecycle`、`popup_view`、`scheduler` 全部改用 `SettingsPage.open_via_hash(webPage)`；`scheduler` 原局部 `openSettings` helper 已移除。
- **`SettingsPage.open_via_hash` 实现正确**（`tests/e2e/pages/settings_page.ts:30-35`）：`page.goto("#setting")` + `waitReady()`，与 `openViaIpc` 并存，TS 签名一致（接收 `Page` 返回 `SettingsPage`），JSDoc 标注"仅供 web fixture 使用"。原 `openViaIpc` 保留未改。
- **断言泛化**：`popup_view` 的 provider tab 断言由 `getByRole("button", { name: /^Claude$/ })` 等具体 provider 名改为 `providerTabs.count() > 0`，通过 `hasNotText: /总览/` 过滤；grep `Claude|DeepSeek|anthropic\.com|gmail` 全部无命中。
- **`vite.web.config.ts` 改动精准**（diff +0 -1）：仅删 call site（L26）冗余的 `// @ts-expect-error`，保留 import（L4）处的 directive（`.mjs` 确实无类型声明）。typecheck 过、lint 无新增 error。
- **迁移完整性对照**（5 个迁后 spec 与原版逐 case 对比）：
    - `app_lifecycle`：7 → 5 case，删 `app starts and first window`、`window can be closed without crashing` 两个 Electron 专属 case，合理。
    - `popup_view`：5 → 5 case，`settings button opens independent window` 改为 `settings opens via hash route in same page`，合理。
    - `popup_platform_behavior`：2 → 2 case，`title() truthy` 改断 `getTitle() contains "OmniUsage"`，`titlebar-no-drag class` 改断 `.titlebar` 元素存在（web 无 BrowserWindow 专属 class，合理泛化）。
    - `popup_demo_alignment`：3 → 3 case，1:1 平移。
    - `scheduler`：4 → 4 case，1:1 平移，局部 `openSettings` helper 由 `SettingsPage.open_via_hash` 取代。
- **留 specs/ 抽查合理**（随机抽 3 个核对 log 分类）：
    - `popup_collapse_persistence`（restart 类）— 用 `omni.stop()/start()` 跨进程，符合"跨进程 restart 留 specs/"。
    - `popup_window_constraints`（窗口约束类）— 断言 `window.outerHeight / screen.availHeight`，符合"窗口约束留 specs/"。
    - `main_panel_window_modes`（多窗口类）— 断言独立 BrowserWindow 窗口模式，符合"托盘/多窗口留 specs/"。

## 结论

3 项核心实现（迁移、fixture、`open_via_hash`、vite config 删 directive、断言泛化）均正确无误，迁移后 spec 语义忠实对应原 spec 且去 Electron 依赖彻底。2 个 finding 均为文档层面（log 分类遗漏 popup_token_panel + 数字 21 应为 23、tasks_index 顺带登记 T014），不阻塞 commit，建议 f001 在 adoption 阶段补 log 说明即可（无需改代码），f002 视情拆 commit 或在 commit 说明标注。
