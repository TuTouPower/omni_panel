# Task plan

## 步骤与验证

1. 读 spec.md 涉及代码 + review finding 定位（P5 / I3(claude) / I4(firecrawl) / codex limit=null / cpa to_pct 缺失） -> 验证：file:line 与 opus.md 一致
2. 写失败测试（覆盖 spec 验收） -> 验证：`pnpm exec vitest run <path>` 红
3. 实现至测试通过 -> 验证：vitest 绿 + `pnpm typecheck`
4. 黑盒 `pnpm test`（涉及打包加 `pnpm test:packaged`） -> 验证：通过

## 风险与回退

- 风险：见 spec.md「依赖与约束」
- 回退：git revert 本 task commit

## Finalization 时更新的 blueprint

- 按实际改动更新对应 `docs/blueprint/` 与 `docs/specs/` 条目；无则写「无」
