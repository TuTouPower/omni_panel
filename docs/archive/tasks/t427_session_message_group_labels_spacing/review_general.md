# Task review t427（reviewer_focus: 通用）

- task：`t427_session_message_group_labels_spacing`
- spec：`docs/tasks/t427_session_message_group_labels_spacing/spec.md`
- diff_anchor：`787660015b18a1b264733e8446b7565ebb50504b`
- target：`git diff 787660015b18a1b264733e8446b7565ebb50504b`
- round：1
- reviewed_at：2026-08-16 23:20 UTC+8

## Findings

### t427_gen_f001 - 连续 user 消息底色块无行间间距，视觉连通（AC-004「块间可观察间隔」未实现）

- 严重度：important
- 锚点：AC-004（相邻 user 背景块之间可观察到间隔）、AC-003（任意相邻消息行之间存在固定、非零垂直间距；不得因连续同角色变为零间距贴合）；范围区「块间保留间距，不合并为整组连通底」
- 位置：`src/renderer/components/workspace/PaneMessageRow.tsx:76-77`、`src/renderer/components/workspace/VirtualMessageList.tsx:185-193`
- 问题：行根 div className 为 `group flex gap-2 py-1 rounded-md bg-[var(--color-primary-container)]`（user 行），`py-1` 是**行内 padding**（默认被背景覆盖，background-clip 默认 border-box），不是行间 margin。虚拟列表每个 item 是 `VirtualMessageList.tsx:188` 的无样式 wrapper div，wrapper 之间无 margin/padding/gap；`grep` 全仓确认 `.virtual-message-list` 无任何全局 CSS 补偿。因此两条连续 user 消息的底色块垂直方向紧贴，无可见空隙，视觉呈现为连通色带（base commit `7876600` 同构——本 task 未对间距结构做任何改动，仅保留既有 `py-1`）。AC-003 的「行与行之间」间距（margin/gap 语义）实际为 0；AC-004 的「块间可观察间隔」在 CSS 结构上不成立。spec 测试策略「不强制像素级视觉回归」豁免的是 token 数值美学，不是「块间有无间隔」的结构事实，不属上下文区「有意不测」范畴。
- 建议：为行增加真实行间间距——在行根 div 加 `mb-1`/`my-1`（margin 不被背景覆盖），或给 item wrapper 加 padding；需注意 `compute_message_offsets` / ResizeObserver 以行元素 contentRect 计算高度，margin 在 contentRect 之外，改结构后须核对 `docs/blueprint/architecture.md` 中虚拟列表测量路径（避免 scroll 补偿误差）。并在测试中把「间隔」断言从「每行存在 py-1」升级为能触达行间结构（如断言行根存在 margin 类而非 padding 类）。

### t427_gen_f002 - WorkspaceView 旧测试就地改写断言，未按 TDD 原则「保留红测或整体删除并写明理由」

- 严重度：minor
- 锚点：AGENTS.md 开发原则「实现变更让旧测试语义失效时……旧测试原样保留或整体删除并写明理由，禁止就地把旧测试的预期改成当前实现的输出」；AC-009 既有测试回归
- 位置：`tests/unit/renderer/components/workspace/WorkspaceView.test.tsx:903-923`（t224 测试改名并就地替换断言）、`:1285`、`:1299`（t329 删除两处时间断言，无理由注释）
- 问题：旧断言「点开『显示时间戳』→ 时间节点出现」与 AC-007 新语义（show_time 对消息时间无效）直接冲突，语义失效正确；但处置方式是把旧断言**就地改成新输出**（开关 on + 折叠态 → 时间节点为 null）而非「原样保留红测或整体删除并写明理由」。t329 两处删除无注释。结果与 spec 一致、非掩盖 bug（t427 块已新增新语义测试），故仅流程/可追溯性瑕疵，不阻断。
- 建议：在测试注释或 task.md 处置表补一句语义变更理由（AC-007 使旧断言失效），或将旧断言删除并注明；不需改断言本身。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无
- 本轮新发现：2 条（f001 important、f002 minor）
- 未进表的提示：
  - `PaneView.show_time` 接口字段（`src/renderer/components/workspace/SessionPane.tsx:21`）与 `WorkspaceToolbar.tsx:81-87`「显示时间戳」开关在本 task 后失去所有消费方：开关仍可切换并持久化（`workspace-storage.ts:16,61,103`），但对消息时间无任何效果。AC 允许「保留开关 UI」，故不算违反 AC；属允许取舍内的半实现残留，建议后续随 UI 清理任务一并移除或复用，本 task 不阻断。
  - SessionPane t427 测试存在 React `act(...)` 警告（异步状态更新未包 act，如 AC-008 用例）。断言仍同步有效（测试通过），属测试卫生问题；若该警告为新增而非既有模式，可随 t433「弹窗异步断言稳定化」类任务顺带收敛。
