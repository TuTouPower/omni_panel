---
tid: "t273"
slug: "session_window_design_migration"
title: "会话历史窗口迁移到统一设计规范（session-shell 体系退役）"
status: "done"
branch: "t273_session_window_design_migration"
worktree: ""
review_level: "full"
diff_anchor: "3834359300692ab9a701a3c888ff76c9497e6224"
depends_on: "t272"
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

- 将会话历史窗口的 SessionShell、会话库、工作台、会话面板、预览与摘选 dock 迁移到 ui 组件与语义 utility；保留加载、搜索、摘要、布局切换、拖拽、预览、选择与消息展示逻辑。
- 删除 session-shell、pane、session-library、workspace 独立样式文件及本侧旧 token 桥接，清理 import，并同步单测与 web e2e 选择器。
- Round 1 代码审阅发现 compact 元信息布局未迁移；补回 `inline-flex` / 无底距语义并新增回归测试。Round 2 复审确认已修，无新增阻断 finding。
- 全量单测、构建、typecheck、lint、deadcode、arch 与 t273 diff 专项格式检查通过。全仓 `pnpm check` 的 `format:check` 仍命中 anchor 已存在的 9 个无关文件，未修改无关文件。
- Web 黑盒使用 `E2E=1 E2E_HEADLESS=1 MOCK_FIXTURE=synthetic`、`xvfb-run` 与本地 Vite CLI 无头运行，13 项通过。Playwright webServer 曾因既有 p097 自动启动问题连接拒绝，未计入代码失败；改用本地 Vite CLI 重跑通过。Electron bounds E2E 使用 `E2E=1 E2E_HEADLESS=1` 无头运行，2 项按既有 headless 门控跳过，未打开可见窗口。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

本轮 code/test 均无 critical / important，minor finding 进入处置表。

### Round 1 (2026-08-09 18:09 UTC+8)

| finding_id     | severity | status | rationale                                                                       | fix_ref                                                      |
| -------------- | -------- | ------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| t273_code_f001 | minor    | 已修   | 恢复 compact 模式元信息内联布局与无底距语义，并补回归测试。                     | `src/renderer/components/workspace/PaneMessageRow.tsx:80-84` |
| t273_test_f001 | minor    | 遗留   | 源文本字号正则存在类名拆分与 utility 生成规则变化时的边界；不阻断当前行为验收。 | p102                                                         |

### Round 2 (2026-08-09 18:19 UTC+8)

- 前轮 `t273_code_f001` 已修并经代码复审确认；前轮 `t273_test_f001` 按 p102 遗留。

| finding_id     | severity | status | rationale                                                | fix_ref |
| -------------- | -------- | ------ | -------------------------------------------------------- | ------- |
| t273_test_f002 | minor    | 遗留   | compact 回归测试尚未直接锚定默认分支的 flex 与底距语义。 | p103    |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：自动化可测验收满足；AC5 `[deploy]` 需人工视觉抽查，本轮未自证。
- 证据：
    - `pnpm test`：252 个测试文件通过，2746 个测试通过，2 个既有 skip。
    - `pnpm build`、`pnpm typecheck`、`pnpm lint`、`pnpm deadcode`、`pnpm arch` 通过；t273 diff 的 Prettier 与 `git diff --check` 通过。
    - Web session/panel 黑盒在双环境变量和 `xvfb-run` 下 13/13 通过；Electron bounds 黑盒在无头门控下 2 项跳过，未创建可见窗口。
    - 删除文件、import、旧 token 与旧类引用完成三重扫描；`src/renderer` 未残留 `--accent-lime`、`--bg-canvas`、不可达 `--agent-*` 变量及 `session-*` / `pane-*` / `ws-*` / `sl-*` 样式类引用。
    - 全仓 `pnpm check` 的格式门禁仍受 anchor 既有无关文件影响；未修改无关文件，t273 差异专项格式检查通过。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：PASS
- Round 2 test：PASS

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 会话历史窗口已迁移到统一语义设计，独立样式与旧桥接清理完成，自动化回归通过；两项非阻断 minor 已登记为 p102 / p103。
