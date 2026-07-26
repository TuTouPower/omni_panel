# Task spec

## 背景

review_20260726_054747 采纳项 15、16、25、26：外部链接缺 noopener；托盘分隔符索引硬编码；PopupView `refresh_providers` 声明顺序陷阱；布尔记录用 JSON.stringify 比较。

## 范围

- `about_section.tsx` `window.open` 加 `"noopener,noreferrer"`。
- `TrayMenu.tsx` 菜单项类型加 `separator_before?: boolean`，删 `sep_indexes`，按字段渲染，保持分隔符数量 3。
- `PopupView.tsx` `refresh_providers` 定义移到 `render_body` 前。
- `PopupView.tsx` 新增 `record_bool_equal`，替换两处 `JSON.stringify` 比较；补 key 顺序不同的单元测试。

## 非范围

- 不提取 `PopupBody`。

## 验收标准

- [ ] 外部链接带 noopener/noreferrer。
- [ ] 托盘分隔符由字段控制，数量不变。
- [ ] `refresh_providers` 不再先使用后声明。
- [ ] 布尔记录浅比较替换，测试通过。
- [ ] `pnpm test` 通过。

## 依赖与约束

- 无。
