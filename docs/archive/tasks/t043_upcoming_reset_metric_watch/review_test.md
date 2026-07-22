# Task review t043（reviewer_focus: 测试）

- task：`t043_upcoming_reset_metric_watch`
- spec：`docs\tasks\t043_upcoming_reset_metric_watch\spec.md`
- diff_anchor：`fe967b82b35d5088d5e8b97ffea50accece5dcf0`
- target：`git diff fe967b82b35d5088d5e8b97ffea50accece5dcf0`
- round：1
- reviewed_at：2026-07-22 20:46 UTC+8

## Findings

### t043_test_f001 - `resetAt <= now` 过滤分支失测（专用测试被删未补）

- 严重度：important
- 位置：`tests/unit/renderer/lib/upcoming_resets.test.ts`（原 `skips period with resetAt <= now (already reset)` 测试块被删除，未见替代）；相关实现 `src/renderer/lib/provider-usage.ts:589`
- 问题：t043 重写 `collect_upcoming_resets` 测试时删除了专门覆盖「已过期重置点（`resetAt <= now`）被跳过」的测试块。实现仍保留该分支 `if (period.resetAt <= now) continue;`（provider-usage.ts:589），且函数 JSDoc 仍声明 "Periods lacking `cycleDurationMs` (null/0/missing) or `resetAt` (null/≤now) are skipped"。保留的 `skips watched period with resetAt null`（line 199-210）只覆盖 `=== null` 分支，不覆盖 `<= now` 分支。全仓 grep `resetAt:\s*NOW\s*-` / `resetAt.*-\s*1000` 在 tests/ 下无任何命中，集成测试（popup_view 等）也均使用 `resetAt: future`，该分支在全测试套件中零覆盖。
- 建议：恢复 `skips watched period with resetAt <= now` 测试：在 watched 命中 + threshold 放行 + `resetAt: NOW - 1000`（或 `resetAt: NOW`）的设置下断言 `collect_upcoming_resets` 返回 `[]`。

### t043_test_f002 - `used/limit` 非法时 percent 回退 0 分支失测（专用测试被删未补）

- 严重度：important
- 位置：`tests/unit/renderer/lib/upcoming_resets.test.ts`（原 `reports percent 0 when used/limit invalid` 测试块被删除，未见替代）；相关实现 `src/renderer/lib/provider-usage.ts:594-603`
- 问题：t043 删除了覆盖 `used: null / limit: 0` 等非法输入时 `percent` 回退为 0 的测试。实现仍保留 ternary fallback：`used !== null && limit !== null && limit > 0 && Number.isFinite(used) && Number.isFinite(limit) ? ... : 0`（provider-usage.ts:594-603）。保留的 `computes percent as used/limit clamped 0-100`（line 214-242）只用 valid `used=5/limit=8`、`used=12/limit=10`，覆盖真分支与 clamp，完全不触达 fallback 假分支。该 fallback 是数据异常时的安全网行为，现在全测试套件零覆盖。
- 建议：恢复 `reports percent 0 when used/limit invalid` 测试块（至少覆盖 `used: null + limit: 100`、`used: 50 + limit: 0` 两种非法组合，断言 `percent === 0`），或在 `computes percent` 现有测试里追加一组 invalid 用例。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：2 条。
- 总体判断：watchedMetrics 门控（默认全关、watched raw_label 进入、非 watched/账号/provider 排除）、config schema 迁移 strip、`add/remove_watched_metric`（去重、清空 account/provider 键）、metric 行 toggle 组件测、cpa_card 删 t041 块后剩余覆盖均合理；但 `collect_upcoming_resets` 的两条既有实现分支（`resetAt <= now` skip、`used/limit` invalid fallback → percent 0）随 t043 测试重写丢失了专用测试且无替代覆盖，构成「删测试」危险模式命中，判 FAIL。

verdict: FAIL

## Round 2 (2026-07-22 21:10 UTC+8)

复核对象：`git diff fe967b8 -- tests/unit/renderer/lib/upcoming_resets.test.ts` 新增两条测试。

### t043_test_f001 复核 — 已修

- 新测试：`skips watched period with resetAt <= now (already reset)`（test 第 212-223 行）。
- 分支覆盖：period `resetAt: NOW - 1000`、`cycleDurationMs: 7*DAY`、`raw_label: "5小时"`；watchedMetrics 命中 `claude/acct0/["5小时"]` → 通过 watched_set、resetAt 非空、抵达 `provider-usage.ts:589` `if (period.resetAt <= now) continue;` 触发跳过。
- 断言：`toHaveLength(0)`，锁定期望行为。
- 确定性：NOW 为模块常量，无计时器/真实时钟依赖，无 flaky。
- 结论：真正修复。

### t043_test_f002 复核 — 已修

- 新测试：`reports percent 0 when watched period has invalid used/limit`（test 第 257-272 行）。
- 分支覆盖：两个 period 均未来 resetAt + valid cycle + watched 命中，进入 percent 计算。
    - `used: null, limit: 100` → 命中 `provider-usage.ts:597` `used !== null` 假分支 → fallback 0。
    - `used: 50, limit: 0` → 命中 `provider-usage.ts:599` `limit > 0` 假分支 → fallback 0。
- 断言：`expect(result.map((r) => r.percent)).toEqual([0, 0])`，锁定 fallback 输出。
- 覆盖强度：两种非法组合分别命中 fallback 的不同子条件，比单条更强；确定性输入，无 flaky。
- 结论：真正修复。

### 本轮新发现

无。

verdict: PASS
