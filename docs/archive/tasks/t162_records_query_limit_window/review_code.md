# Task review t162（reviewer_focus: 代码）

- task：`t162_records_query_limit_window`
- spec：`docs\tasks\t162_records_query_limit_window/spec.md`
- diff_anchor：`43c6d1637387694101c1113bc138afa69d81df04`
- target：`git diff 43c6d1637387694101c1113bc138afa69d81df04`
- round：1
- reviewed_at：2026-07-30 22:25 UTC+8

## Findings

零 finding。

## AC 覆盖核对

- AC1（`query_records` SQL 含 `LIMIT`，缺省兜底 5000）：`token-stats-store.ts:461-463`，`filters.limit ?? DEFAULT_RECORDS_LIMIT`，SQL 末尾 `LIMIT @limit`，`DEFAULT_RECORDS_LIMIT = 5000`（第 19 行）。满足。
- AC2（`loadData` 传入 start/end）：`TokenStatsView.tsx:163-167`，`start: currentRange.start, end: currentRange.end`。满足。
- AC3（渲染进程持有 records ≤ limit）：`query_records` SQL 层硬限，IPC 与 local-api 均走默认或显式 limit。满足。
- AC4（窗口内 ≤ limit 时数据一致，超限保留最新 N）：`ORDER BY timestamp DESC LIMIT @limit` 语义即最新 N。满足。
- AC5（单测覆盖 limit 下推）：`token-stats-store.test.ts` 新增三条（显式 limit / 默认 limit / limit + window 组合）。满足。

## 重点维度核查

### SQL 注入

`token-stats-store.ts:462-463`：`params["limit"] = limit` + `LIMIT @limit`，better-sqlite3 参数化绑定，非字符串拼接。注入面闭合。

### loadData 依赖 currentRange 是否引入无限重渲染

- `currentRange` 为 `useMemo(() => custom ? {...custom} : preset ? presetRange(preset) : {start:0,end:Date.now()}, [custom, preset])`（`TokenStatsView.tsx:143-147`）。依赖仅 `custom`/`preset`，两者为 `useState`，引用稳定，只在用户切换 preset 或改动 custom 时变更。
- `presetRange`（第 77-80 行）内部 `end = Date.now()`，但被 memo 缓存，不会在每次渲染时产生新引用。
- `loadData = useCallback(..., [platform, currentRange])`（第 199 行）依赖 `currentRange` 引用；`useEffect(() => void loadData(), [loadData])`（第 202-204 行）只在 `loadData` 引用变化时触发。
- 链路：preset 变 → `currentRange` 新引用 → `loadData` 新引用 → effect 触发一次重拉。无自循环闭环（重拉不会改 `custom`/`preset`）。无限重渲染风险排除。

### 默认 limit 合理性

`DEFAULT_RECORDS_LIMIT = 5000`，针对 38 万行全表场景是合理止血兜底；`filters.limit` 为可选，调用方可显式覆盖。spec 明确允许 t164 兜底视觉一致性。

### 现有契约破坏面

- `TokenStatsRecordFilters` 仅新增 `limit?: number`，旧调用方不传走默认，兼容。
- `local-api/server.ts:286-293` 调用 `query_records` 未传 `limit`，自动继承默认 5000。此前返回全量、现返回 ≤5000 最新行。此为 HTTP API 行为变化，但：
    - spec AC1 要求「`filters.limit` 缺省时有默认兜底」，store 层统一行为，local-api 自然继承；
    - 无 local-api `/v1/records` 的直接测试，无现存契约断言破坏；
    - t162 目标本身即止血全量返回，local-api 同源受益。

    不构成 finding（在止血目标语义内，且 spec 未把 local-api 列为非范围排除）。

- IPC handler `token-stats-ipc.ts:58` 直接透传 `filters`，未校验 `limit` 类型/范围。渲染端是唯一调用方，`TokenStatsView` 未传 `limit`（走默认），非攻击面。`assert_valid_sender` 已挡外部 IPC。未引入新风险。

## 文件大小

- `token-stats-store.ts`：480 行（< 800 important 阈值，< 400 minor 不评，本 task 净增 +12）。
- `TokenStatsView.tsx`：501 行（同上，本 task 净增 +6）。

均未达 finding 阈值。

## 圈复杂度

- `query_records`（439-466）：基数 1 + 5 个 `if`（agent/env/start/end/limit 缺省）≈ 6，未达 10 minor 阈值。
- `loadData`（154-200）：基数 1 + 3 个三元 + 1 个 `if`/`try`/`catch`/`finally` 控制流 ≈ 6-7，未达阈值。

## 结论

- 本轮新发现：0 条
- 总体判断：实现精准对齐 spec AC，SQL 参数化闭合注入面，`currentRange` memo 依赖稳定无无限重渲染风险，默认 limit 兜底合理，现有契约（IPC / local-api / 类型）向后兼容。

verdict: PASS
