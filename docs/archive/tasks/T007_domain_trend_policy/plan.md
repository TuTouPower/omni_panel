# Task plan

## 步骤与验证

1. 读 `domain.md §6` 定位「不做趋势图 UI」原文与上下文 → 验证：确认该条目所在段落、是否与其他产品边界条目并列。
2. 改写该条目为「账号展开区出近 7 天 sparkline（迷你走势，`TrendSparkline` 组件）；完整多维趋势（柱状/热力/区间选择）仍由 TokenStats 独立窗口承担」 → 验证：改写后 §6 不再含「不做趋势图 UI」字样；措辞限定到 sparkline 级别。
3. `decisions.md` 新增条目：格式对齐既有决策；含「日期 / 旧决策（domain §6 第一版不出图）→ 新决策（账号展开区 sparkline）/ 理由（observation-store 已有历史、账号级迷你走势提升一眼可读性、完整趋势仍归 TokenStats）/ 影响范围（T006）」 → 验证：条目字段齐全、可被 T006 引用。
4. T006 spec.md「依赖与约束」段增「前置 T007（domain §6 政策修订 + decisions 决策条目）」 → 验证：T006 spec 引用本 task。
5. `pnpm check`（format/lint，含 prettier 对 md 的校验） → 验证：通过。

## 风险与回退

- 风险：`domain.md §6` 改写措辞过宽，被误读为「全面放开趋势图」，后续 task 纷纷加图。
    - 回退：措辞严格限定「账号级 sparkline」+「完整趋势仍归 TokenStats」双句；必要时在条目末尾加「其他趋势图需求另开 task 评估」。
- 风险：`decisions.md` 日期/格式与既有条目不一致。
    - 回退：对照 `decisions.md` 既有条目结构补齐字段。

## Finalization 时更新的 blueprint

- `docs/blueprint/domain.md §6`：本 task 直接修订（条目改写）。
- `docs/blueprint/decisions.md`：本 task 直接新增决策条目。
- 注：本 task 自身即长期真相更新，Finalization 主要是确认上述两处已落地、可被 T006 引用。
