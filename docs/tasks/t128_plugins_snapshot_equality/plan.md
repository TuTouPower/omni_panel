# Task plan

## 步骤与验证

1. 红：新建/扩展 `tests/unit/renderer/hooks/use_plugins.test.ts`，渲染 `use_plugins` hook，mock `window.usageboard.event.onStateChange` 回调注册；断言「snapshot 值相同（内容等值、不同对象引用）时 `plugins` 数组引用不变」→ 验证：`pnpm vitest run tests/unit/renderer/hooks/use_plugins.test.ts` 失败
2. 绿：实现 `snapshot_equal`（放 `use-plugins.ts` 或 `src/renderer/lib/` 下共享位置），对 4 个 status 分支逐字段比较，`items` 数组逐元素值比较；改 reducer 为 spike 方案 B 形态（`changed` 标志 + 值相等返回 `p`）→ 验证：新测试通过
3. 补边界用例：`idle`→`ready` 跨分支、`items` 内容相同但引用不同、`badge`/`chart` 存在性差异、其他 instance 不受影响 → 验证：`pnpm vitest run tests/unit/renderer/hooks/use_plugins.test.ts` 全绿
4. 全量验证：`pnpm typecheck && pnpm test` 全绿
5. 黑盒：`pnpm test`

## 风险与回退

- 风险 1：`snapshot_equal` 漏比字段导致该更新的不更新（stale UI）。覆盖所有 status 分支与 `items` / `badge` / `chart` / `updatedAt` / `error` 字段；若 `chart` / `items` 元素结构复杂，值比较退化为对序列化或逐字段递归比较，需与 spike「plain objects with readonly 数组」假设对齐。
- 风险 2：测试环境无 `window.usageboard` 全局。沿用 `tests/unit/renderer/hooks/` 现有 mock 模式（参考 `use_config.test.ts`）。
- 风险 3：值比较开销。N 个 connector 每次 state-change 仅对命中 instance 做 1 次 `snapshot_equal`，O（单 snapshot 字段数），可忽略。
- 回退：`git checkout -- src/renderer/hooks/use-plugins.ts tests/unit/renderer/hooks/use_plugins.test.ts`；删除 `snapshot_equal` 文件（若独立成文件）。

## Finalization 时更新的 blueprint

- 无
