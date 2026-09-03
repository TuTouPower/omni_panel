# Task review t445（reviewer_focus: 代码）

- task：`t445_codex_tokenstats_reader`
- spec：`docs/tasks/t445_codex_tokenstats_reader/spec.md`
- diff_anchor：`e43a9fc92088c85a4ff3fecf69181ae4415dc2ca`
- target：`git diff e43a9fc92088c85a4ff3fecf69181ae4415dc2ca`
- round：1
- reviewed_at：2026-09-04 04:05 UTC+8

## Findings

### t445_code_f001 - 差分按比例拆 input/output 与 last_token_usage 精确值存在系统性偏差

- 严重度：minor
- 锚点：AC-001（差分之和语义）
- 位置：`src/main/core/token-stats/codex-reader.ts` 差分拆分段
- 问题：累计口径只有总量可差分，input/output 按 `usage.input/usage.total` 比例拆分；真实行有 `last_token_usage` 精确增量（实测 6285/177 vs 比例拆分值），长期累计下 input/output 分项与真实值有偏差，但总量精确。现有四端 reader 同样只记总量口径分项（grok 直接记行值），分项精度非本 task 契约（AC 只断言总量 + model/directory）。
- 建议：维持现状；若未来需要分项精确，改用 `last_token_usage` 直接记行值（需处理首行 last==total 的一致性）。本轮不阻断。

## 结论

- 前轮 finding 复核：首轮，无。
- 本轮新发现：1 条（minor，不阻断）
- 未进表的提示：新文件 codex-reader.ts 478 行——测试文件阈值 600/实现 400 下属实现源码超 400 minor 线；但同目录 grok-reader.ts 500+ 行同构（reader 范式一致性），拆分会破坏四端 reader 同构可比性，结论段提示不进表。圈复杂度：parse/merge/scan 函数分支数与 grok 同量级，无超标。
- 总体判断：kind/paths/store 口径/collector 接线/scan-state 持久化均与 grok 同构；生产行为变更（平台源 5→6）已同步 collector.test 计数；仅 1 条 minor，可 PASS。
- 系统性 follow-up：无

reviewed_scope: 09599e2351bbbf0a

verdict: PASS
