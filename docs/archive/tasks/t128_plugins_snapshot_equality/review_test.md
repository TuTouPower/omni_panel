# Task review t128（reviewer_focus: 测试）

- task：`t128_plugins_snapshot_equality`
- spec：`docs/tasks/t128_plugins_snapshot_equality/spec.md`
- diff_anchor：`91992f535668d2544bb5db17242ef9a6bf7534c0`
- target：`git diff 91992f535668d2544bb5db17242ef9a6bf7534c0`
- round：1/2
- reviewed_at：2026-07-26 18:08 UTC+8

## Findings

### t128_test_f001 - AC2 未直接测试 `use_popup_derived` 的 memo 不重算

- 严重度：important
- 位置：`tests/unit/renderer/hooks/use_plugins.test.ts`（全文件，对应 spec 第 22 行 AC2）
- 问题：spec 验收标准第 2 条明确要求「`use_popup_derived` 直接依赖 `plugins` 的 memo（`rawGroups` / `visibleProviders` / `providerErrors`）在 snapshot 值未变时不重算」。当前 5 个用例均只断言 `result.current.plugins` 数组引用不变（`toBe(prev_plugins)`），并未直接测量/断言 `use_popup_derived` 中相关 `useMemo` 的依赖数组命中。虽然「`plugins` 引用不变 ⇒ memo 不重算」在 React 语义下可推导，但 AC2 本身是用户可观察行为（memo 重算会触发重渲染、影响性能），且 plan 第 1 步也仅要求断言数组引用不变，导致 plan 没有完全覆盖 spec AC2。
- 建议：新增一个用例渲染 `use_popup_derived`（或一个包装组件），在 `onStateChange` 触发内容等值的 snapshot 后，断言 `rawGroups` / `visibleProviders` / `providerErrors` 至少其中之一引用不变；或在该测试文件内通过 `renderHook` 组合 `use_plugins` + `use_popup_derived` 并比较 memo 返回值引用。

### t128_test_f002 - `badge` / `chart` 字段的快照相等性边界未测试

- 严重度：minor
- 位置：`tests/unit/renderer/hooks/use_plugins.test.ts`
- 问题：实现中的 `snapshot_equal` 通过 `deep_equal` 比较整个 `ConnectorSnapshotDTO`，理论上会覆盖 `badge` 与 `chart` 字段。但现有用例只覆盖了 `status` 和 `items`，未覆盖「`badge` 存在性差异」「`chart` 内容等值但引用不同」「`badge`/`chart` 一方缺失」等边界。若未来有人简化 `snapshot_equal`，这些分支最容易回退。
- 建议：补充 1-2 个边界用例：例如 ready snapshot 的 `chart` 数组内容相同但引用不同时应保持引用；`badge` 从 `undefined` 变为对象时应触发更新。

### t128_test_f003 - 引用相等快速短路路径未显式测试

- 严重度：minor
- 位置：`src/renderer/hooks/use-plugins.ts:91`（对应测试 `tests/unit/renderer/hooks/use_plugins.test.ts`）
- 问题：reducer 中先判断 `p.snapshot === state` 再进入 `snapshot_equal`。当前测试传入的新 snapshot 都是新对象，未覆盖「IPC 直接传入同一对象引用」时的快速返回路径。该路径是性能优化的一部分，丢失后不会导致功能错误，但属于本 task 意图的一部分。
- 建议：新增一个用例，向 `onStateChange` 回调传入与 `prev_snapshot` 完全相同的对象引用，断言返回原 `plugins` 引用。

## 结论

- 前轮 finding 复核（Round 2 才写）：无
- 本轮新发现：3 条（important 1 条、minor 2 条）
- 总体判断：测试可信、mock 边界合理、AC1/AC3 覆盖较好，但 AC2 未直接验证，且 badge/chart 等字段边界与引用相等短路路径缺少显式用例。

verdict: FAIL

## Round 2 (2026-07-26 18:17 UTC+8)

### 前轮 finding 复核

- **t128_test_f001（important）**：已修。新增用例 `keeps use_popup_derived memo references when snapshot value is unchanged` 直接组合 `use_plugins` 与 `use_popup_derived`，在 snapshot 值未变时断言 `rawGroups` / `visibleProviders` / `providerErrors` 三处 memo 输出引用均不变，覆盖了 spec AC2。
- **t128_test_f002（minor）**：已修。新增 `keeps reference when chart value is unchanged but reference differs` 验证 chart 内容等值但引用不同仍保持引用；新增 `updates when badge appears` 验证 badge 从 `undefined` 变为对象时触发更新，覆盖了 badge/chart 边界。
- **t128_test_f003（minor）**：已修。新增 `short-circuits on reference equality without calling snapshot_equal`，向 `onStateChange` 传入与当前 `snapshot` 完全相同的对象引用，断言 `plugins` 数组及单个 connector 对象引用均保持不变。

### 本轮新发现

无正式 finding。

### 观察与建议（非 finding）

- 用例 `short-circuits on reference equality without calling snapshot_equal` 的名称暗示其验证了未调用 `snapshot_equal` 这一实现细节，但测试实际只断言了结果引用不变；`snapshot_equal` 未导出，当前也无法直接 spy。建议后续将该用例名称改为更贴近可观察行为的表述（例如 `keeps plugins reference when receiving the same snapshot reference`），避免维护者误以为该用例守卫了具体的短路调用路径。

verdict: PASS
