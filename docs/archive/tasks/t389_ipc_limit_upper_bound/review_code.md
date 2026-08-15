# Task review t389（reviewer_focus: 代码）

- task：`t389_ipc_limit_upper_bound`
- spec：`docs/tasks/t389_ipc_limit_upper_bound/spec.md`
- diff_anchor：`ce0fcd6133a6e383b97b0b7e096d764b80a8c601`
- target：`git diff ce0fcd6133a6e383b97b0b7e096d764b80a8c601`
- round：1
- reviewed_at：2026-08-15 08:18 UTC+8

## Findings

### t389_code_f001 - RECENT 与 TOKEN_STATS 的 limit 校验重复实现、上界常量双份

- 严重度：minor
- 锚点：行为缺陷 + 维护性（两处语义相同校验分写两处，常量需人工同步）
- 位置：`src/main/ipc/session-history-ipc.ts:226-233` 与 `src/main/ipc/token-stats-ipc.ts:28-39,73`
- 问题：RECENT 用内联条件 `!Number.isInteger(limit) || limit <= 0 || limit > RECENT_LIMIT_MAX`，TOKEN_STATS 抽 `valid_limit` helper + `TOKEN_STATS_LIMIT_MAX`。当前语义一致、错误码统一（INVALID_LIMIT），但两处上界常量 `RECENT_LIMIT_MAX` / `TOKEN_STATS_LIMIT_MAX` 值相同（10000）却分文件双份定义，校验逻辑一内联一 helper。spec 测试策略预留「校验若抽成共享函数（对齐 parse_int_param 模式）」路径；后续任一常量或语义变更，另一处可能漏同步，产生分叉。
- 建议：抽共享校验函数（对齐 t353 `parse_int_param` 风格，可选同文件共享或新 util），单一常量单一实现；或至少在注释中交叉引用两处上界保持一致。

## 结论

- 前轮 finding 复核（Round N≥2）：Round 1 无前轮。
- 本轮新发现：1 条（minor）。
- 未进表的提示：
  - 文件过大（降级规则，不进 finding 表）：`tests/unit/ipc/token-stats-ipc.test.ts` 616 行（≥600 minor 阈值，本 task 净增 +66，由 550 越过阈值）；`tests/unit/ipc/session-history-ipc.test.ts` 715 行（≥600，本 task 净增 +20）。均未达 1200 important，非协议一体文件，后续可拆分 sender validation / 各通道 describe。
  - 复杂度：无函数 CC ≥ 10。
  - 范围外观察：`valid_limit` 内部 `limit !== undefined` 与调用方 guard `filters?.limit !== undefined` 冗余（无害）。
- 总体判断：AC-001/002/003/004 全部实现且测试覆盖（48 测试全过，含既有 RECENT 透传 limit:6 与 RecentSessionsModal limit:100 不受影响），三处校验位置均在 store 调用前、错误码统一，缺省 limit 语义不变，非范围通道（local-api / dashboard zod / SESSION_HISTORY_QUERY）无遗漏校验缺口。仅 1 条 minor 可维护性观察，无未解决 critical/important，PASS。
- 系统性 follow-up：无。

---

## Round 2（2026-08-15）

### f001 复核

- 状态：仍存在，维持 minor。
- 依据（以 diff 为准）：`git diff ce0fcd6133a6e383b97b0b7e096d764b80a8c601` 的源码改动与 Round 1 完全一致，实现侧**未**新增同步风险注释，RECENT 内联校验（`session-history-ipc.ts:226-233`）与 TOKEN_STATS `valid_limit` helper（`token-stats-ipc.ts:32-39`）仍为双份实现、上界常量 `RECENT_LIMIT_MAX`/`TOKEN_STATS_LIMIT_MAX` 双份定义。
- 处置说明：采纳「跨模块共享 helper 成本高、内联几行可接受」的取舍，判定维持 minor 不阻断。建议（可选）在两处常量/校验旁加注释交叉引用对方上界，降低未来单边变更的同步风险；本 finding 不构成合入阻塞。

## Round 2 结论

- 前轮 finding 复核：
  - `t389_code_f001`（minor）：仍存在，维持 minor，同意不阻断。实现侧未按建议加同步风险注释，但语义正确、错误码统一、双份值当前一致（10000），无可观测缺陷。
- 本轮新发现：0 条。
- 未进表的提示：同 Round 1（文件过大两项、复杂度、范围外观察均无新增）。
- 总体判断：全量 IPC 套件独立验证 226 passed（16 文件，含本 task 两个测试文件 48 用例），f001 维持 minor，无未解决 critical/important，PASS。
- 系统性 follow-up：无。

verdict: PASS

reviewed_scope: 4dca9cb04a781a50
