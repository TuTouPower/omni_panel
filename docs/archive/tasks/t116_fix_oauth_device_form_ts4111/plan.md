# Task plan

## 步骤与验证

1. 改 3 处 dot → bracket → 验证：`pnpm typecheck` 3 处 TS4111 消失；`pnpm vitest run tests/unit/renderer/components/forms/oauth_device_form.test.tsx` 7 用例全绿。
2. `pnpm test` 全绿 → 验证：CI 命令。

## 风险与回退

- 风险：无（纯测试文件 bracket 访问）。
- 回退：`git checkout` 单文件。

## Finalization 时更新的 blueprint

- 无（测试修复，无 spec/blueprint 影响）。
