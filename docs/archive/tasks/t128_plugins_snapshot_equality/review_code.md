# Task review t128（reviewer_focus: 代码）

- task：`t128_plugins_snapshot_equality`
- spec：`docs/tasks/t128_plugins_snapshot_equality/spec.md`
- diff_anchor：`91992f535668d2544bb5db17242ef9a6bf7534c0`
- target：`git diff 91992f535668d2544bb5db17242ef9a6bf7534c0`
- round：1
- reviewed_at：2026-07-26 18:09 UTC+8

## Findings

本轮未发现 finding。

## 结论

- 前轮 finding 复核：无
- 本轮新发现：0 条
- 总体判断：`src/renderer/hooks/use-plugins.ts` 的改动精准落在 spec 范围内，通过 `p.snapshot === state` 快速路径 + `snapshot_equal` 深度值比较，在 snapshot 未变时保留 `plugins` 数组及单个 `ConnectorInfo` 对象的原有引用；snapshot 变化时仍创建新数组与新对象触发下游更新。实现与 s002 spike 方案 B 的意图一致，未引入额外功能或偏离范围改动。

verdict: PASS

## Round 2 (2026-07-26 18:14 UTC+8)

### 前轮 finding 复核

Round 1 test reviewer 提出的 3 条 finding 已在测试文件中补充对应用例，从代码侧观察均已修：

- `t128_test_f001`（AC2 未直接测试 `use_popup_derived` memo）：新增用例 `keeps use_popup_derived memo references when snapshot value is unchanged`（`tests/unit/renderer/hooks/use_plugins.test.ts:386-429`），直接组合渲染 `use_plugins` + `use_popup_derived`，断言 `rawGroups` / `visibleProviders` / `providerErrors` 引用不变。
- `t128_test_f002`（`badge` / `chart` 边界未测）：新增 `keeps reference when chart value is unchanged but reference differs`（`tests/unit/renderer/hooks/use_plugins.test.ts:307-345`）与 `updates when badge appears`（`tests/unit/renderer/hooks/use_plugins.test.ts:347-384`）。
- `t128_test_f003`（引用相等短路路径未测）：新增 `short-circuits on reference equality without calling snapshot_equal`（`tests/unit/renderer/hooks/use_plugins.test.ts:281-305`）。

### 本轮新发现

本轮未发现新代码级 finding。

`src/renderer/hooks/use-plugins.ts` 改动保持最小且落在 spec 范围内：

- `deep_equal` / `snapshot_equal` 仅对 plain object / array 做递归值比较，满足 `ConnectorSnapshotDTO` 的只读字段比较需求；
- reducer 先 `p.snapshot === state` 短路、再 `snapshot_equal` 深度比较，未变化时返回原 `ConnectorInfo` 对象及原 `plugins` 数组引用；
- snapshot 变化时创建新数组与新对象，触发下游更新；
- 未引入范围外改动，与 s002 方案 B 意图一致。

verdict: PASS
