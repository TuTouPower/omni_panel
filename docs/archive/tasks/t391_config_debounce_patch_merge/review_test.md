# Task review t391（reviewer_focus: 测试）

- task：`t391_config_debounce_patch_merge`
- spec：`docs/tasks/t391_config_debounce_patch_merge/spec.md`
- diff_anchor：`2f1a3e631cceb794694d8fe19a68359cc9d33a4f`
- target：`git diff 2f1a3e631cceb794694d8fe19a68359cc9d33a4f`
- round：1
- reviewed_at：2026-08-15 08:52 UTC+8

## Findings

无 finding。

## 结论

- 前轮 finding 复核：本轮为 Round 1，不适用。
- 改测方向复核：无。diff 未改动任何既有测试，仅新增两个 `it` 块（`config-debounce.test.ts:131`、`config-debounce.test.ts:149`）；断言编码新语义（重试保存用最新值 / 非冲突键保留），非迁就实现。t356 既有用例原样保留且保持绿（本仓 `npx vitest run tests/unit/renderer/lib/config-debounce.test.ts` 9/9 通过）。
- 本轮新发现：0 条。
- 未进表的提示：
  - AC-001 断言只验证「重试保存用最新值」可观察结果；若实现把失败 patch 整体丢弃（而非仅冲突键不补），AC-001 仍会通过（pending 保留在途新值）。该缺口由 AC-002（断言两键都保存，丢整个失败 patch 则非冲突键缺失即挂）与 t356 AC-003「keeps patch on flush failure and retries」补位，三用例合起来完整锁定语义，不构成覆盖缺口。
  - AC-002 断言在旧 `Object.assign` 实现下同样通过（无冲突键时 assign 本就保留）——正确，AC-002 属行为保持型回归护栏（防「冲突即丢全部失败 patch」一类 bug），区分新旧实现的判别力在 AC-001，职责互补。
- 总体判断：测试可信。AC-001/AC-002 通过公共 `flush()`/`patch()` 接口驱动真实失败重试与在途 patch 交织，断言落在最终 `save` 载荷（存储效果，用户可观察）；`mockImplementationOnce` 内 `patch` 在 save 仍处 reject 传播前同步执行，恰为修复目标「失败在途期间」竞态窗口，非测试技巧；失败 save mock 位于存储边界，mock 使用合规。逐条危险模式扫描无命中（无恒真/弱化/删断言/跳过独占/阈值掩盖/存在即通过）。无未解决 critical/important。

## 系统性 follow-up

无。

verdict: PASS
reviewed_scope: d379c39a04cc2e26
