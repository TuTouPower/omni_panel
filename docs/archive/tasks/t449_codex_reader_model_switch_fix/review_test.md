# Task review t449（reviewer_focus: 测试）

- task：`t449_codex_reader_model_switch_fix`
- spec：`docs/tasks/t449_codex_reader_model_switch_fix/spec.md`
- diff_anchor：`6afd035dc7e500a85d313f012d3faaafd17382ec`
- target：`git -C '/home/karon/karson_ubuntu/omni_panel_t449' diff 6afd035dc7e500a85d313f012d3faaafd17382ec`
- round：1
- reviewed_at：2026-09-04 21:00 UTC+8

## Findings

无（Round 1 零 finding，未进处置表）。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 改测方向复核：无。diff 未改动任何既有测试，仅新增一个 `it` 块与 task.md 状态 front matter；不存在「让断言迁就当前实现」的改测。
- 本轮新发现：0 条。
- 未进表的提示：
  1. 新增测试未显式断言切换后 records/daily 的 model 归因落到 model-b（spec 范围句「model 仅作增量归因标签」的标签侧）。panel_total==2000 已覆盖不 double 计；归因断言属可选扩展，实现侧 `segment_model` 更新逻辑正确，不作 finding。
  2. cache_read 不翻倍由 `panel_total == 末 total(2000)` 等式隐含覆盖（cache 若随切换重置翻倍则总账 3000），未单列断言 `session.cache_read_tokens == 1500`。已满足测试策略句，可选扩展。
- 总体判断：新增测试端到端落盘真实 jsonl、经 `scan_codex_rollouts` 触达 `parse_rollout_file` 生产实现，`toBe(2000)` 精确断言；无 mock 误用、无危险模式命中、无既有测试被改。clean review，PASS。
- 系统性 follow-up：无。

### 危险模式扫描（逐条确认）

恒真断言：无；删/反转 expect：无；注释断言：无；弱化断言：无（`toBe(2000)` 精确值）；删测试：无；skip/only：无；静默错误指令：无；mock 误用：无（直接构造文件，无任何 vi.mock）；阈值掩盖：无；条件跳过弱化断言：无；程序赋值替代真实交互：不适用（无 UI）；存在即通过：无（`toHaveLength(1)` 之外有精确数值断言）。

### AC 复验方式

- AC-001：`re_verified`。重跑 `pnpm vitest run tests/unit/main/core/token-stats/codex-reader.test.ts` 8/8 绿；静态反证测试对旧实现（model 切换重置基准）敏感——旧实现下事件 2 归全量 2000 + 事件 1 的 1000 = 3000，`toBe(2000)` 会红。
- AC-002：`re_verified`。独立重跑实施侧 `.scratch/verify_t449.mts`（只读扫描真实 `/home/karon/.codex/sessions`）：gpt-5.6-sol、948 事件、panel_total=196196593（≈196.2M），delta vs 196124034 = 72559（0.04%，远小于百分位误差）。
- AC-003：`re_verified`。t445（AC-001~004）与 t448（AC-005/AC-006）既有用例位于同文件 codex-reader.test.ts，随上重跑全绿，单 model 差分语义未回归。

coverage = 3 / 3

reviewed_scope: 176988089e4a72e2

verdict: PASS
