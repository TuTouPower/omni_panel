# Task plan

## 步骤与验证

1. 读 settings_view 6 case，确认 4 web / 2 electron 划分 → 验证：分类
2. 拆 settings_view：web 4 case 新建 web/settings_view.spec.ts；electron 版删 web case 留 2 case
3. 评估 popup_token_panel（VITE_ENABLE_TOKEN_PANEL=1 是否 web 可设）→ 迁 web 或留 electron + log
4. 删 electron/popup_theme（web 版为准）
5. `pnpm test:e2e:web` 跑绿
6. review×2 + adoption + task_report + 归档 + commit

## 风险与回退

- 风险：settings_view web case 实际跑红（DOM 差异）→ 该 case 回 electron
- 风险：popup_token_panel 需特殊 build → 留 electron

## Finalization 时更新的 blueprint

- 无
