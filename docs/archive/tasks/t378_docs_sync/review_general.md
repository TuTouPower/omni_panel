# Task review t378（reviewer_focus: 通用）

- task：`t378_docs_sync`
- spec：`docs/tasks/t378_docs_sync/spec.md`
- diff_anchor：`ebdedddbec234d854496df756fc375cf51d78eb5`
- target：`git diff ebdedddbec234d854496df756fc375cf51d78eb5`
- round：1
- reviewed_at：2026-08-15 02:56 UTC+8

## Findings

### t378_gen_f001 - `docs/guides/testing.md:128` 残留 75% 约束，AC-001 未完全落实

- 严重度：important
- 锚点：AC-001（popup 高度相关文档/注释统一为 100%，不再残留 75%）；spec 范围段明确列「popup-height-controller 三处注释、window-management.md、testing.md 的 75% 改 100%」
- 位置：`docs/guides/testing.md:128`
- 问题：`docs/guides/testing.md:128` 仍写「动态高度跟随 `popup:reportContentHeight`、**不超 75% 工作区**、无额外底部留白」。该文件是活跃文档（`docs/guides/`），非 archive；review_intensive 来源（`testing.md:128`）与 spec 范围段均点名此文件，但 diff 未改动它。popup-height-controller.ts 三处注释与 window-management.md 均已改 100%，唯 testing.md 残留，全仓活跃文档中仅此一处 75% 残留（archive/_pre 与 review 记录不属范围；`docs/specs/renderer-bundle-code-split.md:5` 的「4.2 MB」是 bundle 体积描述，语义无关）。
- 建议：`docs/guides/testing.md:128` 同步改为「不超工作区全高」（可标注 t081 起 `MAX_HEIGHT_RATIO=1.0`），并补 grep「75%」确认活跃文档无残留。

### t378_gen_f002 - smoke_check.md「退出弹出确认」与实际实现不符，AC-002 未完全落实

- 严重度：important
- 锚点：AC-002（smoke_check.md/CLI 帮助文案与实际行为一致）
- 位置：`scripts/smoke_check.md:20`（及 :39「托盘菜单点"退出"并确认后应用完全退出」）
- 问题：smoke_check.md 声称「点击"退出"**弹出确认**（app 常驻托盘，退出需明确确认）」，但全链路无确认对话框：`src/renderer/views/TrayMenu.tsx:165` 「退出 OmniPanel」action 直接调 `window.usageboard.tray.quit()` → IPC `TRAY_QUIT` → `src/main/index.ts:1196` 直接 `app.quit()`。右键弹出菜单→点退出即退出，无二次确认弹窗。任务背景/AC 措辞「点退出确认」与实现矛盾：本 task 以「实现为真相源、文档对齐实现」，此条仍属文档与实现错位（正是本 task 目标消除的类型）。「关窗口不退出仅隐藏」部分与实际一致：`index.ts:857-862` settings 关窗 `hide`、main-panel-controller `target.on("close") → hide()`、`window-all-closed`（:1395）不退出。
- 建议：把「弹出确认」改为与实现一致的表述，如「右键菜单点"退出"后应用直接退出（无额外确认；app 托盘常驻，直接关窗口仅隐藏不退出进程）」；或若确需确认语义则需实现侧补确认弹窗（超出纯文档范围，另行立项）。

### t378_gen_f003 - spec 范围段「web 面板 + CLI serve」检查项未加入 smoke_check.md

