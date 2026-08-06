# Task review t224（reviewer_focus: 测试）

- task：`t224_workspace_slot_rail`
- spec：`docs/tasks/t224_workspace_slot_rail/spec.md`
- diff_anchor：`f392135dade8531cc72ab2dfeef2e1ed941c5753`
- target：`git diff f392135dade8531cc72ab2dfeef2e1ed941c5753`
- round：1
- reviewed_at：2026-08-06 11:20 UTC+8

## Findings

### t224_test_f001 - AC10「历史分页能力不回归」在槽位层完全无测试（旧覆盖删除后未补回）

- 严重度：important
- 锚点：AC 10「装入槽位的会话保持实时更新与历史分页能力不回归」
- 位置：`src/renderer/components/workspace/WorkspaceView.tsx:111-146, 203, 402-419`；`tests/unit/renderer/components/workspace/WorkspaceView.test.tsx`（全文件）
- 问题：旧 `session_history_view.test.tsx` 删除的 2 条分页/兜底测试（「初始查询 limit 200；滚动到顶触发 load_older 前置加载更早（决策 17）」「5s 兜底拉取合并新消息去重（不重复已加载）」）在新 `WorkspaceView.test.tsx` 中没有任何等价覆盖。新测试全部将 `sessionHistory.query` mock 为 `{ messages: [], next_cursor: null }`（13 处），从未：断言初始 query 调用参数 `{ limit: 200 }`、设置非空 `next_cursor` 后触发滚动 `load_older` 前置分页、验证 `merge_tail` 去重或 5s 兜底合并。而这些生产逻辑在 WorkspaceView 中真实存在且是本次迁移的新宿主（`load_older` 111-146、mount_column 初始 limit=HISTORY_PAGE_SIZE(200)、FALLBACK_MS 周期 402-419、`merge_tail` 39-47）。分页维度为 refactor 型覆盖丢失，AC10 的「历史分页能力」半条完全无测试。
- 建议：补 1-2 条组件测试：① 初始 query 断言 `{ limit: 200 }`，mock 首查返回 `next_cursor: "c1"`，对 `.history-msgs` 触发 `fireEvent.scroll`，断言第二次 query 带 `before_cursor: "c1"` 且更早消息前置、尾部完整；② 用 `onMessagesUpdated` 推送重复 id + 新 id，断言列表去重不重复（沿用旧测试语义）。

### t224_test_f002 - AC4 会话选择弹窗「搜索 / agent 筛选带计数 / 已打开标记」无测试

- 严重度：important
- 锚点：AC 4「可按标题/路径搜索、按 agent 筛选（带计数）、已打开的会话有「已打开」标记」
- 位置：`src/renderer/components/workspace/SessionPickerModal.tsx:41-60, 132-134`；测试 `tests/unit/renderer/components/workspace/WorkspaceView.test.tsx:243-256`
- 问题：AC4 明确列出的三项 picker 能力全部无测试。仅有的 picker 测试「会话选择弹窗：点空槽打开、点会话装入目标槽位」只覆盖开弹窗 + 点行装入。`filtered` 搜索匹配（title/directory/id）、`sources` agent 计数页签、`已打开` 角标均为真实生产逻辑（useMemo 计算 + 渲染），没有任何测试触达：无 `fireEvent.change` 输入搜索框、无点击 agent 页签、无「已打开」断言。
- 建议：补 picker 组件测试：① 输入搜索词断言列表过滤；② 点击 agent 页签断言只显示对应 source 且页签计数正确；③ 打开 picker 前已装入某会话，断言该行出现「已打开」标记。

### t224_test_f003 - AC5 最近会话弹窗「按日期倒序 / 上限 8 / 顺序角标」无测试

- 严重度：important
- 锚点：AC 5「按日期倒序、上限 8、有快捷「最近 2/4/8 个」；确认后清空并替换全部槽位」
- 位置：`src/renderer/components/workspace/RecentSessionsModal.tsx:24, 36-43, 86-99, 121`；测试 `tests/unit/renderer/components/workspace/WorkspaceView.test.tsx:223-241`
- 问题：AC5 的排序、上限、顺序角标均无测试。仅有的 recent 测试喂入已按 `ended_at` 降序排好的数据，断言不到 `b.ended_at - a.ended_at` 排序；`toggle` 里 `MAX_PICK` 上限（第 9 个拒绝）未测；选择顺序角标数字未测；`picked.length === 0` 时确认按钮 disabled 未测。这些均为弹窗真实行为。
- 建议：补 recent 组件测试：① 喂乱序 sessions 断言渲染按日期倒序；② 选中第 9 个时被拒（标题计数不超过 8/8）；③ 点 3 行断言角标 1/2/3；④ 未选时确认按钮 disabled。

