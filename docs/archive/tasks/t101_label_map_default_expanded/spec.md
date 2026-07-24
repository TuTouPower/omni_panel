# Task spec

## 背景

设置页账号编辑弹窗中「数据标签映射」默认折叠，用户必须每次点击 chevron 才能看到标签编辑行。用户明确要求：不准默认折叠，取消那个折叠按钮，全部展开。

位置：`src/renderer/components/SettingsForm.tsx:77` `useState(false)` + `:498-515` chevron toggle button。

## 范围

- `labelMapExpanded` 初始值改 `true`。
- 删除 chevron 折叠按钮（`:498-515`），「数据标签映射」标题保留为静态 label。
- 保留标签行渲染（`labelRows` / 加载态 / 空态）。

## 非范围

- 不改标签编辑行内部 UI（`lm-row` / `lm-input` / bell toggle）。
- 不改 `onSaveLabelMap` 持久化逻辑。

## 验收标准

- [ ] 打开任一支持 label map 的账号编辑弹窗，「数据标签映射」区直接展开显示标签行，无需点击。
- [ ] 弹窗中不再出现折叠/展开 chevron 按钮。
- [ ] 加载中、空态（无可映射标签）仍正常显示。
- [ ] `pnpm test` 全量通过。

## 依赖与约束

- 无。
