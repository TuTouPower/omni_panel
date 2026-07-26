# Task spec

## 背景

review_20260726_054747 采纳项 28、29、30、15、16、25、26（合并原 t143/t144）：设置页占位按钮可点击无反馈；TokenStats 独立持久化未文档化；外部链接缺 noopener；托盘分隔符索引硬编码；PopupView refresh_providers 声明顺序陷阱；布尔记录用 JSON.stringify 比较。

## 范围

- `data_section.tsx` 「清除本地用量缓存」「重置应用」加 `disabled` 与「暂未开放」提示；在 bugs.md 或 spec 记录功能待定义。
- token-stats spec 明确该窗口偏好独立持久化、不随主配置导入导出。
- `about_section.tsx` `window.open` 加 `"noopener,noreferrer"`。
- `TrayMenu.tsx` 菜单项加 `separator_before?: boolean`，删 `sep_indexes`，按字段渲染，保持分隔符数量 3。
- `PopupView.tsx` `refresh_providers` 定义移到 `render_body` 前。
- `PopupView.tsx` 新增 `record_bool_equal`，替换两处 `JSON.stringify` 比较；补 key 顺序不同的单元测试。

## 非范围

- 不实现清除/重置逻辑；不迁移 localStorage 到 config store；不提取 PopupBody。

## 验收标准

- [ ] 两占位按钮 disabled 且显示「暂未开放」。
- [ ] token-stats spec 声明独立持久化。
- [ ] 外部链接带 noopener/noreferrer。
- [ ] 托盘分隔符由字段控制，数量不变。
- [ ] refresh_providers 不再先使用后声明。
- [ ] 布尔记录浅比较替换，测试通过。
- [ ] `pnpm test` 通过。

## 依赖与约束

- 重置/清除功能实现另行立项。