- 严重度：minor
- 锚点：spec 范围段「smoke_check.md 更新为连接器/账号模型 + web 面板 + CLI serve，进程退出描述对齐托盘常驻」；AC-002 字面未强制
- 位置：`scripts/smoke_check.md`
- 问题：范围段期望 smoke_check.md 覆盖「web 面板 + CLI serve」，当前文件只有 7 步（连接器/账号 + 退出语义已改）与 `pnpm package` 快速命令，无 web 面板打开、`--cli serve` 常驻服务的检查项。AC-002 验收字面（文案与实际行为一致）不受影响，属范围段意图未完全落实。
- 建议：如确认 web/CLI serve 属本 task 范围，补对应检查步骤；否则在 spec 范围段删除该表述，避免范围漂移。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：3 条（important × 2，minor × 1）
- 未进表的提示：task.md 的 diff 仅 task 管理元数据（status/branch/worktree/diff_anchor），正常。popup-height-controller.ts 三处注释（:55-58/:63-66）与 window-management.md:33 已全改 100%、无 75%/0.75 残留；cpa/connector.ts:4 注释改「All 4 provider parsers」与实现（parse_claude/codex/antigravity/kimi 四个 parser）一致；index.ts:203 帮助文本删 `omni_panel --help` 与 `parse_cli_args`（裸 `--help` 无 `--cli` 返回 `{cli:false}` 不触发，仅 `--cli help` 生效）一致；data_section.tsx 删「4.2 MB」、UpcomingResetCard.tsx 空态改「当前无即将重置的用量项」及测试断言同步，均正确、无歧义。纯文档改动符合「有意不测」。
- 总体判断：AC-001 因 testing.md:128 残留 75%、AC-002 因 smoke_check.md「退出弹出确认」与实际不符而未能完全满足，未解决 important 存在。
- 系统性 follow-up：无

verdict: FAIL
reviewed_scope: 34ea65f4a2828e9f

---

# Task review t378 - Round 2（复核）

- round：2
- reviewed_at：2026-08-15 03:00 UTC+8

## 前轮 finding 复核（以 diff 为准）

### t378_gen_f001 - 已消除

`docs/guides/testing.md:128` 已改为「动态高度跟随 `popup:reportContentHeight`、不超 100% 工作区（t081 起 `MAX_HEIGHT_RATIO=1.0`）、无额外底部留白」。grep 活跃文档（docs/guides、docs/specs、scripts、src/main/core/popup）75%/0.75 残留仅剩无关命中：`scripts/repo_template/repo_task/view_static/board.css:100`（CSS opacity 0.75）、`docs/guides/custom-connector.md:150`（≥0.75 warning 阈值，connector-thresholds，本 task 无关）。AC-001 全量满足。

### t378_gen_f002 - 已消除

`scripts/smoke_check.md:20` 改「点击"退出"确认应用完全退出（无确认对话框，直接退出）」，:43 改「托盘菜单点"退出"，确认应用完全退出（无残留进程）」。与实现一致：`src/renderer/views/TrayMenu.tsx:165` → IPC `TRAY_QUIT` → `src/main/index.ts:1196` `app.quit()`，全链路无 dialog。第 8 步同时保留「直接关窗口不会退出进程，仅隐藏」与 `window-all-closed` 不退出（index.ts:1395）一致。AC-002 满足。

### t378_gen_f003 - 部分消除（CLI serve 已补，web 面板项未加）

新增第 7 步「CLI serve」：`omni_panel --cli serve` 无窗口常驻、`--cli open`/`--cli refresh-all` 子命令连接返回结果。与实现一致（`src/main/cli/args.ts` serve 常驻子命令、index.ts serve 进服务初始化；控制子命令走 `run_control_command` 瘦客户端）。但 spec 范围段「web 面板 + CLI serve」中的 **web 面板**检查项仍未加入（对应 `TRAY_OPEN_WEB` / `http://localhost:PORT/` 网页打开）。AC-002 验收字面（文案与实际行为一致）已满足，此项属 spec 范围段意图未完全落实，维持 minor 观察，不判 blocking。

## 本轮新发现

0 条（修复未引入新问题：smoke_check 第 8 步两行语义无矛盾；testing.md 措辞与 window-management.md:33 对齐；CLI serve 描述与 args.ts/index.ts 实现一致）。

## 结论

- 前轮 finding 复核：f001 已消除、f002 已消除、f003 部分消除（CLI serve 已补，web 面板检查项缺，minor）
- 本轮新发现：0 条
- 未进表的提示：`git status` 见 `?? node_modules`（task worktree 内依赖安装产物，非本 task diff 内容，不评）
- 总体判断：未解决 important 全部消除，仅剩 f003 残余 minor（web 面板 smoke 检查项），不影响本 task 验收

verdict: PASS
reviewed_scope: ce9634d5a0a6acf6
