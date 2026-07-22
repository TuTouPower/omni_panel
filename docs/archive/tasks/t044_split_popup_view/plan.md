# Task plan

## 步骤与验证

1. 盘点 PopupView 各逻辑块行数与耦合，定抽离边界（hook vs 子组件）。 → 验证：列出抽取清单 + 目标行数。
2. 抽 hook（toggle / 派生 / refresh），PopupView 引用。 → 验证：typecheck + 单测（hook 独立测）。
3. 黑盒：`pnpm test` + 主面板行为手工回归（渲染/刷新/即将重置/metric toggle/拖拽）。 → 验证：通过。
4. 双审 + 收尾。

## 风险与回退

- 风险：闭包依赖漏传导致 stale closure / 行为回归 → 逐 hook 列依赖数组 + 回归测试。
- 风险：抽取后 PopupView 仍 >800（抽得不够）→ 扩大抽取范围或拆子组件。
- 回退：revert hook 抽取，恢复单文件。

## Finalization 时更新的 blueprint

- `docs/specs/ui-views-web.md`：PopupView 结构（新增 hook/子组件说明）。
- `docs/blueprint/architecture.md`：若目录结构变化。
