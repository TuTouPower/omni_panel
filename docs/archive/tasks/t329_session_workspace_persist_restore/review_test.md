# Task review t329（reviewer_focus: 测试）

- task：`t329_session_workspace_persist_restore`
- spec：`docs/tasks/t329_session_workspace_persist_restore/spec.md`
- diff_anchor：`f41bc10ebb13d5461d0997abb88202df2b6dede8`
- target：`git diff f41bc10ebb13d5461d0997abb88202df2b6dede8`
- round：1
- reviewed_at：2026-08-12 23:35 UTC+8

## Findings

### t329_test_f001 - 容错测试只断言槽位回退，损坏 layout 回退默认值无输出断言

- 严重度：minor
- 锚点：行为缺陷——损坏的 `workspace-layout` 解析失败回退默认值的**输出**从未被断言
- 位置：`tests/unit/renderer/components/workspace/WorkspaceView.test.tsx:1140`（「t329 容错」it）
- 问题：该测试同时把 `workspace-slots` 与 `workspace-layout` 写成 `"not-json"`，但仅断言 `工作台为空`（该结果只由槽位解析失败驱动，`WorkspaceView` 空态在 layout 分支之外）。`load_saved_layout` 的 catch→null→默认值路径被执行但无断言锚定：若实现回归为「不抛错但返回错误默认值」（如 `{layout: 0}` 或非法 view），测试仍会绿。同理，`workspace-layout` 为合法 JSON 但形状非法（`"{}"`、`{"layout":"x"}`）的回退分支也未测。
- 建议：损坏 layout 的用例中装入一个 seed 槽位（`seed_slots`），重挂载后断言默认布局/视图输出（如 grid `--cols: 3` 或「3 列 × 2 行」aria-pressed、`.conversation-message-time` 为 null），使 layout 回退分支有真实输出证据。

### t329_test_f002 - e2e reload 仅覆盖单槽位，AC-001「数量与顺序」维度无 e2e 守卫

- 严重度：minor
- 锚点：AC-001——覆盖更广的建议（多槽位数量/顺序仅在组件测试层有守卫）
- 位置：`tests/e2e/web/session_panel.spec.ts:251`（t329 e2e）
- 问题：e2e reload 只打开一个会话，断言的是「单个槽位身份恢复 + 消息重拉」；AC-001 的「同样数量、同样槽位顺序」多槽位维度依赖组件测试 AC-001 独立承担。组件测试层已真实覆盖该维度（换序 + 重挂载断言），分工合理，此处仅为 e2e 层可选项，不阻断。
- 建议：若需 e2e 层守卫，打开两个会话后 reload，断言 `.session-cell` 数量与 `.session-cell[data-loc-key]` 顺序一致；非必须。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无
- 改测方向复核：无。`git diff f41bc10e... -- tests/` 全部为纯新增（`saved_slots`/`seed_slots`/`mount_shell` 工具 + 新 describe + 新 e2e test），无既有测试被改预期或删除断言。
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
    - `mount_shell`（test:137）与既有 `render_shell`（test:128）几乎重复，仅差返回值；可合并，属测试结构清理。
    - AC-002 的「非报错」失败路径（query reject → 恢复槽位显示 missing 态）未测；属正常路径外扩展，非必需。
