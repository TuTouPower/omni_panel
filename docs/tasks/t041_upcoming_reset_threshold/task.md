---
tid: t041
slug: upcoming_reset_threshold
diff_anchor: "d38f3fb"
branch: t041_upcoming_reset_threshold
---

# Task t041_upcoming_reset_threshold

过程总账。

## 过程记录

- 需求：账号级「是否监控即将重置」开关 + 全局百分比阈值 + 面板按阈值/开关过滤。
- diff_anchor = 3940848（main HEAD，t037）。
- 待用户审批执行（spec/plan 写完即止）。

## Review 处置

### Round 1 (2026-07-22 04:10 UTC+8)

code=FAIL（6 finding），test=FAIL（3 finding）。

| finding_id     | severity  | status | rationale                                                                                                | fix_ref                                            |
| -------------- | --------- | ------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| t041_code_f001 | important | 遗留   | `SettingsView.tsx` 2349 行超 important 阈值，本 task 净增 107 行；拆分属独立 refactor task               | `src/renderer/views/SettingsView.tsx`              |
| t041_code_f002 | minor     | 已修   | PopupView threshold 非空判断 verbatim 重复；抽局部变量复用                                               | `src/renderer/views/PopupView.tsx`                 |
| t041_code_f003 | minor     | 已修   | `apply_config` 依赖数组遗漏新 setter；补齐                                                               | `src/renderer/views/PopupView.tsx`                 |
| t041_code_f004 | minor     | 已修   | 直连 VendorCard toggle 只取 items[0]，多账号漏切；按 accountKey 逐账号匹配                               | `src/renderer/views/SettingsView.tsx`              |
| t041_code_f005 | minor     | 已修   | `upcomingResetThresholdPercent` zod 缺数值约束；加 `min(0).max(100)`                                     | `src/main/core/config/types.ts`                    |
| t041_code_f006 | minor     | 已修   | overview/无 item 时 bell 按钮 no-op；无可用账号时隐藏按钮                                                | `src/renderer/views/SettingsView.tsx`              |
| t041_test_f001 | important | 已修   | AccountRow bell 按钮（on_toggle_upcoming/aria-pressed/tooltip/点击）零断言；补 provider_account_row 测试 | `tests/unit/renderer/...provider_account_row...`   |
| t041_test_f002 | important | 已修   | SettingsView 阈值 input（留空 null/填数 number/持久化）零断言；补 settings_view 测试                     | `tests/unit/renderer/views/settings_view.test.tsx` |
| t041_test_f003 | important | 已修   | PopupView threshold null -> Banner/Rail 不渲染零断言；补 null 路径测试                                   | `tests/unit/renderer/views/popup_view.test.tsx`    |

### Round 2 (2026-07-22 04:30 UTC+8)

code=PASS（f002-f006 已修确认，0 新发现），test=PASS（f001-f003 已补确认，0 新发现）。零 finding，未进处置表。

## 收尾报告

SHA 由 `git log --grep t041` 查。

### 验收标准勾选

- [x] config schema 含 `upcomingResetThresholdPercent`（int 0-100 nullable）+ `accountOverrides.upcomingResetOff`，旧 config 兼容（单测 config-schema.test.ts）
- [x] 账号行 bell toggle 按钮（tooltip「是否监控即将重置」、aria-pressed、点击持久化；无可用账号隐藏）（单测 account_row/vendor_card/cpa_card）
- [x] 常规阈值 input（留空 null、填数 number、持久化 save_config）（单测 settings_view 4 case）
- [x] threshold null -> Banner/Rail 不渲染（单测 popup_view null 路径）
- [x] threshold 非 null + 账号剩余% <= 阈值 + 监控开 -> 进面板（单测 upcoming_resets）
- [x] 监控关账号不进面板（单测 upcoming_resets offAccounts 过滤）
- [x] 无符合账号 -> 面板空态（Banner/Rail 现有空态保留）
- [x] config schema 单测 + 面板过滤单测 + 账号按钮/常规输入组件测（全补齐）
- [x] `pnpm test` 1465 全绿；typecheck/lint/format 过
- [x] 真实打包启动验证：`pnpm package` exit 0、exe 启动、local-api health ok

### Reviewer verdict

- Round 1 code：FAIL
- Round 1 test：FAIL
- Round 2 code：PASS
- Round 2 test：PASS

### 遗留

- `t041_code_f001`（important）：`SettingsView.tsx` 2384 行超阈值，拆分属独立 refactor task。
- t041 spec 周期算法简化：用 `cycleDurationMs`（不推 prevResetAt 历史）；无 cycleDurationMs 账号不进面板。

### 结果摘要

「即将重置」加全局百分比阈值（null 不展示）+ 账号级开关；过滤改用剩余%（周期取 cycleDurationMs）。
