---
tid: "t328"
slug: "session_library_infinite_scroll"
title: "会话库加载更多改无限滚动(滚到底自动加载)"
status: "done"
branch: "t328_session_library_infinite_scroll"
worktree: ""
review_level: "full"
diff_anchor: "99048f7b0b278110a7931e455bcdbcb107b58860"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

## 实施

- **实现（滚到底自动加载）**：`SessionList.tsx` 新增 `on_scroll_to_bottom` 回调与 `SCROLL_END_THRESHOLD = 120`；网格/列表两个滚动容器（`.library-grid` / `.library-list`）都挂 React `onScroll`，触底条件 `scrollTop + clientHeight >= scrollHeight - 120` 时调用回调。React 合成事件在根容器捕获代理、卸载自动解绑——无手动 addEventListener，StrictMode 双挂载不泄漏。
- `SessionLibrary.tsx`：删除「加载更多」按钮渲染、`loading_more` state、`can_load_more` 派生；保留 `load_more` 数据逻辑不变（offset 分页、`has_more` 终止、`load_more_inflight_ref` 并发锁），仅把触发从按钮 onClick 换成 `<SessionList on_scroll_to_bottom={load_more} />`。reset effect 仍重置 `load_more_inflight_ref`/`visible`/`has_more`（AC-005 复用）。content_mode 分支（`content_sessions.length <= visible` 时 bump visible）未改，随滚动继续生效。
- **并发/终止**：滚动多次触底时 `load_more` 的 `!has_more || load_more_inflight_ref.current` 守卫原样拦截重复请求（AC-003/004）。
- **SPIKE 结论**（spec 上下文区 UNVERIFIED-SPIKE 已改写）：`SessionList` 是 web/Electron 同源组件，滚动容器为普通 div，React `onScroll` 跨平台一致。web e2e 在真实 Chromium 派发原生 scroll 验证触发通过（网格 + 列表两视图）。
- **Finalization**：`docs/specs/ai-cli-token-stats-ui.md` 中「会话库分页交互描述（按钮→无限滚动）」**不存在**——该 spec 只描述旧 TokenStatsView/SessionTable（虚拟滚动前端分页），不含会话库「加载更多」按钮描述，故无内容可更新（spec「若存在」条件不满足）。
- **黑盒**：`pnpm test` 2978 passed（9 skipped）；`npx tsc --noEmit` 通过；`MOCK_FIXTURE=synthetic playwright test --project=web` 87 passed（含新增 `session_library_infinite_scroll` 2 用例 + 改造 t327 `session_library_grid_squash` 滚动加载）；eslint / prettier 干净。
- **测试变更**：单测 `SessionLibrary.test.tsx` 中 6 处「加载更多」按钮点击改为滚动触底（`scroll_to_bottom` helper，jsdom 下 scrollHeight/clientHeight 为 0 → 任意 scroll 事件命中触底条件）；「快速双击不重复请求」「旧请求不释放并发锁」按新语义改写；新增 AC-001/003/004/005/006 用例（36 → 原 34 + 新 2，实际改写若干）。t327 e2e 的加载循环由点击按钮改为滚动触底，卡片高度断言原样保留。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-12 22:50 UTC+8)

| finding_id     | severity | status | rationale                                                                        | fix_ref                                                                        |
| -------------- | -------- | ------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| t328_code_f001 | minor    | 已修   | SessionList 挂载后检查首屏是否溢出，溢出则主动触发一次加载（无 scroll 事件边界） | src/renderer/components/session-library/SessionList.tsx:61-72                  |
| t328_code_f002 | minor    | 已修   | content 搜索分支加 inflight 锁（原死守卫），滚动突发不再叠加                     | src/renderer/components/session-library/SessionLibrary.tsx:158-165             |
| t328_test_f001 | minor    | 已修   | 补「非底部滚动不触发加载」单测（scrollTop 未达阈值无请求）                       | tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:204-222 |
| t328_test_f002 | minor    | 已修   | 补「筛选重置后触底继续加载」单测（offset 归 0 后滚底加载第 2 页）                | tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:224-252 |

### Round 2 (2026-08-12 22:55 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                                                  | fix_ref                                                       |
| -------------- | --------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| t328_code_f003 | important | 已修   | 首屏挂载 effect 条件写反（溢出时预取）修正为「不溢出（scrollHeight ≤ clientHeight）且 clientHeight>0」才主动加载，溢出靠滚动；jsdom 0 布局跳过防单测误触发 | src/renderer/components/session-library/SessionList.tsx:61-72 |

f002 残余说明：content 分支 inflight 锁 + queueMicrotask 释放，突发滚动最终收敛到全量展示（本地分页无网络请求），残余无实际危害（Round 1 已修，此处补充机制说明）。

### Round 3 (2026-08-12 23:00 UTC+8)

| finding_id     | severity | status | rationale                                                                                   | fix_ref |
| -------------- | -------- | ------ | ------------------------------------------------------------------------------------------- | ------- |
| t328_code_f004 | minor    | 遗留   | 极端大屏（~3900px 视口）下自动加载第 2 页后仍不溢出的 mount 重查未实现，概率极低；登记 p146 | p146    |

### Round 3 (2026-08-12 23:06 UTC+8)

| finding_id     | severity | status | rationale                                                                                   | fix_ref |
| -------------- | -------- | ------ | ------------------------------------------------------------------------------------------- | ------- |
| t328_test_f003 | minor    | 遗留   | 首屏不溢出补加载路径 jsdom/e2e 均不可达、零覆盖（f003 修复分支）；覆盖扩展非阻断，并入 p146 | p146    |

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id | severity | status | rationale | fix_ref |
| ---------- | -------- | ------ | --------- | ------- |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001 无按钮断言（单测+e2e）；AC-002/003 滚动加载 + has_more 停止（e2e）；AC-004 并发锁（单测）；AC-005 重置（单测）；AC-006 两视图（e2e）；全量 2980 passed；详见 handoff.json ac_evidence

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：FAIL（f003）
- Round 2 test：PASS
- Round 3 code：PASS
- Round 3 test：PASS

`single`：

- N/A

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`（p146）。

### 结果摘要

- 会话库移除「加载更多」按钮，改滚动触底自动加载（grid/list 两视图）；has_more/inflight 守卫防重复与并发；首屏不溢出挂载主动补加载；补 e2e + 单测
