# Task review t391（reviewer_focus: 代码）

- task：`t391_config_debounce_patch_merge`
- spec：`docs/tasks/t391_config_debounce_patch_merge/spec.md`
- diff_anchor：`2f1a3e631cceb794694d8fe19a68359cc9d33a4f`
- target：`git diff 2f1a3e631cceb794694d8fe19a68359cc9d33a4f`
- round：1
- reviewed_at：2026-08-15 09:00 UTC+8

## Findings

### t391_code_f001 - 嵌套对象同键整体覆盖：失败快照的其他字段在有部分 diff 型 caller 时会丢（当前 caller 不受影响）

- 严重度：minor
- 锚点：行为缺陷 + 潜在丢失场景（AC-001 语义为「键粒度」，嵌套对象整体覆盖是键粒度合并的固有语义）
- 位置：`src/renderer/lib/config-debounce.ts:64-68`（catch 的 `!(key in pending)` 守卫）
- 问题：守卫按**顶层键**判定。若失败快照与在途新 patch 同顶层键，整个失败值被丢弃、只保留在途值。对嵌套对象 `collapsedAccounts` 这类整体快照型 patch，丢弃正确（最新快照含失败值中仍有效的字段，被丢弃的字段即用户已回退）；但若未来出现**部分 diff 型** caller（如仅 `{collapsedAccounts:{a:true}}` 切换单个账号），失败 flush 在途期间同键再 patch 会导致失败快照的其他字段被丢。例：flush 失败快照 `{collapsedAccounts:{a:true}}`，在途 patch `{collapsedAccounts:{c:true}}`，重试保存 `{c:true}`，`a` 折叠状态丢失。修复前后丢失方向相反：旧行为（`Object.assign`）丢在途新字段、保存失败旧快照；新行为丢失败快照中在途未含的字段。核实当前 caller（`src/renderer/views/PopupView.tsx:269/276/301-304/308`）均 patch **全量快照**（整 `collapsed_accounts` record、整 `providerOrder` 数组），故现状无可观测丢失，且键粒度「最新全量快照胜出」正确。此 minor 仅记录潜在边界，不构成本 task 缺陷。
- 建议：可接受（spec 明确定义键粒度语义，当前 caller 全量快照不受影响）。如需消除边界，可在文档/comment 标注「嵌套对象按顶层键原子合并，仅支持全量快照 patch」；或后续若出现 diff 型 caller 再升级为深层合并。

## 结论

- 前轮 finding 复核：无（round 1）
- 本轮新发现：1 条（minor）
- 未进表的提示：
  - `key in pending` 用 `in` 运算符含原型链：`pending` 是 `{}`（继承 Object.prototype），若配置键恰好叫 `toString`/`constructor` 会误判为「已有」而跳过合并。当前配置键为 schema 封闭集（schemaVersion/language/plugins/launchAtLogin/providerOrder/collapsedAccounts/expandedProviders/accountOrders/sparklineWindowDays/providerL2Open 等），无冲突，理论隐患不构成缺陷。
  - spec 背景区路径 `src/renderer/hooks/config-debounce.ts` 与实际 `src/renderer/lib/config-debounce.ts` 不符（pre-existing spec 笔误，非本 diff 引入，本 task 文件即为 lib 下正确位置）。
  - 文件大小：config-debounce.ts 104 行、测试 170 行，均远低于阈值，无过大提示。
  - 圈复杂度：catch 为单层循环 + 单分支，CC 低，无提示。
  - 范围外观察：diff 仅触及 config-debounce.ts、测试文件、task.md front-matter（status/branch/diff_anchor 簿记），无越界改动。全仓 `Object.assign(pending, ...)` 仅剩 config-debounce.ts:85 正常 patch 路径，与 p175 核实结论一致。
- 总体判断：实现与 spec 三 AC 逐条对齐，AC-001/002 有可判别测试（AC-001 旧代码会保存 old 值而失败断言），AC-003 正常路径与 t356 用例未动且 9/9 绿、tsc --noEmit 通过；嵌套对象语义经 caller 核实无现害。仅 1 条 minor，PASS。
- 系统性 follow-up：无

verdict: PASS
reviewed_scope: d379c39a04cc2e26