- 总体判断：AC-001/002/005/006/007/008/009 实现与测试成立，但 AC-003/AC-004 的核心视觉语义「行间可见间距 / user 底色块不连通」未在实现层落实（f001），存在未解决 important，不能放行。
- 系统性 follow-up：建议「虚拟列表行间距与 offset 测量对齐」（若按 f001 建议引入行间 margin，需同步验证 scroll 补偿）；无既有 tid。

### AC 复验方式

- AC-001：`re_verified`——读 `SessionPane.test.tsx` t427 块断言 `labels` 等于 `["用户", null, "Agent", null]`，重跑该文件 34 用例通过。
- AC-002：`re_verified`——同上一组（user→assistant 切换处断言出现 "Agent"）。
- AC-003：`re_verified`（断言侧）——重跑测试确认「每行含 py-1」断言通过；但 f001 判定该断言未触达 AC 行为本体，行间（margin 语义）间距为 0，AC 行为未满足。
- AC-004：`re_verified`（断言侧）——重跑测试确认「两条 user 行各自带 primary-container class 且为独立元素」断言通过；f001 判定「块间可观察间隔」在 CSS 结构上不成立，AC 行为未满足。
- AC-005：`re_verified`——读断言（assistant 行 className 不含 primary-container）并重跑通过。
- AC-006：`re_verified`——读 `PaneMessageRow.test.tsx` t427 块（mock scrollHeight/clientHeight 后点击展开，断言折叠 0 节点 / 展开 1 节点；timestamp null 分支 0 节点），重跑通过。
- AC-007：`re_verified`——结构性复验：`show_time` prop 已从 `PaneMessageRow` 移除（时间仅随 `expanded && timestamp !== null`），WorkspaceView 测试断言开关 on + 折叠态时间节点仍为 null；重跑通过。
- AC-008：`re_verified`——读断言（12 分钟间隔产生 divider，divider 两侧同 role 第二条无标签），重跑通过。
- AC-009：`re_verified`——相关既有测试（t237 memo、t408 展开）原样保留并通过；全量 `pnpm test` 276 文件 3351 通过 / 9 跳过 / 0 失败。

coverage = 9 / 9

reviewed_scope: 335b7ea818413072

verdict: FAIL

## Round 2 (2026-08-16 23:25 UTC+8)

- task：`t427_session_message_group_labels_spacing`
- spec：`docs/tasks/t427_session_message_group_labels_spacing/spec.md`
- diff_anchor：`787660015b18a1b264733e8446b7565ebb50504b`
- target：`git diff 787660015b18a1b264733e8446b7565ebb50504b`
- round：2
- reviewed_at：2026-08-16 23:25 UTC+8

## Findings（Round 2）

本轮无新 finding。

## 结论（Round 2）

