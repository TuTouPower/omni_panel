---
tid: "t311"
slug: "web_panel_nav_buttons_middle_click"
title: "web 端面板跳转/外链按钮支持中键新开标签页（原生 a href）"
status: "done"
branch: "t311_web_panel_nav_buttons_middle_click"
worktree: ""
review_level: "full"
diff_anchor: "36245c06c7fb0ceb60a1a931337f6e3a580a7972"
depends_on: "t307,t313"
conflicts_with: "t312"
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- TDD 红→绿：先加 web 态断言（PanelTitleBar 互跳 A/#usage|#session|#setting、popup TitleBar 三 link、about 外链 a target/rel、EmptyState `#setting`），红阶段 3 个新用例失败；实现后绿。
- 路由值核对：`use-route.ts` VALID_ROUTES = usage/setting/agent/tray/session；App.tsx 挂载 usage→PopupView、setting→SettingsView、agent→TokenStatsView、session→SessionShell。PanelTitleBar 显式映射 Settings→setting（非 toLowerCase），与 t313 后 hash 一致。
- t307 遗留 web 用例处置（语义被 t311 推翻，按纪律整体删除/迁移，未就地改预期）：
    - 单测 `opens session history from the title bar button in web mode`（断言 open("","","") 被调）整体删除；`renders the session history button in web mode` 角色断言 button→link（同一功能迁移，注释写明）。
    - web e2e `session history button dispatches onFocus and enters #session route` 整体删除（左键不再走 open 桥，d036 前提消失），替换为「左键进入 #session + onFocus 未收到分发」新语义。
- 样式：web `<a>` 复刻对应 Button 的 class（icon/primary/secondary）+ `no-underline` + 继承色（`text-[var(--color-on-surface-variant)]` 等），沿用 `[-webkit-app-region:no-drag]` 动作区（web 无窗口控制，无冲突）。
- about 卡片：「检查更新」无外链地址（ABOUT_URLS 无 update 键），web/桌面均保持 Button；外链 7 卡 web 态为 `<a target="_blank" rel="noopener noreferrer">`，桌面态 onClick 调 window.open 不变。
- 桌面端（data-web 缺失）四处入口零改动：PanelTitleBar onNavigate、popup open 桥、about window.open、EmptyState settings.open（AC-005 由既有桌面用例 + 新增 tagName/调用断言覆盖）。
- web e2e 定位迁移：panel_navigation.spec.ts 互跳/隐藏断言 button→link；popup_view.spec.ts / app_lifecycle.spec.ts「设置」改 getByTitle（title 两态一致）；`popup_page.ts clickSettings` 同步 getByRole("button")→getByTitle（页面对象被 electron/web 共用，title 定位两态兼容，桌面语义不变）。
- 位点修正：p137 列出的「PanelTitleBar 互跳」实际分两处——Settings/Session 面板用 PanelTitleBar **panel 形态**（tsx 139-160 区域，onNavigate），Agent 面板（TokenStatsView）用 **通用形态 + 自建 header_actions 互跳按钮**（`navigate(p)`，web e2e 互跳断言实测命中 TokenStatsView）。web e2e 红阶段暴露后补实现 TokenStatsView 三互跳 web 分支（`#setting`/`#usage`/`#session`），组件测试 token_stats_header.test.tsx 补 web 态用例（AC-001 完整覆盖三面板互跳）。
- 验证：全量 `pnpm test` 仅 designmd.test.ts 存量失败（预期，非回归）；typecheck/lint 零告警；web e2e panel_navigation/popup_view/app_lifecycle 16/16 通过。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-12 03:10 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                                                                                                        | fix_ref                                                                                                                       |
| -------------- | --------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| t311_code_f001 | important | 已修   | 4 测试文件 6 处 hasAttribute("onclick") 恒真断言（React 合成事件不渲染 onclick attribute）改可失败断言：点击链接不触发对应 open 桥（onNavigate/window.open/token_stats_open/session_history_open/settings.open） | tests/unit/renderer/{components/PanelTitleBar,views/popup_view,views/settings_view_general,views/token_stats_header}.test.tsx |
| t311_test_f001 | important | 已修   | 同上（恒真断言无意义，e2e hash 切换为无拦截真证据）                                                                                                                                                              | 同上                                                                                                                          |
| t311_code_f002 | minor     | 已修   | about card_class 去掉 Button base 复制的 font-semibold/rounded-md（web <a> 不经 twMerge 致字重回归桌面端），只留意图类                                                                                           | src/renderer/views/settings-view/sections/about_section.tsx:125                                                               |
| t311_code_f003 | minor     | 已修   | 抽 ui/icon-link.ts 导出 ICON_LINK_CLS 公共常量，PanelTitleBar/popup TitleBar/TokenStatsView 三文件 5 处替换                                                                                                      | src/renderer/components/ui/icon-link.ts                                                                                       |

### Round 2 (2026-08-12 03:15 UTC+8)

| finding_id     | severity | status | rationale                                                                                                                                           | fix_ref                                       |
| -------------- | -------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| t311_code_f004 | minor    | 已修   | TokenStatsView 三处 className 多行 prettier 格式（误 git checkout 还原后重建 web 分支 + 按 prettier 规则格式化：Settings/Session 多行、Usage 单行） | src/renderer/views/TokenStatsView.tsx:793-850 |

### Round 3 (2026-08-12 03:30 UTC+8)

code Round 3 PASS（f004 复核真修，0 finding）；test Round 3 PASS（0 finding）。无处置项。

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
- 证据：AC-001/002/003/005/006 由 4 测试文件 82 用例（web 态 `<a>` href/target/rel + 桌面 Button 行为 + 可失败无拦截断言）+ web e2e 16 用例（hash 切换）覆盖；AC-004 静态前提由可失败断言 + e2e，真实中键 [deploy]。详见 `handoff.json` ac_evidence。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：FAIL（f001 important + f002/f003 minor）
- Round 1 test：FAIL（f001 important）
- Round 2 code：PASS（f004 minor）
- Round 2 test：PASS（f001 复核真修）
- Round 3 code：PASS（f004 复核真修，0 finding）
- Round 3 test：PASS（0 finding）

`single`：

- N/A（full 级）

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- web 端面板跳转/外链按钮改原生链接完成：PanelTitleBar/TokenStatsView/popup TitleBar 互跳 + about 外链 + EmptyState 添加服务均 web 分支 `<a href>`（中键/Ctrl+Click 浏览器原生新开），桌面保持 Button；恒真 onclick 断言改可失败断言；AC 六条全绿，review 3 轮 code + 3 轮 test 全 PASS（1 important + 4 minor 均修）。存量 designmd 失败见 p142。
