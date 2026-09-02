# Task spec

## 背景

会话库 SelectionDock「并排打开」当前只循环 `sessionHistory.open` 追加装槽，不清空工作台已有会话；与 frontend demo、工作台「最近会话」确认的替换语义不一致。用户期望：多选并排打开后工作台只剩所选会话。

## 契约区

### 范围

- 会话库「并排打开 (n)」改为先清空工作台全部槽位，再按所选顺序打开这些会话并切换到工作台页签。
- 补单测：覆盖「工作台已有旧槽 → 并排打开后仅含所选」的替换语义。
- 更新相关 spec / architecture 中「并排打开」描述，与行为一致。

### 非范围

- 会话库「单独打开」/预览「单独打开」（保持装入/追加语义）。
- TokenStats 明细表勾选批量「打开历史」。
- 工作台「最近会话」确认路径（已是 clear + open，不改）。
- 槽位上限、摘选 store 消息选择 UX 以外的行为变更（清空工作台时沿用现有 `clear_all` 副作用即可）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `.repo_template/docs/usage.md`「命名与格式」。

<!-- /规范 -->

- [ ] AC-001：工作台已有至少一个会话时，在会话库勾选 1–8 个会话并点击「并排打开」，切换到工作台后槽位集合恰好等于所选会话（旧槽全部消失，所选按打开顺序装入，无额外会话）。
- [ ] AC-002：工作台原本为空时，会话库「并排打开」仍按所选顺序装入并切到工作台页签，行为与有旧槽时一致（仅所选）。
- [ ] AC-003：会话库「单独打开」仍只装入该会话（不因本 task 改为先清空全部槽位）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001：可自动测试（单测 mock clear + open 顺序，或集成层断言槽位结果）
- AC-002：可自动测试
- AC-003：可自动测试（单独打开路径不断言 clear / 不调用 clear）

## 上下文区

- 来源：p208（2026-09-03 核实：`SessionLibrary` `on_open_all` 无 clear；`SessionShell.clear_workspace_ref` 未下传；对照 `WorkspaceView.confirm_recent` 与 demo `Library.openInWorkspace`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- `clear_all` 内部 unsubscribe IPC 失败吞掉：既有行为，本 task 不新增断言
- web/desktop `sessionHistory.open` 桥接差异：沿用现有桥，本 task 只保证 clear 先于 open 调用

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 扩展 `tests/unit/renderer/components/session_library/SessionLibrary.test.tsx`（或壳层测试）：为 `SessionLibrary` 注入/暴露清空回调时，断言「并排打开」先调用 clear 再对所选逐个 `sessionHistory.open`，且切工作台；「单独打开」不调用 clear。
- 若实现落在 `SessionShell` 接线，可补壳层单测证明 props 下传；不必强上 e2e。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：清空后 open 经 IPC/`onFocus` 异步到达时，若 clear 与 open 竞态可能导致短暂空台或丢打开；须保证 clear 同步完成后再发起 open（与 `confirm_recent` 同序）。
- 回退：还原 `SessionLibrary` `on_open_all` 与 `SessionShell` 接线，恢复追加语义。

### 依赖与约束

- 复用现有工作台 `clear_all`（退订旧槽 + `clear_slots` + 清空摘选消息选择），不新造第二套清槽逻辑。
- 参考范式：`WorkspaceView.confirm_recent`、demo `openInWorkspace`。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：会话库 SelectionDock「并排打开」改为「先清空工作台再装入所选」
- `docs/specs/workspace.md`：同步 SelectionDock 并排打开描述
