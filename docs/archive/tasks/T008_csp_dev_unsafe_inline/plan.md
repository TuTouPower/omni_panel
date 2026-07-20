# Task plan

## 步骤与验证

1. 写 `tests/unit/main/security/csp.test.ts`（import 尚不存在的 `csp.ts`）→ 验证：`pnpm test csp` 红（import 失败）
2. 实现 `src/main/security/csp.ts`（三纯函数）→ 验证：`pnpm test csp` 绿
3. 改 `src/main/index.ts` CSP 段调用 `build_csp_header` → 验证：`pnpm typecheck` + `pnpm test` 全绿
4. `ELECTRON_ENABLE_LOGGING=true pnpm start`，抓 stdout → 验证：`can't detect preamble` 错 0、React DevTools 加载、`[vite] connected`
5. review×2 + adoption + task_report + 归档 + commit

## 风险与回退

- 风险：`'unsafe-inline'` 削弱 dev CSP——可接受（dev 本地无攻击面）；prod 不受影响。
- 回退：revert 本 commit，回到内联 CSP（dev 仍黑屏，需另寻方案）。

## Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：ADR 006 dev CSP 放开 `'unsafe-inline'`
