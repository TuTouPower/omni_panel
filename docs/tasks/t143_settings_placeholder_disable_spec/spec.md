# Task spec

## 背景

review_20260726_054747 采纳项 28、29、30：「清除本地用量缓存」「重置应用」为设计占位、可点击无反馈；TokenStatsView 用 localStorage 独立持久化未文档化。

## 范围

- `data_section.tsx` 两按钮加 `disabled` 与「暂未开放」提示；在 bugs.md 或对应 spec 记录功能待定义。
- token-stats spec 明确该窗口偏好独立持久化、不随主配置导入导出。

## 非范围

- 不实现清除/重置逻辑；不迁移 localStorage 到 config store。

## 验收标准

- [ ] 两按钮 disabled 且显示「暂未开放」。
- [ ] 占位功能待定义已记录。
- [ ] token-stats spec 声明独立持久化策略。

## 依赖与约束

- 重置/清除功能实现另行立项。
