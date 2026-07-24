# Task plan

## 步骤与验证

1. `SettingsForm.tsx:77` `useState(false)` 改 `useState(true)` → 验证：手工打开任一支持 label map 的账号编辑弹窗（如 deepseek），标签行直接可见。
2. 删除 `:496-516` chevron button 包裹层，「数据标签映射」改为静态 `<label className="ad-label">`；`labelMapExpanded &&` 条件移除，内容直接渲染 → 验证：弹窗中无 chevron 按钮；标签行仍在。
3. 删除未用的 `labelMapExpanded` / `setLabelMapExpanded` state 与 `Icon name="chevron"` import（若无其他使用）→ 验证：lint/tsc 通过。
4. 跑 `pnpm test -- settings_form` 与相关单测；如既有用例断言 chevron 点击行为需同步更新 → 验证：测试通过。
5. `pnpm test` 全量。

## 风险与回退

- 风险：既有测试覆盖 chevron toggle 行为，需一并更新。
    - 缓解：grep `labelMapExpanded` / `chevron` 测试文件，同步修订。
- 风险：「数据标签映射」高度过高挤压其他字段。
    - 缓解：原有内容不变，只是默认展开，用户可滚动。
- 回退：revert commit。

## Finalization 时更新的 blueprint

- 无。
