# Task review t329（reviewer_focus: 代码）

- task：`t329_session_workspace_persist_restore`
- spec：`docs/tasks/t329_session_workspace_persist_restore/spec.md`
- diff_anchor：`f41bc10ebb13d5461d0997abb88202df2b6dede8`
- target：`git diff f41bc10ebb13d5461d0997abb88202df2b6dede8`
- round：1
- reviewed_at：2026-08-12 23:45 UTC+8

## Findings

### t329_code_f001 - restore_slot_meta 与 open_session 重复 13 字段 session_meta 形参字面量

- 严重度：minor
- 锚点：代码质量 DRY；无当前可观测行为缺陷
- 位置：`src/renderer/components/workspace/use-workspace-columns.ts:22-41`（restore_slot_meta）与 `:233-249`（open_session 内 session_meta 调用）
- 问题：`restore_slot_meta` 里构造 `session_meta({ id, source, env, model, title, directory, input_tokens, ..., started_at, ended_at }, Date.now())` 的 13 字段对象字面量与 `open_session` 内 `session_meta(...)` 的形参几乎逐字重复，仅 `model: ""` / `directory: null` / 计数归零 与 `meta?.model ?? ""` / `meta?.cwd ?? null` 两处差异。`SlotSession` 字段未来演进（如新增状态/摘要字段）时两处需同步修改，漏改即行为分叉。当前无分叉，属维护性重复。
- 建议：抽 `function minimal_slot_meta(loc: Loc, meta?: { model?: string; cwd?: string | null }): SlotSession`，restore 与 open_session 共用；或至少 extract 出共同字段基座。

### t329_code_f002 - is_loc 仅校验 string 形态，source 经 `as` 强转进 subscribe/query

- 严重度：minor
- 锚点：实现正确性（损坏数据容错边界）；当前失败路径为优雅降级，无崩溃/数据损坏
- 位置：`src/renderer/lib/workspace/workspace-storage.ts:80-88`（is_loc）与 `src/renderer/components/workspace/use-workspace-columns.ts:25-26`（`as TokenStatsSession["source"]` / `as ...["env"]`）
- 问题：`is_loc` 只校验 source/env/session_id 为 `string`，未收窄到合法 source 枚举；带字符串形态但非法 source（如 `"foo"`）的持久化条目会通过校验，经 `restore_slot_meta` 的 `as` 断言携带非法 source 走到 `subscribe`/`query`/`getSessions`。三者各有 catch 兜底，最终槽位显示 `status="missing"`，不崩溃——符合 spec「损坏回退」意图，但 type guard 与强转之间存在类型鸿沟，`as` 断言掩盖了「storage 层未经枚举校验」这一事实。损坏数据若恰好是合法枚举外的常见值（如空串），行为仍可观测为永久 missing 槽位。
- 建议：`is_loc` 内对 source 做 `LAYOUT` 无关的合法来源收窄（或用项目既有 source 白名单），使坏数据在 storage 层直接落 null；若维持宽松校验，则在 `restore_slot_meta` 对非法 source 提前置 null 并加注释说明容忍度。

## 结论

- 前轮 finding 复核：Round 1，无前轮
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
    - 文件膨胀（降级规则）：`src/renderer/components/workspace/use-workspace-columns.ts` 415 行（≥400 阈值，本 task 净增 +46）；`tests/unit/renderer/components/workspace/WorkspaceView.test.tsx` 1146 行（≥600 阈值，本 task 净增 +184）。均未导致可观测缺陷，仅提示可拆分。
    - 冗余写入观察：槽位写入 effect（`use-workspace-columns.ts:357-359`）依赖 `slots_state`，除增/删/换序/清空外，恢复挂载与每次 `refresh_slot_meta` 更新元数据也会重写整份 8 槽 JSON 到 localStorage。幂等无害，仅写入频度略高，不构成 finding。
    - 范围外观察：`SessionShell.tsx:22` 用 `useMemo` 与 `useState` 初始化各读一次 localStorage（`load_saved_layout` 被调两次），纯读幂等，可接受，不构成 finding。
