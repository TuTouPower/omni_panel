---
tid: "t222"
slug: "sparkline_window_persist"
title: "sparkline 窗口选择持久化"
status: "done"
branch: "t222_sparkline_window_persist"
worktree: ""
review_level: "single"
diff_anchor: "a43f566533a1bfbce3437e1f8e347fcc503cd2b2"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

Step 1 前置：`{doctor_cmd}` 无（blueprint 声明无独立 doctor）。

执行期（2026-08-05）：

- 决策：setter 下传链（PopupView state → ProviderAccountList → ProviderAccountRow props），不走 ProviderAccountRow 自管 config.get/save。理由：全局共享偏好（AC-4）天然由 PopupView 持有，且复用 patchConfig 防抖持久化链；t153 防回显由 apply_config「值相等不重设 state」保证。
- `AppConfiguration` + `appConfigurationSchema` 增 `sparklineWindowDays?: number`（z 校验 1-365，可选，DEFAULT_CONFIGURATION 不含 → 缺省 7）。
- ProviderAccountRow：`sparklineWindowDays = 7` prop 作初始 state；`handle_window_change` 本地 set + `onSparklineWindowChange(days)` 上抛。
- PopupView：`sparkline_window_days` state（默认 7），apply_config 从 config 读入（值不等才 set，防回显），effect patchConfig 写回；传 props 给 ProviderAccountList（is_live 才绑 change handler）。
- 测试：config-schema 接受 1-365 / 拒绝越界；provider_account_row 偏好从 config 读初始值 + 变更通知 + 缺省 7 天；popup_view 既有 32 tests 回归。
- 验证：整批 `pnpm test` 连跑 3 次全绿（222 files / 2358 passed）；typecheck / lint 通过。

创建期核实（2026-08-05，只读仓库）：

- `ProviderAccountRow.tsx:81` `const [trend_days, set_trend_days] = useState(7)`，`:118` bulk 请求 `days: trend_days`。session 内状态，重启回 7。
- config 持久化链路：PopupView `usePopupUiConfig` 经 `patchConfig` → `create_debounced_config_patcher` 调 `config.save`。ProviderAccountRow 是 ProviderAccountList 深子树，未接 patchConfig——执行期需决定把 setter 下传还是组件内自管 `config.get/save`（防广播回显，参照 t153 collapse 的 prev_ref 模式）。
- `AppConfiguration`（config.ts:35-90）有 per-view 偏好先例（collapsedAccounts/expandedProviders 等），新增 `sparklineWindowDays` 字段对齐模式。

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

### Round 1 (2026-08-06 08:45 UTC+8)

Round 1 FAIL（f001 critical + f002 important + f003 minor）→ Step 6 处置（f001 改代码、f002 补测试）→ 重新走完整 Step 3→5。Round 2 需重新渲染 review prompt 派发复核。

| finding_id    | severity  | status | rationale                                                                        | fix_ref                    |
| ------------- | --------- | ------ | -------------------------------------------------------------------------------- | -------------------------- |
| t222_gen_f001 | critical  | 已修   | apply_config 改函数式 setter + 依赖数组移除 state，窗口切换不再回读闪回/错持久化 | PopupView.tsx:apply_config |
| t222_gen_f002 | important | 已修   | popup_view_config 补持久化往返用例（读回 1 激活 + 切 30 save + 无闪回断言）      | popup_view_config.test.tsx |
| t222_gen_f003 | minor     | 已修   | schema 越档值三按钮无 active——接受现状，spec 风险节记录                          | spec.md:风险与回退         |

### Round 2 (2026-08-06 00:50 UTC+8)

Round 2 复核：f001/f002/f003 均经 diff 与实跑核实真修；新发现 f004（minor）。

| finding_id    | severity | status | rationale                                                                                             | fix_ref                                |
| ------------- | -------- | ------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------- |
| t222_gen_f004 | minor    | 已修   | write-back effect 加判空守卫（config 读入值存在才写回），消除 mount 无条件写默认值 7 的多余 save/广播 | PopupView.tsx:sparkline persist effect |

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
    - AC-1（重启保持）：config-schema 接受 sparklineWindowDays；popup_view_config 持久化往返用例（config 含 1 → 渲染激活 1 天 → 切 30 → config.save 收 30）；apply_config 函数式 setter 消除窗口切换回读闪回（f001 修复）。
    - AC-2（未设置默认 7 天）：provider_account_row 缺省用例断言 7 天按钮激活 + getBulk days=7。
    - AC-3（config 持久化链路 + 其它面板不受影响）：patchConfig → create_debounced_config_patcher → config.save；既有 popup_view 32 tests + config-schema 全部回归绿。
    - AC-4（多账号共享全局偏好）：偏好由 PopupView state 持有、props 下传全部账号行，单一全局值。
    - typecheck / lint 通过。

### Reviewer verdict

- Round 1 general：FAIL（f001 critical + f002 important + f003 minor）
- Round 2 general：PASS（f001/f002/f003 已修核实，新发现 f004 minor 已修）

### 结果摘要

p046 sparkline 窗口偏好持久化完成：config 新增 sparklineWindowDays（全局共享、缺省 7 天），PopupView 读入/写回防回显，窗口切换不再闪回；Round 1 FAIL 经函数式 setter + 持久化往返测试修复后 Round 2 PASS。