- 总体判断：5 条 AC 全部有真实、可挡回归的自动测试（组件层 6 例 + 真实 reload e2e 1 例），mock 边界正确（只 mock 外部 IPC，持久化走真实 `workspace-storage.ts` + jsdom localStorage），无恒真/弱化/删断言/跳过/mock 误用等危险模式，e2e 非假绿。仅 2 条 minor 覆盖扩展建议，不阻断。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`——组件测试 AC-001 打开两槽→断言 `workspace-slots` 写入顺序→unmount 重挂载→断言标题顺序恢复；已运行 `npx vitest run WorkspaceView.test.tsx`（40/40 通过）。恢复路径唯一来源是 `load_saved_slots()`（重挂载无 onFocus/URL loc），save/load 任一处回归均会导致断言失败。
- AC-002：`re_verified`——组件测试 AC-002 seed 槽位后挂载，断言 `subscribe`/`query({limit:200})` 被调且消息「你好」渲染；e2e reload 后 `.conversation-message-row` 再次可见（消息不持久化，重拉是唯一来源）。
- AC-003：`re_verified`——组件测试 AC-003 改 1 列 + 显示时间戳 + 紧凑模式，断言 `workspace-layout` 写入，重挂载断言 grid `--cols: 1` 与 time/compact 类；布局/视图持久化任一回归都会使断言失败（默认 layout=3/count 联动会落到 `--cols: 2`）。
- AC-004：`re_verified`——组件测试 AC-004 点「清空」后断言 `saved_slots()` 全 null，重挂载断言空工作台；save 效应缺失则清空后遗留旧数据，断言失败。
- AC-005：`re_verified`——组件测试 AC-005 用真实 DOM `fireEvent.dragStart/drop` 触发 SessionRail 的 `onDragStart/onDrop`（与既有 t224 rail 测试同交互模式，非 `.value=` 程序赋值），断言持久化顺序交换 + 重挂载标题顺序交换。

coverage = 5 / 5

reviewed_scope: ebb07eeed16457df

verdict: PASS

## Round 2 (2026-08-12 23:45 UTC+8)

### 前轮 finding 复核

- **t329_test_f001（minor）——已修，真修**：新增测试 `tests/unit/renderer/components/workspace/WorkspaceView.test.tsx:1147-1156`「t329 容错 test f001：损坏 workspace-layout 回退默认布局（3 列、视图关）」。实测链路：`load_saved_layout()` 对 `"not-json"` 抛错→catch→null（workspace-storage.ts:62-64）→ SessionShell 状态回退 `layout=3`、`view={show_time:false,compact:false}`（SessionShell.tsx:23-26）→ 挂载 effect `save_layout` 写回 localStorage（SessionShell.tsx:38-40）→ 断言读回写回值匹配 `{layout:3, view:{show_time:false,compact:false}}`。非恒真：回退默认值错（如 `layout:0`）、save 效应移除（读回仍为 `"not-json"`，`JSON.parse` 抛错）、`load_saved_layout` 未捕获抛错（渲染崩溃）任一回归都会使断言失败。该断言锚定「损坏→回退默认→写回」真实存储链路；与 AC-003 测试（写自定义布局→重挂载→断言恢复）共同钳制 `load_saved_layout` 合法/损坏两条分支。
- **t329_test_f002（minor）——已修（接受分工）**：e2e 保持单槽位真实 `page.reload()`（tests/e2e/web/session_panel.spec.ts:250-268，断言 `data-loc-key` 恢复 + 消息重拉渲染），未弱化；AC-001「同样数量、同样顺序」多槽位维度由组件测试独立承担（AC-001 开两槽断言写入顺序+重挂载恢复顺序，AC-005 拖拽换序断言持久化+恢复），分工合理，task.md:54 登记已修。

### 改测方向复核

无。本轮仅新增 f001 测试；无既有测试被改预期或删断言。

### 本轮新发现

0 条。

### 未进表的提示

- 测试内注释（test:1150-1151）写「视图开关渲染（无 show_time/compact 标记）即回退默认」，实际断言经写回值验证 view 关，未直接断言 DOM 标记；措辞略超前于断言内容，属注释精度问题，不影响测试真实性。
- Round 1 提示的 `mount_shell`/`render_shell` 重复（test:128/136）清理建议仍未处理，非本轮范围。

### AC 复验方式（本轮回合）

- 组件套件复跑：`npx vitest run tests/unit/renderer/components/workspace/WorkspaceView.test.tsx` → 41/41 通过（Round 1 为 40，+1 即 f001 测试）。`pnpm typecheck` → 0 错误。
- AC-001/002/003/004/005：`re_verified`——与 Round 1 相同断言锚点，既有测试本轮未改动，复跑通过（见上）。
- 本轮新 f001 测试补充 AC-003 的损坏分支（layout 回退默认并写回），属 AC-003 re_verified 一部分。

coverage = 5 / 5

### 总体判断

两个 minor 均闭环：f001 以真实存储写回断言补齐损坏 layout 回退默认的输出锚点（非恒真），f002 以接受分工方式闭环并登记。未发现新危险模式、新回归。Round 2 verdict：PASS。

reviewed_scope: 70d8dab78645a7e2

verdict: PASS
