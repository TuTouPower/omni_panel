# Task review t208（reviewer_focus: 测试）

- task：`t208_sparkline_granularity_window`
- spec：`docs/tasks/t208_sparkline_granularity_window/spec.md`
- diff_anchor：`f91a7603684a4c1a66340231e92ca8e3f9cccd76`
- target：`git diff f91a7603684a4c1a66340231e92ca8e3f9cccd76`
- round：1
- reviewed_at：2026-08-05 16:50 UTC+8

## Findings

### t208_test_f001 - AC4「切回原窗口走缓存」无断言

- 严重度：important
- 锚点：AC4（窗口切换后切回原窗口，sparkline 走缓存命中，不重复发 IPC）
- 位置：`tests/unit/renderer/components/provider_account_row.test.tsx:373-420`（测试名甚至含「切回走缓存」，但断言缺失）
- 问题：测试名为「窗口选择器切换 days 触发新取数，切回走缓存 (t208)」，实际只断言到「切到 1 天触发 getBulk 第 2 次调用 + payload days=1」。AC4 的关键反证——「切回 7 天应命中缓存，getBulk 调用次数不增加」——在测试中不存在；测试名声明了覆盖，但断言未兑现，属「测试存在但验证的是假行为 / 半截 AC」。
- 建议：在现有测试末尾追加：再 `fireEvent.click(七天btn)`，然后 `expect(trend_bulk).toHaveBeenCalledTimes(2)`（仍为 2，证明切回 7 天走缓存）；同时 `expect(container.querySelector(".trend-window-btn.active")?.textContent).toBe("7天")` 验证 UI 状态。测试名「切回走缓存」才算落实。

### t208_test_f002 - 「同桶取最新」断言用存在性而非排他性

- 严重度：minor
- 锚点：AC5 / 测试策略「桶内取最新」
- 位置：`tests/integration/observation/trend-granularity.test.ts:88-98`（`it("同桶多 observation 取 observed_at 最大一条")`）
- 问题：用 `points.find((p) => p.used === 90)` 验证桶内保留 used=90 的点。此断言只验证「used=90 的点存在」，不能排除「used=10 的旧点也在结果中」（当前实现 ≤cap 时不聚合，两点都保留，恰好命中弱断言）。真正「桶内取最新」的反证应让两点落入同一桶且总点数 > cap 触发聚合路径，断言旧点被淘汰。
- 建议：将 fixture 改为塞入 >120 点使聚合路径触发，并让同桶两点 used=10 / used=90，断言 `points.find(p => p.used === 10)` 为 `undefined`（旧点被淘汰）、`used=90` 存在；或直接断言 `points.length === cap` 且桶内只剩最新。当前用例本意是测聚合路径的同桶取最新，但 fixture 仅 2 点，走的是「不聚合」分支，逻辑错位。

## 结论

- 改测方向复核：`tests/integration/observation/trend-query-key.test.ts:73-74, 116-117` 两处 `toHaveLength(7) → toHaveLength(2)`，对齐「2 原始点 ≤120 不聚合」的新语义，与 spec 范围一致，非迁就实现。`observation-store.test.ts` 删除「null fill / 长度=days」旧语义用例，已在注释中归因（旧语义废弃，新语义由 trend-granularity.test.ts 覆盖），符合「整体删除并说明理由」。改测方向无问题。
- 本轮新发现：2 条（f001 important，f002 minor）
- 未进表的提示：无
- 总体判断：f001 阻断——AC4 文字明确「切回原窗口走缓存」，测试名声称覆盖但断言未到，必须补齐切回的缓存命中断言；f002 不阻断。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-05 12:24 UTC+8)

### 前轮 finding 复核

