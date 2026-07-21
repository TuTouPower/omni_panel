# Task plan

## 步骤与验证

1. Edit `ui-views.md` L7/L33 route 值 → 验证：grep
2. 补 `ui-views.md` TokenStatsView 章节（参照 `src/renderer/views/TokenStatsView.tsx` 概要） → 验证：grep TokenStatsView
3. Edit `window-management.md` 表格 L9/L10 + 补 agent 行 + L13 URL 顺序 → 验证：读表格含 usage/setting/tray_menu/agent 四行
4. Edit `architecture.md` L103 route 分权值 → 验证：grep
5. Edit `ipc.md` L27 grok route（若涉及 popup） → 验证：grep
6. `pnpm test` 全量 → 验证：全绿（文档不影响代码，回归保护）

## 风险与回退

- 风险：TokenStatsView 章节描述不准（未深读组件）
- 回退：`git checkout docs/`

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md` L103 route 值（本 task 范围内，已含）
