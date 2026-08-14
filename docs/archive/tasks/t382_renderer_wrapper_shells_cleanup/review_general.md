# Task review t382（reviewer_focus: 通用）

- task：`t382_renderer_wrapper_shells_cleanup`
- spec：`docs/tasks/t382_renderer_wrapper_shells_cleanup/spec.md`
- diff_anchor：`2a3190206338e917080524c6f15b9cc40000b204`
- target：`git diff 2a3190206338e917080524c6f15b9cc40000b204`
- round：1
- reviewed_at：2026-08-15 04:22 UTC+8

## Findings

### t382_gen_f001 - spec 范围区列出的 CpaAddDialog 调用方不存在，实际迁移 5 处（全部现有调用方）

- 严重度：minor
- 锚点：spec 范围区「SecretInput 的 6 处调用方（CpaAddDialog/CpaConnectorSettings/SettingsForm/CpaMgmtForm/ExaServiceKeyForm/ApiKeyForm）」
- 位置：`docs/tasks/t382_renderer_wrapper_shells_cleanup/spec.md` 范围区；`src/renderer/components/add_account/`
- 问题：`CpaAddDialog` 在 diff_anchor 提交与当前工作区均不存在（`grep CpaAddDialog` 零命中，`add_account/` 下为 ApiKeyForm/LocalScanForm/SessionForm/VendorPicker），该组件已被 `AddAccountDialog` + forms 重构取代。实际 SecretInput 调用方为 5 处（CpaConnectorSettings/SettingsForm/ApiKeyForm/CpaMgmtForm/ExaServiceKeyForm），全部已迁移到 `ui/SecretInput`，无遗漏。spec 的调用方清单与代码不一致。
- 建议：改 spec 范围区，将调用方数更正为 5 处并删除 CpaAddDialog 引用（处置为改 spec，不判 blocking）。

### t382_gen_f002 - general_section 4 处 Toggle→Switch 迁移后不再输出 `data-on` 属性

- 严重度：minor
- 锚点：AC-002/AC-003「行为不变」
- 位置：`src/renderer/views/settings-view/sections/general_section.tsx`（launchAtLogin / minimizeToTray / pinToTop / uiDesensitizeRemarks 四处 Switch）
- 问题：旧 `settings/Toggle` 壳在渲染 `ui/Switch` 时透传 `data-on={on ? "1" : "0"}`；迁移后直接用 `ui/Switch` 未传 `data-on`，DOM 上该属性不再输出。全仓核查无消费者：globals.css 无 `data-on` 选择器，src 中 `data-on` 仅存在于 CpaConnectorSettings/SettingsForm/AccountRow/CpaCard（这些显式传 `data-on`，未受影响），测试仅在 `cpa_connector_settings.test.tsx` / `settings_form.test.tsx` 断言 data-on（均针对显式传该属性的组件）。故无可观察行为回归，AC-002/AC-003 成立。
- 建议：无需修复；如未来测试/e2e 需定位设置页开关，改用 `role=switch` 或语义测试 id。仅作变更透明性提示。

### t382_gen_f003 - 背景来源 pending 条目 p150 仍描述已删三壳

- 严重度：minor
- 锚点：文档一致性
- 位置：`docs/pending/todo/p150_popup_titlebar_panel_button_order.md:55-57`
- 问题：p150 作为本 task 的来源背景文档，仍描述 `components/SecretInput.tsx` / `settings/Select.tsx` / `settings/Toggle.tsx` 三个已删壳的 API 形态。非代码 import（AC-001 的 grep 零匹配已独立复现，仅 `ui/index.ts` barrel re-export `ui/SecretInput` 本体，属预期），但文档描述已过时。
- 建议：按仓库流程在 task-work 收尾闭环时经 `pending.py archive` 归档 p150（不属本 diff 范围，非 blocking）。

## 结论

- 前轮 finding 复核：本轮为 Round 1，无。
- 本轮新发现：3 条（均 minor）
- 未进表的提示：无
- 总体判断：三壳删除彻底（AC-001），5 处 SecretInput 调用方 onChange(value)→event 适配正确且脱敏/显隐行为由 `ui/SecretInput` 本体保证（AC-002），2 处 Select 内联 options + onChange(event) 值回传一致、4 处 Switch checked/onChange 语义等价（AC-003），`tsc --noEmit` / `eslint --max-warnings=0` / `vitest`（3151 passed / 9 skipped / 1 file skipped）全绿（AC-004），`ui/` 组件本体零改动。仅 3 条 minor（spec 调用方清单含已不存在的 CpaAddDialog、general_section 开关不再输出无消费者的 data-on、p150 背景文档待归档），无 critical / important，判定 PASS。
- 系统性 follow-up：无

verdict: PASS
reviewed_scope: 8f87a383c2b887d6