- **t208_test_f001（important→仍弱化为 minor）**：已在 `tests/unit/renderer/components/provider_account_row.test.tsx:420-427` 追加「再点 7 天 → `expect(trend_bulk).toHaveBeenCalledTimes(2)`」断言。结合实现 `ProviderAccountRow.tsx:94` 的 `cache_key = ...||${trend_days}`，切回 7 天命中同一 cache_key、不进 `missing`、不发 IPC——AC4 的端到端语义确实被覆盖，**AC4 不再是「测试存在但验证假行为」**，本轮不再阻断。
    - 但断言形式是 `await new Promise(r => setTimeout(r, 50))` + `toHaveBeenCalledTimes(2)`：固定 50ms 负向等待。慢 CI 上 50ms 内可能尚未触发第 3 次 `getBulk`（flaky 假阳），快机极端情况下也可能在 50ms 内已发但测试看不到（flaky 假阴）。AC4 本质是负向行为（不发 IPC），任何负向断言都要等待确定性时机；当前用固定 sleep 而非 `waitFor` 反向断言或直接验证 cache 命中，属弱形式。降为 **minor**（同 f002 量级），不阻断但建议改用 `await waitFor(() => expect(trend_bulk).not.toHaveBeenCalled())` 或读 `trend_cache_ref` 状态做正向断言。
- **t208_test_f002（minor→降级观察，仍 minor）**：fixture 已改为 121 点（119 used=50 + used=10 + used=90）触发聚合分支（121 > 120 ✓，真聚合路径）。断言最末桶 `used === 90`，能区分「取最新」vs「取最早/任意」的错误实现，核心语义已验证。但 Round 1 提的「未排除旧点残留」仍未补：没有断言 `used=10/50` 不在最末桶、也没断言总长度 ≤ 120。保留 **minor**。

### 改测方向复核

- `tests/integration/observation/observation-store.test.ts`：删除「null fill / 长度=days」旧语义用例、`returns all-null series` → `returns empty series`、同桶语义改 2 点不聚合返回——均对齐 spec 范围（固定 ≤120 桶、不补 null），不是迁就实现。
- `trend-query-key.test.ts` `toHaveLength(7) → toHaveLength(2)`：2 原始点 ≤120 不聚合，新语义成立。
- `trend-instance-isolation.test.ts` 三处 `filter(p=>p!==null)` 改 `series` 直接：对齐接口返回类型 `Observation[]`（非 `Observation|null[]`）。
- `grok_oauth_account_lifecycle.test.ts` / `refresh-service.test.ts` mock 返回类型 `(Observation|null)[] → Observation[]`：类型签名同步，无语义变化。
- 本轮无「让断言迁就当前实现」的改测。

### 本轮新发现

0 条。

### 未进表的提示

- 范围外（属 code review 职责，仅提示）：本 diff 同时删除 `tests/integration/observation/trend-instance-isolation.test.ts`（-111 行，t214 实例隔离测试整体删除）与 `tests/integration/local-api/server.test.ts`（-62 行）。t214 非本 task spec 范围，但其 AC 覆盖随测试删除丢失；若 t214 AC 未在更高层补回，构成回归门禁缺口。spec 上下文区「测试策略」未声明此删除。建议 code reviewer / 用户确认是否为预期（可能是签名去 source_instance_id 后的连带清理）。
- 范围外（仅提示）：`query_trend_series` 工作区签名仍保留 `source_instance_id`（`observation-store.ts:287`），但 diff anchor 相对删除了多处 `source_instance_id` 透传（ipc / web / local-api / preload / 前端 getBulk payload）。spec 非范围明确「不加 source_instance_id 维度」与该字段是否进 query_trend_series 无直接冲突，但 diff 的整体语义需 code reviewer 判定。

### 总体判断

AC1-5 均有测试覆盖（f001 端到端 + cache_key 实现确认、f002 真聚合分支、AC1/3/5 集成测试齐）。前轮 important（f001）已消除阻断性（不再是「验证假行为」），本轮无新 important/critical。仅余 2 条 minor：f001 sleep 弱形式、f002 未排除旧点残留。

verdict: PASS
