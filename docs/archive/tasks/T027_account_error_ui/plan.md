# Task plan

## 步骤与验证

1. ProviderAccountRow：删 void \_error + header rel-time 加 error badge → 验证：typecheck + pnpm test
2. globals.css：`.error-badge` 样式（参照 stale-badge，--risk-red）→ 验证：CSS 无语法错
3. web e2e：加 1 case synthetic error account 断言 .error-badge → 验证：pnpm test:e2e:web 全绿
4. review×2 + adoption + task_report + 归档 + commit

## 风险与回退

- 风险：error badge 文字"采集失败"与 stale badge 含义重叠 → 不同（stale=数据过期，error=采集失败）
- 回退：删 error badge，复原 void \_error

## Finalization 时更新的 blueprint

- 无
