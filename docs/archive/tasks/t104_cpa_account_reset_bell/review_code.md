# Task review t104（reviewer_focus: 代码）

- task：`t104_cpa_account_reset_bell`
- spec：`docs\tasks\t104_cpa_account_reset_bell/spec.md`
- diff_anchor：`d1b3925e8acb449e3c6d9206dc5249a77c5f9380`
- target：`git diff d1b3925e8acb449e3c6d9206dc5249a77c5f9380`
- round：1
- reviewed_at：2026-07-25 18:55 UTC+8

## Findings

### t104_code_f001 - 继续向超大 SettingsView 堆叠逻辑

- 严重度：important
- 位置：`src/renderer/views/SettingsView.tsx:2244-2285`
- 问题：`SettingsView.tsx` 物理行数为 2347，已超过实现源码 800 行的 important 阈值；本 task 在其中净增 22 行，将 CPA 标签弹窗的监控状态查询、全量聚合切换和持久化逻辑继续写入该超大组件。diff 与 task 文档未给出必须保持单文件的硬约束。后续新增标签弹窗行为仍需在这个承担设置导航、直连账号、CPA 管理及多个对话框渲染职责的组件中定位和修改，容易与相邻配置保存路径混淆或遗漏同步。
- 建议：将 CPA 标签映射弹窗及其监控切换回调提取为职责单一的组件或 hook，`SettingsView` 只保留状态入口和渲染挂载。

## 结论

- 本轮新发现：1 条。
- 总体判断：bell 的状态聚合和持久化实现符合 spec，但超大 `SettingsView` 的继续膨胀不满足文件规模门槛。

verdict: FAIL

## Round 2 (2026-07-25 19:07 UTC+8)

## Findings

- 无。

## 结论

- 前轮 finding 复核：`t104_code_f001` 已修。`src/renderer/views/SettingsView.tsx` 从 diff anchor 的 2325 行降至 2303 行，本 task 对该文件净减 22 行；CPA 标签映射的状态读取、切换和持久化逻辑已移至 `src/renderer/components/CpaLabelMapDialog.tsx:24-69`，`SettingsView` 仅保留挂载与状态入口（`src/renderer/views/SettingsView.tsx:2234-2245`）。
- 本轮新发现：0 条。
- 总体判断：修复后的职责拆分符合文件规模门槛，新增实现满足 spec 的 bell 渲染、全 accountKey 聚合切换与既有配置持久化约束。

verdict: PASS

## Round 3 (2026-07-25 03:24 UTC+8)

## Findings

- 无。

## 结论

- 前轮 finding 复核：`t104_code_f001` 持续已修。`src/renderer/components/CpaLabelMapDialog.tsx` 承担 CPA 标签映射的监控状态读取、按全部 `account_keys` 的 add/remove 与持久化；`SettingsView` 保持净减 22 行，未继续向超阈值文件增加实现。
- 本轮新发现：0 条。
- 总体判断：实现符合全部 AC；未发现规格偏离、正确性、错误处理、边界条件、重复逻辑、复杂度或文件规模问题。

verdict: PASS

## Round 4 (2026-07-25 19:38 UTC+8)

## Findings

- 无。

## 结论

- 前轮 finding 复核：`t104_code_f001` 持续已修。`CpaLabelMapDialog` 保持 CPA 标签映射的状态读取、按全部 `account_keys` 聚合切换与持久化职责，`SettingsView` 未重新增加该逻辑。
- Round 3 后 lint 修正复核：`CpaLabelMapDialog.tsx:59-61` 的全量监控判定将每个 `account_key` 缺失记录明确归为 `false`；现有可选链与空合并优先级正确，部分监控时不会误判为全部已监控。改动文件 ESLint 通过，未改变 add/remove 聚合语义。
- 本轮新发现：0 条。
- 总体判断：实现继续满足全部 AC；未发现规格偏离、正确性、错误处理、边界条件、重复逻辑、复杂度或文件规模问题。

verdict: PASS
