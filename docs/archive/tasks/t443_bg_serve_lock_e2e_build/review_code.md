# Task review t443（reviewer_focus: 代码）

- task：`t443_bg_serve_lock_e2e_build`
- spec：`docs/tasks/t443_bg_serve_lock_e2e_build/spec.md`
- diff_anchor：`233cd77369a598779ce687ee7732aa0f1f9a1b83`
- target：`git diff 233cd77369a598779ce687ee7732aa0f1f9a1b83`
- round：1
- reviewed_at：2026-09-04 03:25 UTC+8

## Findings

### t443_code_f001 - 固定端口 18711 与并行/残留实例冲突无防护

- 严重度：minor
- 锚点：AC-001（健康实例起服前置条件）
- 位置：`tests/e2e/packaged/bg_serve_lock.spec.ts:167`
- 问题：端口写死 18711；若本机有残留实例占用该端口或 packaged project 并行 workers>1，`wait_for_health` 可能撞见 чужой 实例或超时。本仓 packaged project 已配 `workers: 1`，且 teardown 回收 user-data-dir 进程树；残留端口占用属环境问题非逻辑缺陷。
- 建议：维持现状（workers:1 + teardown 回收已足够）；若未来 packaged workers>1 再改动态端口。本轮不阻断。

## 结论

- 前轮 finding 复核：首轮，无。
- 本轮新发现：1 条（minor，不阻断）
- 未进表的提示：新文件 222 行，远低于测试文件 600 行阈值；生产代码零改动（spec 非范围要求）；`spawn`/`execFileSync` 双 import 可合并但属风格，不计 finding。
- 总体判断：生产代码零改动符合非范围约束；测试覆盖 AC-001/AC-002/AC-003 且已实跑通过；仅 1 条 minor，可 PASS。
- 系统性 follow-up：无

reviewed_scope: ae0222fa251cc1df

verdict: PASS
