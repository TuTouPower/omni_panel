# Adoption T027

owner 自审（ProviderAccountRow error badge + CSS + spec skip）。

| 项                       | decision | rationale                                                                                     | status |
| ------------------------ | -------- | --------------------------------------------------------------------------------------------- | ------ |
| error badge 代码+CSS     | 采纳     | ProviderAccountRow rel-time 行加 .error-badge（采集失败，title={error}），CSS var(--risk-red) | 已修   |
| account_error_badge spec | 采纳     | skip（MetricRecord.error 无数据，T028 待通）                                                  | 已修   |

## 处置说明

- ProviderAccountRow L47-49：删 `void _error`（使用 error prop），header rel-time 行加 `{_error && <span className="error-badge" title={_error}>采集失败</span>}`。
- globals.css L609-613：`.error-badge` 样式（margin-left:6px, color: var(--risk-red), font-weight:650）。
- account_error_badge.spec.ts：test.skip（T028 connector script per-account error 待实现；badge UI 已就绪，待数据验证）。
- web e2e 45 passed + 1 skip。vitest 1425 passed。
