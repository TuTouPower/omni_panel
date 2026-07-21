# Task plan

## 步骤与验证

1. config types/schema 加两字段 + 迁移 → 验证：config schema 单测（旧 config 兼容）
2. Icon.tsx 注册新 icon（自画 SVG） → 验证：icon 渲染单测
3. 账号设置「数据标签映射」旁加 toggle 按钮（tooltip + 持久 upcomingResetOff） → 验证：组件测 toggle + IPC save
4. 常规设置阈值 input → 验证：组件测留空= null / 填数= number
5. UpcomingReset 面板过滤逻辑（读阈值 + 开关 + 周期） → 验证：过滤纯函数单测（含阈值 null / 监控关 / 无周期 / 达标各分支）
6. 集成：PopupView 接通过滤结果 → 验证：renderer 测
7. pnpm test/typecheck/check 绿 + 手动验证阈值边界

## 风险与回退

- 周期算法无 prevResetAt 时的 fallback（30 天）可能不准 → 标注为近似，后续 provider manifest 声明 defaultResetCycleDays 改进
- 自画 icon 风格需对齐 VendorMark/Icon 体系 → 参考现有 UI_ICONS 风格
- t005 面板改过滤逻辑勿动视觉 → 只改数据源，CSS/结构不变
- 回退：分支可丢弃

## Finalization 时更新的 blueprint

- `docs/specs/ui-views-web.md`：PopupView UpcomingReset 过滤逻辑 + SettingsView 新控件
- `docs/specs/config-store.md`：两新字段
- `docs/specs_index.md`：t041 收尾累积
