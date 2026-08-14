# Task review t387（reviewer_focus: 测试）

- task：`t387_token_stats_rollup_directory_join`
- spec：`docs/tasks/t387_token_stats_rollup_directory_join/spec.md`
- diff_anchor：`f38ba45f879383dc83ef342589e0d304b91366dc`
- target：`git diff f38ba45f879383dc83ef342589e0d304b91366dc`
- round：1
- reviewed_at：2026-08-15 07:29 UTC+8

## Findings

### t387_test_f001 - AC-001 未断言 is_hour_rollup_ready，存在理论假阴性路径

- 严重度：minor
- 锚点：AC-001（rollup ready 路径 == records 路径）
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:2252-2254`（`t387 AC-001` 用例，backfill 后未断言 ready 标志）
- 问题：用例 `backfill_hour_rollup()` 后直接 `query_dashboard`，未像同 describe 的 t204 用例（`:2302`）那样先断言 `store.is_hour_rollup_ready()`。若未来某次回归使 backfill 不再翻转 ready 标志，`after` 会静默走 records 路径与 `before` 相同，`expect(after.current).toEqual(before.current)` 恒真，JOIN 修复被跳过仍 PASS。今日为真阳性：用 anchor（未修复）源码 + 新测试跑，`after.current` 输出 `tokens: 660` vs `before 330`（JOIN 放大 2x），`toEqual` 失败，已实证走 rollup 路径。故非覆盖缺口，仅加固建议。
- 建议：在 `backfill_hour_rollup()` 后补 `expect(store.is_hour_rollup_ready()).toBe(true)`（对齐 t204 用例），锁定「after 确在 rollup-ready 路径」。

## 结论

- 前轮 finding 复核：Round 1，无。
- 改测方向复核：无。diff 仅新增两个用例（t387 AC-001 / AC-003）并改动实现，未修改/删除任何既有测试，无「迁就实现」改测。
- 本轮新发现：1 条（t387_test_f001，minor）。
- 未进表的提示：
  - AC-003 仅断言 `sessions.items` 去重，未断言 `sessions.total`（分页元数据）。pre-fix `total` 同样为 2（重复），修复一并纠正；属可选扩展，非阻断。
  - 两个新用例的 fixture 构造（8 行 `upsert_records`）重复，可抽公共 helper；非阻断。
- 总体判断：测试可信、mutation 敏感、覆盖到位。AC-001 与 AC-003 均对各自修复强敏感（临时 worktree 在 anchor 未修复源码上复跑：AC-001 `660≠330` 失败、AC-003 s9 出现 2 次失败；修复后全量 101 用例通过，AC-002 既有单目录回归测试全绿）。唯一 minor 为 ready 标志断言加固，不阻断。verdict: PASS。
- 系统性 follow-up：无。

verdict: PASS
reviewed_scope: 02e3e600f7bd3439

---

# Round 2

- round：2
- reviewed_at：2026-08-15 07:36 UTC+8
- 复核范围：Round 1 之后追加的改动（AC-001 ready 断言、AC-003 calls 聚合断言 + 实现连带聚合化）

## 前轮 finding 复核

- **t387_test_f001（minor）**：已消除。`tests/unit/main/core/token-stats/token-stats-store.test.ts:2253` 在 `backfill_hour_rollup()` 后、`query_dashboard` 前补 `expect(store.is_hour_rollup_ready()).toBe(true)`，位置与同 describe 的 t204 用例（:2302）一致。假阴性路径（backfill 不翻转 ready 标志则 `after` 静默走 records 路径）被锁定。

## 连带实现变更审查（AC-003 calls 聚合）

f001 修复附带引入实现变更：`dashboard_session_page_from_meta`（src/main/core/token-stats/token-stats-store.ts:786-795）的 rows 查询从裸列改为聚合——`SUM(calls)`/`SUM(input_tokens)` 等、`MAX(title)`/`MAX(directory)`/`MIN(started_at)`/`MAX(ended_at)`，`GROUP BY source, env, session_id`。测试相应补 `expect(sessions[0]?.calls).toBe(2)`。

- **断言是正确预期，非迁就实现**：跨两 directory 的会话 s9 总 calls=2（窗口内各 directory 各行 SUM），与 `dashboard_summary_from_rollup` 的 `current.calls=2` 一致；Round 1 裸列返回部分值（calls=1，只一个 directory），与 summary 矛盾。断言 calls=2 是「应有的预期」，实现改 SUM 满足断言，方向正确（TDD 驱动而非实现驱动测试）。
- **强 mutation 敏感**：`.scratch/t387_r2_dump.mjs` 实证「去重但裸列」中间实现下 `GROUP BY session` 裸列返回 `calls: 1`（hour_rollup 两行各 calls=1、window_rows 两行各 calls=1、session_meta 两行各 calls=1）；若实现保持裸列，新增断言 `toBe(2)` 必失败（calls=1≠2）。即断言锁定的正是「跨 directory 聚合」而非「仅去重」。
- **无恒真**：`sessions[0]?.calls` 用可选链，若 `sessions` 为空则 `undefined≠2` 失败，非恒真。
- **单 directory 行为不变**：单 directory 时 `GROUP BY source/env/session_id` 每组仅一行，`SUM(calls)=calls`、`MAX(title)=title`、`MAX(directory)=directory`，与旧裸列一致。AC-002 既有回归测试全绿佐证。

## 改测方向复核

- 无迁就实现。Round 2 相对 Round 1：AC-001 加 ready 断言、AC-003 加 calls 断言，均为新增更强断言，未改动任何既有测试的预期。实现连带从裸列改聚合，是为满足正确断言预期（calls=2），非把断言改成实现输出（calls=1）。

## 本轮新发现

- 0 条 blocking/important；0 条 minor。

## 未进表的提示

- 跨 directory 会话列表行的 `directory` 用 `MAX(directory)` 取字典序大者（s9 显示 `/proj/b`），归属语义任意——spec「风险与回退」已预警「同 session 多 directory 该取哪个 directory 归属」语义未定义。无既有测试锁定，属范围外展示语义，建议 code reviewer 关注；非测试缺口。
- `sessions.total` 仍只断言 `items` 去重（`total` 现为 1），未单独断言 total；非阻断。

## 总体判断

- f001 真修（ready 断言已加，位置正确）；连带实现聚合化经实证为正确语义且强敏感（裸列中间态 calls=1 会被新断言挂住）；全量 14 文件 300 passed（与 implementer 声称一致），AC-002 既有单目录测试全绿。无未解决 important/critical。verdict: PASS。

verdict: PASS
reviewed_scope: c063eda7673e01e2
