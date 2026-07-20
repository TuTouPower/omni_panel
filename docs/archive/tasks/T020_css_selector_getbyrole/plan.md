# Task plan

## 步骤与验证

1. grep `aria-label="` 拼 ${ 的位置 -> 验证：列表
2. 逐处改 `getByRole({name, exact})` -> 验证：grep 无残留
3. `pnpm test:e2e:web`（real + synthetic）-> 验证：全绿
4. `pnpm typecheck` -> 验证：过
5. review×2 + adoption + task_report + 归档 + commit

## 风险与回退

- 风险：getByRole exact 匹配语义差异（exact 全等）-> 若原 CSS 是 substring 匹配，改后可能漏；但 aria-label 动态提取是精确值，exact 正确
- 回退：改回 CSS selector

## Finalization 时更新的 blueprint

- 无
