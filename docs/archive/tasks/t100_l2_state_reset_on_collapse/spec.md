# Task spec

## 背景

多账号 provider 卡片展开后，用户点「N账号」切到账号明细视图（`l2open=true`）。折叠卡片后再展开，卡片仍停留在账号明细视图，L2 seg 高亮仍停留在「N账号」——用户期望折叠后回到「概览」。

根因：`src/renderer/components/ProviderCard.tsx:119` `const [l2open, set_l2open] = useState(false)` 是组件内 useState，与外部传入的 `expanded` prop 正交但未定义折叠时的语义。折叠时 L2 seg 不渲染但 `l2open` 保留；再展开时沿用旧值。

历史：`804e3c2 feat: card header, L2 segmented control` (2026-06-09) 引入 L2 seg 时留下的设计漏洞。

## 范围

- 折叠（`expanded === false`）时重置 `l2open=false`，再展开回到「概览」。
- 补单元测试覆盖「展开 → 切账号明细 → 折叠 → 再展开」序列，断言回到概览。

## 非范围

- 不把 `l2open` 持久化到 config（用户已明确期望折叠后重置）。
- 不改 L2 seg 的样式或布局。
- 不改 `expandedProviders` 的持久化逻辑。

## 验收标准

- [ ] 多账号卡片展开 → 点「N账号」→ 折叠 → 再展开，显示「概览」内容，L2 高亮在「概览」。
- [ ] `provider_card.test.tsx` 新增用例覆盖上述序列。
- [ ] `pnpm test` 全量通过。

## 依赖与约束

- 无。