### t224_test_f004 - 消息选择迁移覆盖退化：清除本栏 / 跨栏计数 / Markdown 内容 / 已复制反馈 未测

- 严重度：minor
- 锚点：行为缺陷（迁移能力覆盖变薄，非 AC 硬缺口）
- 位置：`src/renderer/components/workspace/WorkspaceView.tsx:346-355, 357-386`；测试 `tests/unit/renderer/components/workspace/WorkspaceView.test.tsx:186-204`
- 问题：旧 6 栏测试覆盖「全选本栏 / 清除本栏生效」「跨栏选中计数合计、推送刷新后保留」「复制生成 Markdown 并写剪贴板、按钮变已复制 ✓」。新测试「消息选择与复制生成 Markdown」仅覆盖全选 + `write_spy` 被调用，未测：`clear_selection_in_column`（清除本栏）、跨槽位 `total_selected` 合计、复制的 Markdown 内容、按钮「已复制 ✓」反馈状态。消息选择/复制为迁移能力，删测后未等量补回。
- 建议：补断言「清除本栏」后计数归零、两槽位各选 1 条时工具栏「复制 2 条」、复制后 `writeText` 参数含标题与消息文本。

### t224_test_f005 - AC1「rail 可折叠/展开」无测试

- 严重度：minor
- 锚点：AC 1「rail 可折叠/展开」
- 位置：`src/renderer/components/workspace/SessionRail.tsx:33-42`；`tests/unit/renderer/components/workspace/WorkspaceView.test.tsx`（全文件）
- 问题：无测试点击折叠按钮或断言 `.session-rail.collapsed` 类切换。折叠为简单布尔状态切换，风险低，但属 AC1 列明能力。
- 建议：渲染后点击「折叠槽位栏」，断言 rail 类含 `collapsed` 且空槽/「添加会话」区隐藏；再点展开断言恢复。

### t224_test_f006 - AC3 布局切换未断言网格重排

- 严重度：minor
- 锚点：AC 3「网格按选择重排」
- 位置：`src/renderer/components/workspace/WorkspaceView.tsx:461, 535`；测试 `tests/unit/renderer/components/workspace/WorkspaceView.test.tsx:138-144`
- 问题：布局切换测试只断言按钮自身 `.on` 类变化，未断言 `.slot-grid` 的 `--cols` 样式变量或面板列数随之变化；且该测试在 count=0 空态下运行（网格未渲染）。`effective_columns` 判定逻辑已单元测试（`workspace_slots.test.ts`），但 `cols = min(effective_columns(...), count)` 的组件接线未验证。
- 建议：装入 ≥2 会话后点布局按钮，断言 `.slot-grid` 的 `--cols` 值按预期变化。

## 结论

- 前轮 finding 复核（Round 1）：不适用。
- 改测方向复核：仅 `SessionShell.test.tsx` 修改 2 处断言（`未打开会话`→`工作台为空`），对应视图替换（SessionHistoryView→WorkspaceView）的新语义，属「断言应有的预期」，合法，非迁就实现。
- 删测试合法性：`session_history_view.test.tsx`（18 条）整体删除由 spec 要求（6 栏模型被 8 槽位模型取代），删除本身合法；但删除的分页（f001）、选择细节（f004）覆盖未在 `WorkspaceView.test.tsx` 等量补回，已列为 finding。
- 本轮新发现：6 条（3 important + 3 minor）。
- 未进表的提示：
    - `src/renderer/components/session-history/HistoryOverflowModal.tsx` 已成死代码（全仓无引用），AC9「栏满弹窗不存在」结构性成立、无负向断言；死代码清理属 code reviewer 职责。
    - 「槽位全满后 onFocus 新会话 toast 拒绝」测试断言了 toast，但未复断「已有槽位不变（仍 8/8）」。
    - rail 拖拽换位测试只断言 rail 顺序，未断言 `.slot-pane` 网格顺序；因 rail 与网格同源 `slots_state`，暗示成立。
    - 「添加会话」底按钮（rail-add）与空态「去会话库」按钮打开 picker 的入口未测（AC4 的「或」语义已由空槽入口覆盖）。
    - 未知契约清单：实现选择走 `tokenStats.getSessions` 取数（picker 与 recent 均用），字段齐全，清单无 `UNVERIFIED` 残留，核实通过。
