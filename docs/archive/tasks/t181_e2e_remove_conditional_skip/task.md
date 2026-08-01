---
tid: "t181"
slug: "e2e_remove_conditional_skip"
title: "取消 e2e 条件 skip（I23）"
status: "done"
branch: "t181_e2e_remove_conditional_skip"
worktree: ""
review_level: "full"
diff_anchor: "ed238e9d2e3a011c784f4db1a5820097b640b83c"
depends_on: ""
conflicts_with: ""
note: "p002"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- SPIKE（实测 synthetic fixture，`MOCK_FIXTURE=synthetic pnpm test:e2e:web`）：6 处条件 skip 现状逐条核实——account_error_badge 因 KIMI 卡已存在而 guard 失效且测试交互前提错误（概览卡默认展开无「展开」按钮、`.error-badge` 在 provider tab 的 ProviderAccountRow 层而非概览卡）；multi_account / popup_card_states 的 guard 已死（gen_synthetic 保证 KIMI enabled+failed connector）；opencode_go 缺 connector（仅 trend 残留）；settings_provider_accounts 的 `.accent-row` 选择器错误（那是外观页强调色，accounts 页是 `.acct-list>.acc-card`）。
- 处置（逐条对应 6 处 skip）：
    1. `synthetic.json` KIMI items 注入 `error`（`last_error→error` 语义，对应 observation-mapping.ts:42 T028）；`account_error_badge.spec.ts` 改写为切 Kimi tab 断言 `.error-badge`（原「展开卡」交互前提错误）。
    2. `synthetic.json` 补 opencode_go connector（2 workspace × rolling/weekly/monthly，窗口文案 滚动/一周/一月 与真实 connector.ts 的 normalized_label 一致）；`opencode_go_usage.spec.ts` 删 guard。
    3. `settings_provider_accounts.spec.ts` 选择器 `.accent-row` → `.acct-list .acc-card`。
    4. `multi_account.spec.ts` / `popup_card_states.spec.ts` 删失效 guard（gen_synthetic 保证 KIMI connector / enabled+failed connector）。
- 验证：synthetic 全量 web e2e 48 passed 0 failed 0 skipped（修复前 1 failed 2 skipped）；typecheck / lint 绿。
- 备注：`synthetic.json` 为手工补充（gen_synthetic.mjs 在「非范围」禁改），下次 `e2e:gen-synthetic` 重生成会覆盖这些手工条目——如需持久需另立 task 更新生成器。

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

### Round 1 (2026-08-01 16:05 UTC+8)

Round 1 code 2 条 minor、test 1 条 minor（两路 f001 同根因，code 侧已一并处置）。

| finding_id     | severity | status | rationale                                                               | fix_ref                           |
| -------------- | -------- | ------ | ----------------------------------------------------------------------- | --------------------------------- |
| t181_code_f001 | minor    | 已修   | 3 处 spec 头注释改为「手工补充 synthetic.json」，指向 p021；p021 已登记 | tests/e2e/web/\*.spec.ts          |
| t181_test_f001 | minor    | 已修   | 同上，gen_synthetic 重生成覆盖问题登记 p021                             | docs/pending.md p021              |
| t181_code_f002 | minor    | 已修   | synthetic.json 恢复 4 空格缩进，消除 3358→310 行噪音 diff；语义仅 6 处  | tests/e2e/fixtures/synthetic.json |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC1——6 处条件 skip 逐条处置（见实施笔记），`tests/e2e/web/` 无 `test.skip` 残留；AC2——可补 fixture 的 5 处用例在 synthetic 下真实运行通过（account_error_badge 改写为切 Kimi tab、multi_account 删 guard、opencode_go 补 connector、popup_card_states 删 guard、settings_provider_accounts 修正选择器）；AC3——skip 改为显式断言/守卫删除，CI 可见；synthetic 全量 web e2e 48 passed 0 failed 0 skipped（修复前 1 failed 2 skipped），全量 vitest 1965 passed、typecheck/lint 绿。

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：PASS

### 结果摘要

- 6 处 web e2e 条件 skip 全部转正：补 synthetic fixture（KIMI item.error + opencode_go connector）+ 改写 account_error_badge 目标层 + 修正 settings accounts 选择器 + 删 3 处失效 guard，synthetic 全量 48 绿 0 skip。gen-synthetic 重生成覆盖手工条目登记 p021，sparkline 系统性 fixture 不一致登记 p022。
