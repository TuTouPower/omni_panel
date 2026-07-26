---
tid: t128
slug: plugins_snapshot_equality
diff_anchor: "91992f535668d2544bb5db17242ef9a6bf7534c0"
branch: "t128_plugins_snapshot_equality"
---

# Task t128_plugins_snapshot_equality

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 无事项时写：无

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-26 18:08 UTC+8)

| finding_id     | severity  | status | rationale                                                                     | fix_ref                                       |
| -------------- | --------- | ------ | ----------------------------------------------------------------------------- | --------------------------------------------- |
| t128_test_f001 | important | 已修   | 新增用例直接渲染 use_popup_derived，验证 plugins 引用不变时 memo 输出引用不变 | tests/unit/renderer/hooks/use_plugins.test.ts |
| t128_test_f002 | minor     | 已修   | 补充 badge / chart 字段值相等但引用不同、存在性变化的边界用例                 | tests/unit/renderer/hooks/use_plugins.test.ts |
| t128_test_f003 | minor     | 已修   | 补充传入同一 snapshot 引用时 plugins 引用不变的用例                           | tests/unit/renderer/hooks/use_plugins.test.ts |

### Round N (YYYY-MM-DD HH:MM UTC+8)

（有 finding 时用本表；每条 finding 一行。）

| finding_id     | severity                 | status | rationale | fix_ref   |
| -------------- | ------------------------ | ------ | --------- | --------- |
| t128_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t128` 查，不在此记。

### 验收标准勾选

- [x] snapshot 值未变时 `plugins` 数组引用不变（reducer 返回 `prev`）。
- [x] `use_popup_derived` 直接依赖 `plugins` 的 memo（`rawGroups` / `visibleProviders` / `providerErrors`）在 snapshot 值未变时不重算。
- [x] snapshot 值变化时正常生成新引用并触发重渲染。
- [x] `pnpm typecheck` 通过。
- [x] `pnpm test` 全绿（黑盒全量仅 vault/secrets 相关 flaky 超时测试失败，单独重跑通过；与本 task 无关）。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：FAIL
- Round 2 code：PASS
- Round 2 test：PASS

### 遗留

- 无

### 结果摘要

- 在 `use-plugins.ts` reducer 中增加 `p.snapshot === state` 快速短路 + `snapshot_equal` 深度值比较；snapshot 未变时保持 `plugins` 数组及单个 `ConnectorInfo` 引用，变化时创建新引用。
- 新增 9 个测试覆盖：引用不变、值变化更新、items 等值不同引用、items 内容变化、跨 instance 隔离、同一引用短路、chart 等值不同引用、badge 出现触发更新、`use_popup_derived` memo 引用不变。
