# Task review t171（reviewer_focus: 测试）

- task：`t171_deepseek_mixed_protocol_cache_normalize`
- spec：`docs/tasks/t171_deepseek_mixed_protocol_cache_normalize/spec.md`
- diff_anchor：`112f604e760205c257f9d0bb90a55fc0d4cd9865`
- target：`git diff 112f604e760205c257f9d0bb90a55fc0d4cd9865`
- round：1
- reviewed_at：2026-07-31 21:30 UTC+8

## Findings

无。

## 结论

- 改测方向复核：无。diff 未修改任何既有测试的预期，仅在 describe 块末尾新增 3 个 it（`claude-reader.test.ts:706-753`）。`is_openai_semantic_model` 重命名为 `is_cache_normalization_candidate`（`claude-reader.ts:256`）与守卫条件 `cache_read > 0 && inp >= cache_read`（`claude-reader.ts:351-354`）逐字符比对一致，生产判断逻辑未变，符合 spec 非范围约定。
- 契约区 drift 核对：spec 契约区自 anchor 起重写（「改逻辑」→「补测试锁行为 + 修注释/命名」），task.md Step 1 明确记录「与用户确认收敛 spec」；属经用户确认的需求变更，不出 blocking finding。
- AC 覆盖逐条核对：
    - AC1（`inp >= cache_read > 0` 减）：既有用例 `claude-reader.test.ts:629`（38083-38016=67），新增边界用例 `:719`（inp == cache_read 减至 0，命中测试策略的数值边界要求）。
    - AC2（`inp < cache_read` 保留）：新增 `claude-reader.test.ts:706`（461 vs 244224，断言 records 与 session 均为 461）；既有 `:655` 同向。
    - AC3（混合输入三类输出一致）：新增 `claude-reader.test.ts:727`，同时断言 records 逐行（67 / 461）、session 总量、daily 总量均为 67+461。
    - AC4（longcat 不变）：既有用例 `claude-reader.test.ts:640`（LongCat-2.0，5000-3000=2000）原样保留。
    - AC5（注释/命名表述）：函数注释（`claude-reader.ts:244-255`）已写明「模型名只决定是否纳入候选，执行由 `inp >= cache_read` 守卫决定」，调用点注释（`:348-350`）同步；无「按模型名决定减与不减」残留表述。
- 测试可信：全部用例经 `scan_session_jsonls` 公共接口 + 临时目录真实 JSONL 驱动，断言采集输出（records/sessions/daily），无 mock 内部函数、无恒真断言、无 `.skip`/`.only`、无条件断言、无弱化断言。危险模式扫描零命中。
- 实测运行：`vitest run tests/unit/main/core/token-stats/claude-reader.test.ts`，37 passed / 0 failed。
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：测试真实触达生产逻辑、AC 全覆盖、危险模式零命中，PASS。
- 系统性 follow-up：无

verdict: PASS
