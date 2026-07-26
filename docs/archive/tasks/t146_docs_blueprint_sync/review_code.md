# Task review t146（reviewer_focus: 代码）

- task：`t146_docs_blueprint_sync`
- spec：`docs\tasks\t146_docs_blueprint_sync/spec.md`
- diff_anchor：`f8c7610cbefe1113f9a8b0bac1a8e4773de1299c`
- target：`git diff f8c7610c`
- round：1
- reviewed_at：2026-07-26 16:14 UTC+8

## Findings

### t146_code_f001 - 工作区混入未在 spec 范围内的 t124 改动

- 严重度：important
- 位置：`docs/tasks/t124_move_session_meta_to_lib/task.md:1-62`；`docs/tasks_index.json:7-8`
- 问题：`git diff f8c7610c` 除了 t146 spec 列出的文件外，还包含 `docs/tasks/t124_move_session_meta_to_lib/task.md` 的完整收尾改动（`diff_anchor`/`branch` 回填、验收标准勾选为 `[x]`、Round 1 verdict PASS、结果摘要）以及 `docs/tasks_index.json` 中将 t124 从 `backlog` 改为 `active` 并填入 `branch` 的改动。但 t146 的 spec 范围明确只涉及 `docs/handoff.md`、`docs/blueprint/*`、`docs/bugs.md`、`docs/specs/*`、`docs/specs_index.md` 和 `src/main/core/connector/runtime.ts`；t124（`session_meta` 迁移至 `src/renderer/lib/`）是独立 task，与 t146 文档同步无关。若按当前工作区提交，t146 的 commit 将混入 t124 的收尾内容，违反 AGENTS.md「一个 task 内一个 commit」的硬约束，也使 t146 的变更边界不可追溯。
- 建议：将 t124 的改动从 t146 工作区拆出，在 t124 自己的分支/流程中单独提交；t146 只保留 spec 范围内文件的变更。

## 结论

- 前轮 finding 复核：Round 1 无前轮。
- 本轮新发现：1 条（t146_code_f001）。
- 总体判断：t146 spec 范围内的文档同步内容事实准确、引用有效、ADR 编号唯一（008/009 无重复），LocalAPI/sandbox/providerForcePercent 等描述与源码及 web-panel spec 一致，runtime.ts 的失效 `D8` 引用已清除；但工作区混入了未在 spec 范围内的 t124 改动，需拆出后重审。

verdict: FAIL

### Round 2 (2026-07-26 16:28 UTC+8)

#### 前轮 finding 复核

- **t146_code_f001 - 工作区混入未在 spec 范围内的 t124 改动**：**未修**。`git diff f8c7610c` 仍包含 `docs/tasks/t124_move_session_meta_to_lib/task.md` 的完整收尾改动（`diff_anchor`/`branch` 回填、验收标准勾选为 `[x]`、Round 1 verdict PASS、结果摘要），且工作区存在未跟踪的 `docs/tasks/t124_move_session_meta_to_lib/review_code.md` 与 `review_test.md`。若按当前工作区提交，t146 commit 仍会带入 t124 收尾内容，违反 AGENTS.md「一个 task 内一个 commit」硬约束。

#### 本轮新发现

### t146_code_f002 - specs_index.md 未按 spec 修正 vendor slug

- 严重度：important
- 位置：`docs/specs_index.md:44`
- 问题：spec AC5 要求 `docs/specs_index.md` slug 改 `vendor_forms_oauth_weblogin`，但实际条目仍为 `vendor-forms-oauth-weblogin`（连字符）。对应 spec 文件名为 `docs/specs/vendor_forms_oauth_weblogin.md`（下划线），slug 与文件名不一致，也违反项目 snake_case 约定；按 slug 拼接路径会失败。该修复项在 `docs/reviews/review_20260726_054747/adoption_decision.md` 中已明确采纳。
- 建议：将 `docs/specs_index.md:44` 的 slug 改为 `vendor_forms_oauth_weblogin`。

### t146_code_f003 - architecture.md 内置连接器数量与实际情况不符

- 严重度：minor
- 位置：`docs/blueprint/architecture.md:65`、`docs/blueprint/architecture.md:120`
- 问题：目录树旁注写“`connectors/` # 13 个内置连接器”，但 `connectors/` 目录实际有 16 个内置连接器；§6“与旧 SPEC 的关键差异”写“现状 12 个连接器全部带 `connector.ts`”，也与实际 16 个不符。`docs/blueprint/domain.md` 已同步为 16 个内置 provider，architecture.md 两处数量未同步。
- 建议：将 `architecture.md:65` 的“13 个”改为“16 个”，`architecture.md:120` 的“12 个”改为“16 个”，与 `domain.md` 及 `connectors/` 实际保持一致。

### t146_code_f004 - config-store.md 引用已不存在的 `ipc.md`

- 严重度：minor
- 位置：`docs/specs/config-store.md:40`
- 问题：该行写“导入导出见 `ipc.md`（`CONFIG_EXPORT`/`CONFIG_IMPORT`…）”，但 `docs/specs/ipc.md` 已拆分为 `ipc-api.md`/`ipc-electron.md`，当前仓库中不存在 `docs/specs/ipc.md`。这会导致读者无法定位 `CONFIG_EXPORT`/`CONFIG_IMPORT` 的现行权威文档（相关内容实际落在 `docs/specs/secret-vault.md`）。
- 建议：将 `ipc.md` 改为现行有效引用；例如指向 `secret-vault.md` 的导入/导出章节，或补充 `ipc-api.md` 中对应 channel 的说明后再引用。

#### 结论

- 前轮 finding 复核：t146_code_f001 未修，t124 改动仍在 diff/工作区。
- 本轮新发现：3 条（t146_code_f002 / t146_code_f003 / t146_code_f004）。
- 总体判断：t146 spec 范围内的多数同步已落地（LocalAPI 0.0.0.0/Bearer、node:vm sandbox、runtime.ts 清除 D8、domain provider 列表、bugs.md t111、window-management 交叉引用、ADR 008/009 唯一、platform-services-electron 续期未实现、providerForcePercent string key、conventions 命名迁移策略），但 `specs_index.md` 关键 slug 未改属于 AC 缺失；`architecture.md` 连接器数量与 `config-store.md` 交叉引用仍有遗漏；且 t124 未拆出导致 commit 边界不清。

verdict: FAIL
