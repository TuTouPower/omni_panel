---
tid: "t180"
slug: "split_popup_view_and_test"
title: "拆 PopupView.tsx 与 popup_view.test.tsx 及 settings_view.test.tsx"
status: "done"
branch: "t180_split_popup_view_and_test"
worktree: ""
review_level: "full"
diff_anchor: "1e15d1637019532b0889e9d75698b074ce347593"
depends_on: ""
conflicts_with: ""
note: "p009"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- **PopupView.tsx 876→718 行**：`render_body` 内拆出 5 个子组件到 `src/renderer/views/popup-view/`（TitleBar 84 / EmptyState 25 / UpcomingResetCardSlot 75 / NetBanner 19 / SkeletonCard 19），纯渲染 helper（errorMessage/structural_signature/arrays_equal/account_orders_equal/record_bool_equal）与常量（MODULE/log/should_log_raw/token_panel_enabled/popup_mirror_style）移入 `popup-view/lib.ts`（57）。`record_bool_equal` 经 PopupView 继续 re-export 保测试 import 不变。`UpcomingResetCardSlot` 把 is_live/force_collapse 的条件分支收敛进组件，PopupView 侧传裸值。
- **popup_view.test.tsx 1749→358 行**：共享 setup 抽到 `popup_view_test_utils.ts`（FakeResizeObserver/connectorInfo/base_popup_config/mock 变量/install_popup_usageboard()）。按主题拆 4 文件：re_login 226 / config 560 / upcoming 361 / t153 113；config 原 649 行超 600，把 3 个 t153 it 再拆到 popup_view_t153.test.tsx。每个文件独立 vi.mock theme + import utils。
- **settings_view.test.tsx 1772→339 行**：共享 setup 抽 `settings_view_test_utils.ts`（install_settings_usageboard(get_config) 接受 getter 传 `() => current_config`，因 create_instance_and_save 在 createInstance 后读 live config；current_config 留各文件局部 let 避免 TS2608）。按主题拆 4 文件：cpa 455 / watched 165 / accounts 338 / general 375。
- **验证**：views 全 123 测试绿；全量 vitest 195 文件 1965 passed（1 skipped 存量）；typecheck / lint 绿；prettier 仅剩 t175 归档 spec.md 存量格式问题（登记 p019）。
- **踩坑**：vitest 的 `vi.mock` 是 per-file hoisted，拆分文件必须各自复制 theme mock；`act` 须从 `@testing-library/react` 导入（vitest 不导出）；tsc noUnusedLocals 会报被局部变量遮蔽的 import（config 文件删掉未用 config_get/config_save import）。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-01 14:40 UTC+8)

Round 1 code 1 条 minor、test 零 finding（clean review）。

| finding_id     | severity | status | rationale                                          | fix_ref                              |
| -------------- | -------- | ------ | -------------------------------------------------- | ------------------------------------ |
| t180_code_f001 | minor    | 已修   | key 移到 slot（PopupView.tsx:541），删内部失效 key | src/renderer/views/PopupView.tsx:541 |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC1——PopupView.tsx 876→718 行（低于参考 724），子组件 19-84 行 + lib.ts 57 行；AC2——popup_view.test.tsx 1749→358（+4 拆分文件 113-560 行）、settings_view.test.tsx 1772→339（+4 拆分文件 165-455 行），全部 ≤600；AC3——views 全 123 测试绿，全量 vitest 195 文件 1965 passed（1 存量 skipped），typecheck/lint 绿，拆分前后测试总数与断言不变（reviewer 逐字比对）。黑盒：`pnpm check` 除 t175 归档 spec.md 存量 prettier 问题（登记 p019）外全绿。

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：PASS

### 结果摘要

- PopupView.tsx 与 popup_view/settings_view 测试文件按领域拆为多个 ≤600 行文件，共享 setup 抽到 `popup_view_test_utils.ts` / `settings_view_test_utils.ts`，行为零变化；`record_bool_equal` 经 PopupView re-export 保持测试 import 路径。顺手发现 t175 归档 spec.md 存量 prettier 问题登记 p019。