- 总体判断：t329 槽位/布局/视图持久化实现正确且完整覆盖 AC-001~005。懒初始化（`useState` 初始器）先于写入 effect 执行，杜绝恢复数据被空槽覆盖的竞态；恢复槽位复用既有 `mount_column` 链路（订阅 + query + refresh_slot_meta）；StrictMode 双挂载经「模拟卸载退订 → 重挂载重订阅」闭环，无订阅泄漏；损坏数据在 storage 层 try/catch + 逐元素校验回退；layout/view 归属 SessionShell、槽位归属 useWorkspaceColumns，双 key 独立写入无冲突；clear_all/move_slot_ui 经 slots_state 变更统一落盘；initial_loc 用 `try_add_slot` 落入首个空槽，与恢复槽位并行不冲突。仅 2 条 minor，不阻断。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`——组件测试 AC-001 断言两槽写入 `workspace-slots` 顺序与重挂载标题顺序恢复；独立重跑 `npx vitest run tests/unit/renderer/components/workspace/WorkspaceView.test.tsx`（40/40 通过）；代码 `use-workspace-columns.ts:60-66` 懒初始化恢复、`:357-359` 写入 effect。真实浏览器 reload 变体由 e2e 覆盖，依赖实施侧已跑过该 e2e 的证据（trust_prior 补充项）。
- AC-002：`re_verified`——组件测试 AC-002 seed 槽位后断言 `subscribe`/`query({limit:200})` 被调且消息「你好」渲染；恢复复用 `mount_column` 链路（`use-workspace-columns.ts:168-219`、`:350-354`）。
- AC-003：`re_verified`——组件测试 AC-003 改 1 列 + 显示时间戳 + 紧凑模式后断言 `workspace-layout` 写入、重挂载 grid `--cols:1` 与 time/compact 类；代码 `SessionShell.tsx:22-40`（restore 与 save effect）。
- AC-004：`re_verified`——组件测试 AC-004 点「清空」后断言 `saved_slots()` 全 null、重挂载空工作台；`clear_all → apply_slots(clear_slots()) → 写入 effect` 链路闭合。
- AC-005：`re_verified`——组件测试 AC-005 以真实 DOM `fireEvent.dragStart/drop` 走 `SessionRail` 的 `onDragStart/onDrop`（`SessionRail.tsx:71-79`）→ `move_slot_ui` → 写入 effect，断言持久化与重挂载顺序交换。

coverage = 5 / 5

reviewed_scope: ebb07eeed16457df

verdict: PASS

## Round 2 (2026-08-12 23:44 UTC+8)

### 前轮 finding 复核（以 diff 与当前代码核实，不采信处置表）

- **t329_code_f001**（DRY 重复）——**已修**。抽取 `slot_session_from_loc(loc, overrides)`（`use-workspace-columns.ts:28-47`），`restore_slot_meta`（`:49-51`）与 `open_session`（`:243`）复用。行为逐字段核对不变：restore 走默认 `overrides={}` → `undefined ?? ""` / `undefined ?? null` / `undefined ?? null` = model `""` / title `null` / directory `null`，与原字面量一致；open_session 传 `{ model: meta?.model, directory: meta?.cwd }` → `meta?.model ?? ""` / `meta?.cwd ?? null` / title `null`，与原文一致。id/source/env/四维归零/started_at/ended_at 均不变。
- **t329_code_f002**（is_loc 类型鸿沟）——**已修**。`is_loc`（`workspace-storage.ts:82-91`）新增 `KNOWN_SOURCES.has(source)`，KNOWN_SOURCES（`:80`）= {claude_code, opencode, kimi_code, grok}，与 `tokenStatsSourceSchema`（`token-stats.ts:5`）逐字一致。字符串形态但非法 source 的条目在 storage 层直接落 null，不再经 `as` 强转进 subscribe/query；`slot_session_from_loc` 内 `as TokenStatsSession["source"]` 现由 is_loc 收窄背书，类型鸿沟闭合。save 路径只写真实会话 loc（合法 source），重读必过 is_loc，无回环截断。

### 本轮新发现（1 条 minor）

#### t329_code_f003 - KNOWN_SOURCES 硬编码 source 枚举字面量，与 tokenStatsSourceSchema 复制漂移

- 严重度：minor
- 锚点：代码质量 DRY；未来枚举演进时静默丢槽的维护风险（当前无缺陷）
- 位置：`src/renderer/lib/workspace/workspace-storage.ts:80`
- 问题：KNOWN_SOURCES 手写 `["claude_code","opencode","kimi_code","grok"]`，与 `tokenStatsSourceSchema`（`token-stats.ts:5`）enum 字面量逐字重复。f002 修复本身正确（当前集合与枚举一致），但这是新增的一处 source 枚举硬编码。tokenStatsSourceSchema 未来新增 source 时本文件编译不报错，而 is_loc 会在重载时把该新 source 的已保存槽位静默落 null——与 f002 想防的「合法槽位重开后消失」同类，只是失败模式从非法 source 换成未来合法 source。renderer 已从 shared/types/token-stats 导入类型（`use-workspace-columns.ts:2`），直接由 schema 派生即可消除复制。
- 建议：`const KNOWN_SOURCES = new Set(tokenStatsSourceSchema.options);` 从 schema 派生，或将该集合抽到 shared 类型层由 schema 导出，storage 层引用。

### 结论

- 前轮 finding 复核：f001 已修（行为逐字段核对不变）；f002 已修（KNOWN_SOURCES 与 tokenStatsSourceSchema 逐字一致，type guard 收窄后 `as` 断言有背书）。均无遗留。
- 本轮新发现：1 条（f003，minor）
- 未进表的提示：
    - `SlotSessionOverrides.title` 字段两处调用方均未传，恒走 `?? null`，冗余可选字段可删；不构成 finding。
    - is_loc 仍只校验 env 为 string（未收窄 local/wsl），`as TokenStatsSession["env"]` 与 f002 同构的类型鸿沟仍在；Round 1 已将 f002 范围限定 source，env 为稳定 2 值枚举且坏值优雅落 missing，不重复报。
    - f002 新增 KNOWN_SOURCES 分支无测试直接覆盖：现有容错用例（`WorkspaceView.test.tsx:1140`）仅覆盖 `"not-json"` 解析失败，未 seed「source 为字符串但非法」条目断言落空槽。测试覆盖缺口，留给 test reviewer。
    - 复杂度/文件膨胀：本 task diff 无新超阈值文件；use-workspace-columns.ts 415 行（净增同前轮）未导致可观测缺陷，不再提示。
- 总体判断：f001/f002 修复到位且行为保持，无新回归；`npx tsc --noEmit` 0 错、`WorkspaceView.test.tsx` 41/41 通过。仅 1 条 minor，不阻断。
- 系统性 follow-up：无

### AC 复验方式

- 本轮修复（f001/f002）仅触及恢复链路内部（helper 抽取 + is_loc 收窄），未改变 AC-001~005 可观测行为；Round 1 已对 5 条 AC `re_verified` 并给出代码路径锚点，本轮以 `npx tsc --noEmit`（0）与 `npx vitest run tests/unit/renderer/components/workspace/WorkspaceView.test.tsx`（41/41）复核该链路未回归。
- coverage = 5 / 5

reviewed_scope: 70d8dab78645a7e2

verdict: PASS
