# Task review t186（reviewer_focus: 通用）

- task：`t186_obs_store_prune_tiebreaker_account_row_test`
- spec：`docs/tasks/t186_obs_store_prune_tiebreaker_account_row_test/spec.md`
- diff_anchor：`0801ff59ee86cda719899c60d60c01605c9ae70f`
- target：`git diff 0801ff59ee86cda719899c60d60c01605c9ae70f`
- round：1
- reviewed_at：2026-08-02 05:35 UTC+8

## Findings

无。

## AC 覆盖核查

**AC1（prune_stmt 同键同 ts 按 stale DESC tie-breaker 选保留行）**

- 实现：`observation-store.ts:201-210`。MAX 子查询替换为 `ROW_NUMBER() OVER (PARTITION BY provider, account_id, metric_id, source_instance_id ORDER BY observed_at DESC, stale DESC)`，`rn = 1` 为保留行。ORDER BY 与 `get_latest_stmt`(:163-167)、`list_latest_by_provider_stmt`、`list_by_instance_stmt` 三处 tie-breaker 完全一致。
- 语义：旧版「保每键 ts=MAX 的所有行」（同 ts 多行全保留 → 该键不收敛）；新版「保每键唯一 rn=1 行，删 observed_at < older_than 的其余行」。语义变更在 spec 范围内（与 latest 取舍对齐）。
- 性能：PARTITION BY 全键命中 `idx_lookup` 前缀（provider, account_id, metric_id, source_instance_id），与现有 `list_by_instance_stmt` 同模式，无回归。
- 测试：`observation-store.test.ts:114-128`。两行同 ts=1000（均 < Date.now()），prune 后 `count_observations()===1` 且 `latest.stale===true && latest.last_error==="boom"`，直接验证「保留 stale 副本，删原观测」。

**AC2（AccountUsageRow observedAt 优先取数路径）**

- 实现：`UsageRows.tsx:180-184`。`observedAt ? relative_time(observedAt) : updatedAt ? relative_time(updatedAt) : ""`，三分支全覆盖。
- 测试：`usage_rows.test.tsx:242-289`。三个用例分别覆盖 observedAt 非空（断言等于 `relative_time(account.observedAt)` 且为 "30 分钟前"）、observedAt=null 回退 updatedAt、两者皆空显示空串。fake timers 在 `beforeEach`/`afterEach` 配对（`useFakeTimers` / `useRealTimers`），仅限本 describe 块，无泄漏。
- 文件内已有同名 `make_account`（行 166 watch-toggle describe），作用域隔离不冲突。

**AC3（count_observations 行数断言锁住 delete_stale_dup）**

- 实现：`observation-store.ts:318-323`。`ObservationStore` interface 导出（:31），注释标明「test helper」。
- 测试：`observation-store.test.ts:103-112`。插入 1 原观测 + 3 同 ts stale 副本，断言 `count_observations()===2`（原 1 + 最新副本 1，旧副本被 `delete_stale_dup_stmt.run` 清）。删 `delete_stale_dup_stmt.run` 后会变 4，红。TDD 纪律（先绿、临时删确认变红、恢复）按 spec 测试策略执行。
- mock 补齐：3 处 mock（`grok_oauth_account_lifecycle.test.ts:56`、`integration/scheduler/refresh-service.test.ts:137`、`unit/scheduler/refresh-service.test.ts:76`）均补 `count_observations: vi.fn(() => 0)`，TypeScript interface 完整。

## 其他核查

- 元引用：代码注释 `t186:` / `p016`、测试名 `(t186)` 不属文档正文元引用禁区；spec.md 背景区「来源：p016...」属结构化字段豁免。无违规。
- 命名/缩进：`count_observations` snake_case，4 空格缩进，符合约定。
- 假绿扫描：所有断言触达真实路径（真实 SQLite store、真实 React 渲染、真实 `relative_time` 计算），无 mock 被测逻辑、无 `.skip` / 恒真断言。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：0 条。
- 未进表的提示：无。
- 总体判断：AC1-AC3 全部被实现与测试真正覆盖，SQL 正确性、性能、mock 完整性、fake timers 配对均无问题。
- 系统性 follow-up：无。

verdict: PASS
