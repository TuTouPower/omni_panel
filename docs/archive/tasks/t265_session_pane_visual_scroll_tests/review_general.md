# Task review t265（reviewer_focus: 通用）

- task：`t265_session_pane_visual_scroll_tests`
- spec：`docs/tasks/t265_session_pane_visual_scroll_tests/spec.md`
- diff_anchor：`2a22f5f5a848e97863fe40854167bf9d7479b783`
- target：`git diff 2a22f5f5a848e97863fe40854167bf9d7479b783`
- round：1
- reviewed_at：2026-08-08 17:45 UTC+8

## Findings

### t265_gen_f001 - 长列表选中态保持用例未真正断言「保持」，滚动后不复查已选消息

- 严重度：important
- 锚点：违反 AC2「包含长列表虚拟滚动场景下选中态保持的回归用例」。
- 位置：`tests/unit/renderer/components/workspace/SessionPane.test.tsx:332-337`
- 问题：第 3 例（「长列表虚拟滚动下选中态保持且 DOM 行数受控」）滚动后只断言 `.pane-msg-row` 数量 `< 100` 与 checkbox 数量 `> 0`，从未复查先前勾选的消息 m94 在虚拟化卸载/重挂后仍为选中。test 标题、注释（332 行「选中态仍保持」）与 task.md 实施笔记都声称验证了「选中态保持」，但断言并未触达该行为。失败场景：若回归把选中态改成行本地状态或虚拟化重挂时丢选中，滚动离开后勾选项被清空，本测试仍通过。
- 建议：滚动到中间窗口并断言新窗口行数受控后，再滚回包含 m94 的窗口（如 `scrollTop` 置回可见第 94 条的区间），断言 m94 的 checkbox 仍 `toBeChecked()`，真正覆盖「虚拟化裁剪下选中态保持」。

### t265_gen_f002 - 大纲定位断言用宽松阈值且注释错写偏移倍数

- 严重度：minor
- 锚点：行为缺陷——「大纲点击消息滚动定位」断言的坏结果：scrollToId 定位到错误消息（偏移 240 及以上）或直接置底 2000 时断言仍通过。
- 位置：`tests/unit/renderer/components/workspace/SessionPane.test.tsx:252,268`
- 问题：jsdom 无 ResizeObserver，heights 恒为空，偏移完全确定（第 3 条消息 index=2，偏移 = 80*2 = 160），却用 `toBeGreaterThanOrEqual(120)` 而非精确值，无法区分「定位到正确目标」与「定位到更晚消息/直接置底」。252 行注释「偏移 ≈ 3 * 80」也错（应为 2\*80）。断言仍能拦住「scrollToId 完全不生效」（scrollTop 停留 0），故非恒真，定 minor。
- 建议：改 `toBe(160)`（jsdom 下确定性成立）或收紧为窄区间，并修正 252 行注释。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无
- 本轮新发现：2 条
- 未进表的提示：
    - 全量 `pnpm test`：2657 passed / 8 skipped，无失败断言；但 `tests/integration/local-api/server.test.ts` 有 1 处未处理 rejection（AbortError，t263 搜索中止用例相关），属本 diff 之外存量，非 t265 引入，AC3 视为满足。
    - act 警告仅出现在本 diff 外的 settings/config 测试（CpaConnectorSettings / SettingsForm）；`SessionPane.test.tsx` 与新增 typography 测试单跑均无 act 警告。
    - `task.md` front matter（status/branch/worktree/diff_anchor）由脚本维护，改动符合预期；正文实施笔记与实现一致。
- 总体判断：AC1（CSS 文本断言 + 类名映射，两处组件覆盖）、AC2 的滚动定位与回底按钮状态、AC3 均达成；唯一未落实的是 AC2 明列的「选中态保持」回归——第 3 例的滚动后断言未触及该行为，属 claim 与证据不符。有 1 条未解决 important，故 FAIL。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-08 17:47 UTC+8)

### 前轮 finding 复核（以 diff 为准）

- **t265_gen_f001（important）— 已消除**：长列表用例现为「滚到 m94 窗口（scrollTop=7520）勾选 → 滚动中间（2000）断言 m94 checkbox 不在 DOM（虚拟化卸载）→ 滚回 m94 窗口重挂后新查询 `m94_again` 仍 `toBeChecked`」。选中态存于 Parent 的 id 全集 Set；若回归改为行本地态或卸载丢选中，重挂后断言必失败。真正覆盖 AC2「虚拟化裁剪下选中态保持」。窗口边界确定（jsdom 无 ResizeObserver，偏移 80 步进），无 flakiness。
- **t265_gen_f002（minor）— 已消除**：大纲定位断言改精确 `toBe(160)`（index=2，偏移确定 = 2\*80），252 行注释已修正。与 VirtualMessageList scrollToId useLayoutEffect 实际行为一致。

### 本轮新发现

0 条

### 未进表的提示

- `SessionPane.test.tsx` 13 例单跑全绿，无 act 警告；t265 新增 typography 3 例与此前一致。
- 340 行 `rendered_rows.length < 100` 断言偏弱（虚拟化必然成立），但非恒真、非危险模式，且相邻的 m94 卸载/重挂断言已承载核心验证，不另出 finding。

### 总体判断

f001、f002 均已按建议修复，diff 与实现一致，无未解决 critical / important。PASS。

verdict: PASS