- 前轮 finding 复核（以当前 diff 与代码/测试为准）：
  - **t427_gen_f001（important，AC-003/AC-004）→ 已消除**。背景从行根 div 移到内容容器：`PaneMessageRow.tsx:103-109` body 现带 `rounded-md bg-[var(--color-primary-container)]`（user），行根 `:74-82` 仅保留 `group flex gap-2 py-1`、user bg 分支移除。py-1 为行内 padding 且背景只在 body 子容器上 → 相邻行 padding 区透明，两条连续 user 底色块间形成固定 8px（4px+4px）可见间隔，不再连通贴合；agent 行 body 无 bg（AC-005 不受影响）。所有行统一 py-1，间距量不随同组连发/异组切换变化（AC-003）。测试断言升级到 body 容器：`PaneMessageRow.test.tsx:169-172`（t408 AC-003 查 `conversation-message-body` 的 bg）、`SessionPane.test.tsx` t427 AC-003/004（每条 user 行 body 各自带 bg + 全行 py-1 统一 + data-message-id 独立）——与 spec 可测试性声明「断言行上统一间距类 + 相邻行外层保留间距结构」一致。修复保留 padding 而非引入 margin：`VirtualMessageList.tsx` 不在 diff，行高结构与 base 相同（py-1 为既有），Round 1 提示的虚拟列表 offset/scroll 补偿风险未引入。重跑 3 个测试文件 94 用例全过。
  - **t427_gen_f002（minor，测试断言改无理由）→ 已消除**。两处就地改写均补语义变更注释：`WorkspaceView.test.tsx:903-906`（t224 用例更名并注明 AC-007 使旧 show_time 断言失效）、`:1266-1268`（t329 注明两处时间断言移除原因）；`task.md` Round 1 处置表已记 `已修` + fix_ref。
- 本轮新发现：0 条
- 未进表的提示：
  - SessionPane 测试的 React act(...) 警告仍存在（测试通过、断言有效）：Round 1 已记为测试卫生观察并指向 t433 既有 follow-up，未新增影响，不重复计。
  - `SessionPane.view.show_time`（`:21`）与工具栏「显示时间戳」开关保留但无消息时间消费方：spec 明确允许保留开关 UI，属允许取舍内残留，不阻断。
- 总体判断：前轮 2 个 finding 均已按建议修复且修复未引入新问题；AC-001～AC-009 实现与测试成立，无未解决 critical / important。
- 系统性 follow-up：无新增（Round 1 建议的「虚拟列表行间距与 offset 测量对齐」因采用 padding 方案无需触发；t433 测试卫生项既有）。

### AC 复验方式（Round 2）

- AC-001：`re_verified`——SessionPane t427 用例断言 labels `["用户", null, "Agent", null]`，重跑通过。
- AC-002：`re_verified`——同上（user→assistant 切换处出现 "Agent"）。
- AC-003：`re_verified`——结构复核：行根统一 `py-1`、bg 移至 body 子容器，padding 区透明形成固定可见间距；断言（PaneMessageRow t427 AC-003 + SessionPane t427 AC-003/004）与 spec 测试策略一致，重跑通过。
- AC-004：`re_verified`——每条 user 行 body 独立带 primary-container bg，相邻行间 8px 透明 padding 间隔，断言查 body 容器，重跑通过。
- AC-005：`re_verified`——assistant body 无 bg 断言通过。
- AC-006：`re_verified`——PaneMessageRow t427 AC-006（折叠 0 节点 / 展开 1 节点）通过。
- AC-007：`re_verified`——`show_time` prop 已从 `PaneMessageRow` 移除，时间仅随 `expanded && timestamp !== null`；WorkspaceView t224 断言开关 on 折叠态仍无时间节点，重跑通过。
- AC-008：`re_verified`——SessionPane t427 AC-008（12 分钟 divider 不拆组，labels `["用户", null]`）通过。
- AC-009：`re_verified`——t237 memo / t408 既有用例原样保留通过；e2e `session_panel.spec.ts` 依赖的 row/check testid 与 `.selected` class 未变；`pnpm typecheck` 与 `pnpm exec eslint`（5 个触及文件）干净。

coverage = 9 / 9

reviewed_scope: ea1830898a970c73

verdict: PASS
