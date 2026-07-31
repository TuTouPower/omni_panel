# Task review t171（reviewer_focus: 代码）

- task：`t171_deepseek_mixed_protocol_cache_normalize`
- spec：`docs/tasks/t171_deepseek_mixed_protocol_cache_normalize/spec.md`
- diff_anchor：`112f604e760205c257f9d0bb90a55fc0d4cd9865`
- target：`git diff 112f604e760205c257f9d0bb90a55fc0d4cd9865`
- round：1
- reviewed_at：2026-07-31 21:35 UTC+8

## Findings

无。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 本轮新发现：0 条。
- 契约区 drift 核对：diff_anchor 时契约区为「按 `cache_creation_input_tokens` 信号改判断逻辑」，当前契约区改为「不改逻辑、补测试锁定 + 修注释/命名」。`task.md` Step 1 记录该收敛经 spike s004 实测（`cache_creation` 全 deepseek 行恒 0、现有数值守卫分窗零误判）后与用户确认；「未知契约清单」已无 `UNVERIFIED-*` 标记。按已确认的需求变更处理，不出 finding。
- AC 逐条核对：
    - AC1（`inp >= cache_read > 0` 减）：由既有用例「deepseek-v4-pro 命中时归一化 input」（`tests/unit/main/core/token-stats/claude-reader.test.ts:628`）与新增边界用例覆盖。
    - AC2（`cache_read > 0 且 inp < cache_read` 保留）：新增用例「deepseek 互斥语义行（inp < cache_read）保留原始 input 不被扣减」（同文件 :706）。
    - AC3（混合输入 session/daily/records 三类一致）：新增用例「混合 deepseek 接入：OpenAI 行减 + 互斥行不减，session/daily/records 三类一致」（同文件 :727），逐行 records、session 总量、daily 总量均断言。
    - AC4（longcat 行为不变）：既有用例「LongCat-2.0 模型名大小写不敏感，归一化生效」（同文件 :639）保留。
    - AC5（注释/命名表述）：`src/main/core/token-stats/claude-reader.ts:245-257` 函数注释与 :348-350 调用点注释已改为「模型名圈候选、`inp >= cache_read` 守卫决定执行」，函数改名 `is_cache_normalization_candidate`（:256），不再表述「按模型名决定减与不减」。
- 测试策略区「数值边界 `inp == cache_read` 减至 0」已由新增用例「数值边界 inp == cache_read 时减至 0」（同文件 :720）覆盖。全文件 37 tests 通过（vitest run 实测）。
- 未进表的提示：
    - 文件行数（按降级规则仅列示，不进 finding 表）：`src/main/core/token-stats/claude-reader.ts` 636 行（实现源码 ≥400 且本 task 净增，minor 档）；`tests/unit/main/core/token-stats/claude-reader.test.ts` 754 行（测试源码 ≥600 且净增，minor 档）。均未达 important 档（800/1200），拆分建议留作后续 task 权衡。
    - 范围外观察（不进 finding 表，不改 AC）：①`claude-reader.ts:254` 注释引用的 `docs/research/token-cache-openai-semantics.md` 已不在库内（实际位于 `docs/archive/_pre/research/`，本 diff 之前即如此），引用悬空且归档副本仍含 `is_openai_semantic_model` 旧表述；②spec 上下文区声明 finalization 更新 `docs/blueprint/domain.md` 与 `docs/findings.md`，本 diff 只落了 `docs/findings.md`（d003），domain.md 当前无 cache 归一化语义条目，按「若有权威表述才更新」的措辞属条件不成立，但 finalization 时需确认此判断成立。两处均属文档引用/finalization 待办，不影响本 task 代码与测试正确性。
- 总体判断：生产逻辑 diff 仅注释与函数改名，条件 `cache_read > 0 && inp >= cache_read` 逐字未变；5 条 AC 均有实现且测试实测通过，无 critical / important / minor finding。
- 系统性 follow-up：无（文件拆分与归档研究文档引用清理可作为日常 hygiene 项，不构成阻断）。

verdict: PASS