- 总体判断：删除/补测方向合理、新测试均触达生产逻辑、无危险模式；但 AC10 分页、AC4 picker 过滤、AC5 recent 排序/上限三条 AC 能力在槽位层无测试，存在未解决 important，需补测后复审。
- 系统性 follow-up：无。

verdict: FAIL

## Round 2 (2026-08-06 11:51 UTC+8)

- diff_anchor：`f392135dade8531cc72ab2dfeef2e1ed941c5753`（同 round 1，当前工作区）
- 复核方式：读 `WorkspaceView.test.tsx` 全量新增 7 条用例 + `workspace_slots.test.ts` + 实现侧 `WorkspaceView.tsx` / `SessionPickerModal.tsx` / `RecentSessionsModal.tsx` / `SessionRail.tsx` / `slots.ts`；实跑 `WorkspaceView.test.tsx`（20 用例，连跑 3 次全绿）、`workspace_slots.test.ts`（16 用例）、`SessionShell.test.tsx`（8 用例）全绿。
- 前轮 3 important + 3 minor 全部已修，无残留 blocker；本轮新增 2 minor。

## Findings

### t224_test_f007 - merge_tail 去重与 5s 兜底合并仍无测试（round 1 f001 建议②未落实）

- 严重度：minor
- 锚点：AC 10「实时更新不回归」子行为；round 1 f001 建议②
- 位置：`WorkspaceView.test.tsx:146-167`（推送测试仅推新 id）；`src/renderer/components/workspace/WorkspaceView.tsx:40-48`（merge_tail）、`:415-431`（5s 兜底）
- 问题：round 1 f001 建议①的分页已补（限 200 + load_older 前置），但建议②的 merge_tail 去重与 5s 兜底合并未补。旧 `session_history_view.test.tsx`「5s 兜底拉取合并新消息去重（不重复已加载）」删除后无等价覆盖。现有「消息推送追加」只推 `m2`（新 id），merge_tail 的 `filter` 剔除重复分支与 `fresh.length === 0` 提前返回分支均不触达；FALLBACK interval 无 fake timer 驱动。实现真实存在且为本次迁移新宿主，属 refactor 型覆盖残留。
- 建议：补 1 条：`onMessagesUpdated` 推送重复 id + 新 id，断言列表只含各 id 一份（沿用旧测试语义）；或 fake timer 推进 5s 驱动兜底合并断言去重。

### t224_test_f008 - 分页测试未断言「更早前置」顺序，append 错位实现仍绿

- 严重度：minor
- 锚点：round 1 f001 建议①「更早消息前置、尾部完整」
- 位置：`tests/unit/renderer/components/workspace/WorkspaceView.test.tsx:327-335`
- 问题：分页测试断言了二次 query 带 `before_cursor: "c1"`、且「更早」「你好」两条消息均在场，但未断言二者 DOM 相对顺序。`load_older` 若被误写成 append（`[...cur.messages, ...q.messages]`），「更早」「你好」仍同时在场，测试照样 PASS，前置语义未锁死。round 1 建议明确含「更早消息前置」。
- 建议：断言 `.history-msgs` 内「更早」节点在「你好」之前（如按 `querySelectorAll` 索引或 `compareDocumentPosition`）。

## 结论

