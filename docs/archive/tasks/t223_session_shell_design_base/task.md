---
tid: "t223"
slug: "session_shell_design_base"
title: "会话窗口单壳双页签与 demo 设计系统基座"
status: "done"
branch: "t223_session_shell_design_base"
worktree: ""
review_level: "full"
diff_anchor: "f514bd7cdaa88ca2a9d58e8fddb6fc40ec26a865"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### 2026-08-06 实施

- **Step 1 前置**：`{doctor_cmd}` 无（testing.md 声明）。`{test_cmd}` 无独立 doctor。
- **未知契约核实**：读主仓与 demo `package.json` 逐项对照，demo 所需依赖（radix 组件族/@dnd-kit/gsap/framer-motion/lenis/cmdk/react-markdown/next-themes）均非本 task 所需，主仓现有 react 19 + tailwind v4 + lucide-react + 既有 theme 机制即可实现，**零新增 npm 依赖**。字体方案用户确认走系统等价回退（Noto Sans SC→PingFang SC/微软雅黑，Space Grotesk→系统回退，JetBrains Mono→Cascadia Code/Consolas），不新增字体资产。spec 未知契约清单已改写为结论，`preflight --require-verified` PASS。
- **架构决策**：
    - 会话窗口 route 保持不变（`#history`），`App.tsx` 将 `history` 分支从 `SessionHistoryView` 换为新建 `SessionShell`（单壳双页签）。`SessionHistoryView` 原样保留，作为工作台页签内容整棵挂载。
    - 主题：新建 `src/renderer/lib/session-shell/theme.ts` 的 `useSessionShellTheme`，独立于全局 `theme.ts`——session 窗口主题默认暗色、写 `localStorage omni_session_theme`，**不写全局 config.theme**（避免与全局主题冲突，满足"重启保持、全新默认暗色"AC）。切换设 `html[data-theme]`，与既有 preload 首帧主题管线兼容。
    - 样式：新建 `session-shell.css`，作用域限定 `.session-shell`，暗色 token 为 demo design.md §2 原值，`html[data-theme="light"] .session-shell` 覆盖为浅色；内部把 demo token 桥接到旧 token 名（`--win-bg/--text/--card-bg` 等），使 `SessionHistoryView` 直接继承 demo 视觉，无需改其内部样式。
    - 页签切换用 CSS `data-active` 显隐（两页签常驻挂载），满足"切回不丢内部状态"AC。
- **测试**：新增 `session_shell_theme.test.ts`（3 用例：默认暗色/预存 light/切换持久化）+ `SessionShell.test.tsx`（8 用例：页签默认与切换、状态保留、主题、跳转 IPC、无命令面板/拖拽入口）。复用 `session_history_test_utils.ts` 的 usageboard mock。
- **踩坑**：
    - vitest 缓存导致新增文件解析失败（实际是 import 相对路径少一层 `../../`），修正后即过。
    - 测试内"工作台/会话库"文本与空态标题重名，`getByText` 撞多个元素，改 `getByRole("button", { name })` 精确定位。
    - lint：`vi` 仅作类型用须 `import type`；测试断言 `act(() => fn())` 表达式形式违反 `no-confusing-void-expression`，改块体。
    - 跳转按钮断言用 `getAllByTitle` 数组索引触发非空断言 lint，改给按钮加 `data-testid`。
    - worktree 无 `src/generated/build-info.ts`，`pnpm test` 首次整批挂（build-info-ipc suite）；`mkdir src/generated && npx tsx scripts/gen-build-info.ts` 后恢复。
- **验证**：`pnpm test` 224 files / 2374 passed（+11 新增）；`pnpm typecheck` / `pnpm lint` 全绿；`pnpm build` 成功；`pnpm package` + `pnpm test:packaged` 4 passed（打包产物回归）。黑盒脚本 `.scratch/t223/shell_blackbox.ts` 驱动真实 exe 验证：默认暗色、页签切换与状态保留、主题切换、会话库空态、用量面板跳转，全部 PASS。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-06 10:07 UTC+8)

code 审查 2 minor，test 审查 0 finding。

| finding_id     | severity | status | rationale                                             | fix_ref                                 |
| -------------- | -------- | ------ | ----------------------------------------------------- | --------------------------------------- |
| t223_code_f001 | minor    | 已修   | 桥接补 `--accent/--bg-hover/--border`，消除旧主题残留 | src/renderer/styles/session-shell.css   |
| t223_code_f002 | minor    | 已修   | `useEffect`→`useLayoutEffect`，首帧前同步持久化主题   | src/renderer/lib/session-shell/theme.ts |

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id     | severity                 | status | rationale | fix_ref |
| -------------- | ------------------------ | ------ | --------- | ------- |
| t000_code_f001 | critical/important/minor | 已修   | 一句话    | 文件:行 |
| t000_test_f002 | minor                    | 遗留   | 一句话    | pNNN    |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1 页签默认工作台、切换不丢内部状态：`SessionShell.test.tsx`（data-active 断言 + 内容仍在 DOM + unsubscribe 未调用）+ 黑盒脚本实测（`.scratch/t223/shell_blackbox.ts` 驱动打包 exe，切会话库→切回工作台，会话视图仍挂载）。滚动位置保留经 code reviewer Playwright 实测 scrollTop 150→0→150 成立。
    - AC2 明暗切换/重启保持/全新默认暗色：`session_shell_theme.test.ts`（默认暗色、预存 light、toggle 双向 + localStorage 持久化）+ 黑盒实测 html data-theme dark↔light。
    - AC3 用量/代理面板跳转不回归：`SessionShell.test.tsx` 断言 `tray.open_panel` / `tokenStats.open` 被调；打包 exe 黑盒实测跳转打开 popup。
    - AC4 无旧主题残留：`session-shell.css` 桥接全量 token（含 review f001 补的 `--accent/--bg-hover/--border`）；暗色 hover 等回退样式消除。视觉整体目验标 `[deploy]`。
    - AC5 工作台会话能力不回归：既有 `session_history_view.test.tsx`（18 条，t211）零 diff 保留；打包 smoke 4 passed。
    - AC6 会话库空态：`SessionShell.test.tsx` 断言非报错非空白。
    - AC7 无拖文件导入与 ⌘K 入口：`SessionShell.test.tsx` 断言 queryByText 命令面板/⌘K/拖拽为 null。
- 门禁：`pnpm test` 224 files / 2374 passed（+11 新增）；typecheck / lint 全绿；`pnpm build` 成功；`pnpm package` + `pnpm test:packaged` 4 passed。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS（2 minor 已修：f001 token 桥接、f002 首帧闪烁）
- Round 1 test：PASS（0 finding）

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 会话历史窗口改单壳双页签外壳 + demo 设计系统基座，工作台会话能力零回归；零新增依赖；d018 登记外壳状态保留机制与 demo 依赖对照。
