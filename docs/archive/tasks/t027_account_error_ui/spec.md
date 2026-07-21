# Task spec

## 背景

T026 MetricRecord 加 error 字段 + accountErrors 透传已就位。ProviderAccountRow props 含 `error?: string`，但 `void _error`（UI deferred）。账号行看不到哪个账号错。

## 范围

- `src/renderer/components/ProviderAccountRow.tsx`：删 `void _error`，header rel-time 行加 `<span className="error-badge" title={_error}>采集失败</span>`（有 error 时显示，tooltip 具体 message）。
- `src/renderer/styles/globals.css`：`.error-badge` 样式（参照 `.stale-badge`，用 `--risk-red` 或 `--warn-orange`）。
- `tests/e2e/web/`：加 1 case（synthetic fixture 有 error account，断言 `.error-badge` 可见）。

## 非范围

- 不改 ProviderCard render_state（connector 级保留）
- 不改 connector scripts（T028）
- 不加 error details 展开（只 badge + tooltip）

## 验收标准

- [ ] 有 error account 显示 `.error-badge`，tooltip 含 error message
- [ ] 无 error account 无 badge
- [ ] `pnpm test:e2e:web` 全绿
- [ ] `pnpm typecheck` 过

## 依赖与约束

- 依赖 T026 MetricRecord.error + accountErrors