- 前轮 finding 复核（Round 2）：
    - `t224_test_f001`（important，分页无测试）：已消除。新增「历史分页：初始 limit 200，滚动到顶 load_older 前置更早消息」触达 `mount_column` 首查（断言 `{ limit: 200 }`）、`handle_scroll → load_older`（断言二次 query 带 `before_cursor: "c1"`）与前置合并；实跑绿。建议②去重/兜底残留，已列为新 minor f007。
    - `t224_test_f002`（important，picker 过滤无测试）：已消除。「picker：搜索过滤、agent 筛选带计数、已打开标记」对 `filtered` 搜索（`会话二` → 列表只剩该项）、`sources` 计数页签（`全部 3`、`Claude 1`）、`open_session_ids` 已打开角标（`已打开` + 标题含角标）均做断言，触达 `SessionPickerModal` 真实 useMemo/渲染。实跑绿。
    - `t224_test_f003`（important，recent 排序/上限/角标无测试）：已消除。两条用例触达 `RecentSessionsModal` 真实 `sort(b.ended_at - a.ended_at)`（喂乱序 [old,mid,new]，断言渲染 [new,mid,old]）、`toggle` 的 `MAX_PICK` 上限（第 9 个被拒，`.on` 恰 8）、顺序角标（`1`/`2`/空）、`picked.length === 0` 确认 disabled。实跑绿。
    - `t224_test_f004`（minor，清除本栏/跨栏计数）：已消除。「清除本栏与跨槽位选中计数合计」先双栏各选 1 断言「复制 2 条」，清除首栏后断言「复制 1 条」，触达 `clear_selection_in_column` 与 `total_selected` 合计。实跑绿。
    - `t224_test_f005`（minor，rail 折叠）：已消除。「rail 可折叠/展开」断言 `.session-rail` 的 `collapsed` 类随「折叠槽位栏/展开槽位栏」按钮切换，触达 `set_rail_collapsed` toggle。实跑绿。
    - `t224_test_f006`（minor，布局 --cols 接线）：已消除。「布局切换联动网格列数（--cols）」装入 2 会话后点「布局 4/8」，断言 `.slot-grid` 内联 `--cols: 2`（count=2 封顶），触达 `cols = min(effective_columns(...), count)` 组件接线。实跑绿。
- 改测方向复核：本轮无迁就实现式改测。`SessionShell.test.tsx` 两处断言由旧视图文本「未打开会话」改为新视图「工作台为空」，属视图替换（SessionHistoryView→WorkspaceView）的预期更新，与 round 1 判定一致，合法。
- 本轮新发现：2 条（均 minor，f007/f008）。
- 未进表的提示：
    - 实现侧 code 修复复核（测试一致性）：
        - `add_session` 查重 toast「该会话已在槽位 N」（WorkspaceView.tsx:268-288，code f002）：无测试触发「picker 内点已打开会话」路径，但现有 picker 测试点的是空槽装入（无冲突），语义与实现一致；该 toast 属可选补测。
        - `confirm_recent` 清空前退订旧槽位（WorkspaceView.tsx:481-502，code f004）：recent 确认测试从空工作台启动，退订旧槽位分支未触达；unsubscribe 路径已由「关闭槽位移除会话并退订」覆盖同 IPC 语义。可选补测。
        - rail 满槽「添加会话」disabled（SessionRail.tsx:113-124，code f008）与 rail 徽标/agent 色（code f005/f001）：无断言 disabled 态与 CSS 变量，但「槽位全满」toast 测试与现有渲染不受影响，行为一致。
        - `refresh_slot_meta` ref 同步（code f003）：「onFocus 打开会话装入槽位」断言 `/3 轮/`、`/375 tokens/` 触达该逻辑，已覆盖。
    - 「槽位全满」测试（WorkspaceView.test.tsx:292-309）断言了 toast 但未在 toast 后复断「仍 8/8」；store 层 `workspace_slots.test.ts`「8 槽全满后 try_add_slot 拒绝」已断言槽位不变，两层合起来满足 AC 6「已有槽位不变」。
    - `--cols` 测试在 jsdom 固定 `window.innerWidth=1024` 下 `effective_columns` 封顶 2，布局 4/8 均得 `--cols: 2`，未验证「布局切换实际改变列数」的差异化场景；属可再加 case，不阻断。
    - 全量 `pnpm test` 其余相关文件（`workspace_slots.test.ts`、`SessionShell.test.tsx`）实跑绿，无跨文件破坏。
- 总体判断：round 1 的 3 important + 3 minor 全部经 diff 与实跑核实已消除，无未解决 critical / important；新增 2 minor 为可选覆盖扩展，不阻断。
- 系统性 follow-up：无。

verdict: PASS
