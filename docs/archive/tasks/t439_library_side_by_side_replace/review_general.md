# Task review t439（reviewer_focus: 通用）

- task：`t439_library_side_by_side_replace`
- spec：`docs/tasks/t439_library_side_by_side_replace/spec.md`
- diff_anchor：`71f4b27e78e30c34a0990e86c13376e0c90261cd`
- target：`git -C '/home/karon/karson_ubuntu/omni_panel_t439' diff 71f4b27e78e30c34a0990e86c13376e0c90261cd`
- round：1
- reviewed_at：2026-09-03 07:45 UTC+8

## Findings

无（clean review，0 finding）。

## 结论

- 本轮新发现：0 条
- 视角体检摘要（7 视角均扫过，未命中项在此声明）：
    - 规格合规：AC-001/002/003 均已实现且有测试；diff 未触及非范围路径（单独打开、预览打开、最近会话、TokenStats 明细、槽位上限/选择 UX）。「更新 architecture.md / specs/workspace.md 描述」属 spec 标注的 Finalization 时机，当前实施期 diff 不含属预期。
    - 实现正确性：`SessionLibrary.tsx:639-647` on_open_all 同步顺序 clear → 逐个 open → switch；clear 侧 `use-workspace-columns.ts:300-312` clear_all 同步清 slots/columns/selection（unsubscribe 为 fire-and-forget IPC，与 `WorkspaceView.confirm_recent`（`WorkspaceView.tsx:106-120`）同构）；`SessionShell.tsx:152-154` on_clear_workspace 经既有 `clear_workspace_ref` 接 WorkspaceView 注册的 clear_all（`WorkspaceView.tsx:255-260`）。旧槽 unsubscribe 参数为新槽 session_id 之外的 loc，不会误退订新槽。
    - 安全审视：无外部输入拼接/执行；open 参数来自本地 token-stats 数据；无新增日志或 secret 暴露。
    - 契约·类型：新增必选 prop `on_clear_workspace` 唯一消费方 SessionShell 已传（grep 全仓仅一处挂载）；无 any/unknown 新增；测试 fixture `as never` 有既有先例（SessionShell.test.tsx:243 同款），非本 diff 新引入。
    - 性能与资源：无循环查库/N+1；open 循环为既有并排打开语义（每会话一次 IPC），本 diff 仅前置一次 clear（常数开销）。
    - 架构与可维护性：复用既有 clear_all 与 ref 接线，未新造第二套清槽逻辑，符合 spec「依赖与约束」；无死代码、无行为分叉。
    - 健壮性与可观测：clear_all 内部 unsubscribe 吞错为既有行为且列「有意不测」；未新增吞错/无日志上下文问题。
    - 测试可信与覆盖：断言触达真实行为而非 mock 内部状态——SessionShell 壳层用例（`SessionShell.test.tsx:313-369`）以 open→onFocus 回流模拟真实桌面装槽路径，断言 pane 集合恰为所选、旧槽消息消失且 `unsubscribe` 以旧槽 loc 被调（该断言只能由 clear_all 路径满足，顺序颠倒/漏 clear/漏 open 均会使用例失败，非恒真）。SessionLibrary 单测顺序断言依赖 `mock.invocationCallOrder`——已实证 @vitest/spy 该数组记录模块级全局 `callOrder`（`@vitest/spy/dist/index.js:34,94`），跨 mock 比较有效，clear(先) < open(后) 断言可辩护。无 `.skip`/删 expect/弱化断言/条件跳过。
    - 文档/配置一致性：task.md front matter 与实施状态一致；代码注释与实现一致。
- 未进表的提示：
    1. blueprint 文档（`docs/blueprint/architecture.md`、`docs/specs/workspace.md`）的「并排打开」描述更新标注为 Finalization 时机，收尾阶段须完成；届时遗漏则按改 spec 处置，不计本 diff 阻断。
    2. `SessionLibrary.test.tsx` 存在 9 条既有 act 警告（SessionCard2 未包 act），用 `-t "t439"` 过滤实测 t439 新增 2 用例 0 警告，属既有噪音非本 diff 引入。
    3. 范围外既有观察：on_open_all 的 open 为 fire-and-forget，真实 IPC 拒绝时无错误提示（diff 前已如此，t439 未改此段）。
- AC 复验方式：
    - AC-001：`re_verified`——跑 `npx vitest run tests/unit/renderer/components/session_shell/SessionShell.test.tsx` 绿；读代码确认 SessionShell→WorkspaceView clear_all→unsubscribe+clear_slots 接线与用例断言（2 pane、旧槽消息 null、unsubscribe(sess_old)）。
    - AC-002：`re_verified`——跑 SessionLibrary.test.tsx 用例「AC-001/AC-002」（无旧槽语境断言 clear 先于 open、open 恰 2 次且按勾选序、switch 1 次）绿。
    - AC-003：`re_verified`——同一文件「AC-003」用例绿；代码 `SessionLibrary.tsx:439-442` open_session 不含 clear 调用。
    - coverage = 3 / 3
- 总体判断：diff 范围克制、替换语义实现与测试均达 AC，未发现 blocking 或 minor 缺陷；测试全绿（两文件 58 passed）、eslint/prettier/tsc --noEmit 均干净。
- 系统性 follow-up：无

reviewed_scope: e0828c4221f144f3

verdict: PASS
