# Task review t100（reviewer_focus: 代码）

- task：`t100_l2_state_reset_on_collapse`
- spec：`docs\tasks\t100_l2_state_reset_on_collapse/spec.md`
- diff_anchor：`b5d2c4766369e593a073184d381056fc687c4a73`
- target：`git diff b5d2c4766369e593a073184d381056fc687c4a73`
- round：1
- reviewed_at：2026-07-24 13:28 UTC+8

## Findings

### t100_code_f001 - ProviderCard 已超过实现源码文件膨胀阈值

- 严重度：minor
- 位置：`src/renderer/components/ProviderCard.tsx:121`
- 问题：该文件当前 442 行，已超过实现源码 400 行 minor 阈值；本 task 在其中净增 4 行（新增 `useEffect` 重置逻辑），且 diff 未给出不可拆分硬约束。
- 建议：后续修改该组件前，将 L2 视图切换或卡片内容渲染职责抽至独立组件或 hook，避免继续向此文件堆叠。

### t100_code_f002 - provider_card 测试文件已超过测试源码文件膨胀阈值

- 严重度：minor
- 位置：`tests/unit/renderer/components/provider_card.test.tsx:223`
- 问题：该文件当前 925 行，已超过测试源码 600 行 minor 阈值；本 task 新增 36 行测试，且 diff 未给出必须维持单文件的硬约束。
- 建议：按 ProviderCard 功能域拆分测试文件，并将共享 fixture 保留在公共 helper，避免继续在单一测试文件累积用例。

## 结论

- 本轮新发现：2 条。
- 总体判断：折叠时重置 `l2open` 的实现覆盖 spec 所列状态序列，未见功能正确性或规格偏离；但两个改动文件均已超过适用的文件膨胀阈值且本 task 继续增量。

verdict: FAIL
