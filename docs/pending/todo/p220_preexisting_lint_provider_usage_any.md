# p220 存量 lint：provider-usage.ts:207 no-unsafe-return

- 来源：t451 顺手发现（`pnpm lint` 全量门禁；主仓同版本复现，非 t451 引入；t451 未触碰该文件）
- 内容：`src/renderer/lib/provider-usage.ts:207:5 error Unsafe return of a value of type any[]`（`@typescript-eslint/no-unsafe-return`），`pnpm lint`（max-warnings=0）FAIL。同类已有 p215（token-stats-store）。修法：给返回值加类型或收窄 `any[]` 来源。
- 处理：未开
