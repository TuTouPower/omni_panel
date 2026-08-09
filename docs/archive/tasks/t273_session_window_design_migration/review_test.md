# Task review t273（reviewer_focus: 测试）

- task：`t273_session_window_design_migration`
- spec：`docs/tasks/t273_session_window_design_migration/spec.md`
- diff_anchor：`3834359300692ab9a701a3c888ff76c9497e6224`
- target：`git diff 3834359300692ab9a701a3c888ff76c9497e6224`
- round：1
- reviewed_at：2026-08-09 18:07 UTC+8

## Findings

### t273_test_f001 - session_typography.test.ts 断言载体为源文件文本正则，存在假阳/假阴边界

- 严重度：minor
- 锚点：行为缺陷——无（不违反具体 AC；t265 字号层级视觉断言的迁移实现）
- 位置：`tests/unit/renderer/styles/session_typography.test.ts:15-16`、`:26-27`
- 问题：三个用例全部改为对源文件做文本正则匹配：
    1. `/conversation-title[^\"]*text-\[11px\]/` 等正则依赖「两个类名位于同一字符串字面量、中间无引号」。当前实现匹配（已验证 `SessionPane.tsx` 中 `"conversation-title truncate text-[11px] ..."`、`SessionRail.tsx` 中 `"history-slot-title truncate text-body-sm ..."`），但 className 一旦重构为模板字符串插值或经 `cn()` 拆分（如 `cn("conversation-title", size_class)`），正则即断——假阳性红灯，样式本身可能正常。
    2. 断言对象是「类名字符串存在」而非「样式生效」：`text-[11px]`/`text-body-sm` 由 Tailwind v4 生成，若对应 token 移出 `@theme`（`text-body-sm` 类不再生成）或规则被其它层覆盖，用例 1/2 仍绿而视觉已错（假阴性）；用例 3（`:32-33`）只锚 token 值存在，未锚 token→utility 映射，无法捕获该情况。
    3. 值锚定本身有效：11px/13px、12.5px/11.5px 均硬编码于正则，改值即红，t257「标题小/元信息大」层级关系与旧 `title_size < meta_size` 断言语义等价，不构成弱化。
- 建议：不强求改（样式文本断言属本 task 固有模式，像素级视觉已由上下文区「有意不测」归人工）。若改，可解析 className 中实际字号值并显式断言大小关系（pane：title < meta；rail：body-sm > label-md），减少对类名顺序与引号边界的耦合；或将用例 3 补充 `text-body-sm`/`text-label-md` utility 规则存在的断言。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：不适用（Round 1）
- 改测方向复核：无。全部既有测试改动均为类名选择器改写（`.session-shell`→`.history-shell`、`.pane-msg-row`→`.conversation-message-row`、`.lib-card`→`.library-card`、`.slot-pane`→`.history-cell`、`.workspace-toast`→`.history-toast` 等 11 个测试文件），断言语义（文本、数量、行为、布尔、角色/aria）未变；`build_code_split.test.ts` 的 mark 随新类名同步（`session-shell`→`history-shell`，该字符串在 `SessionShell.tsx` 根 className 存在，chunk 分割断言仍有效）；`session_typography.test.ts` 因被测 CSS 文件（`pane.css`/`workspace-rail.css`）已按 spec 删除而重写，新断言保持原字号值锚定。未发现「让断言迁就当前实现」的改动。
- 本轮新发现：1 条（t273_test_f001，minor）
- 未进表的提示：
    - AC2（明暗跟随 config 主题、强调色五档即时生效）与 AC3（四家 agent 识别色 + 未知源 fallback）无自动测试；AC4（三重 grep 删除验证）无自动测试。spec 可测试性声明将 AC1-AC4 归「现有会话窗口测试与黑盒验证」，属已批准策略，不出 blocking。黑盒验证须覆盖：AC2 主题/强调色切换、AC3 明暗下 agent 色、AC4 文件/import/变量与类引用三重 grep。实现侧我已人工复核：`src/renderer` 无 `session-*`/`pane-*`/`ws-*`/`sl-*` 旧类名残留（仅 `TrayMenu.tsx` 托盘窗口范围外）、无 `--accent-lime`/`--bg-canvas`/`--agent-*` 变量残留、9 个独立样式文件已删且 import 清零（残留 import 会致构建失败，门禁兜底）。
    - 测试选择器与组件类名逐一核对通过（含 `.selection-tray.expanded`、`.conversation-action[title='大纲']`、`data-loc-key`、`.history-grid` `--cols` 等保留/改写断言）；`ui/Checkbox` 为原生 `<input type="checkbox">`（`getAllByRole("checkbox")` 单测可用）、`ui/Select` 为原生 `<select>`（`selectOption`/`fireEvent.change` 可用）、`ui/Dialog` 支持 `role`（`getByRole("dialog")` 可用）。
    - e2e 中 `.conversation-message-check`（`opacity-0`）直接 click 在 Playwright 下合法（可见性判定不依赖 opacity，点击可触发原生 checkbox 事件），不构成「程序赋值替代真实交互」。
- 总体判断：测试改动与 spec「样式断言按新语义类名改写，逻辑断言不动」策略一致，AC1 覆盖完整，无未解决 critical / important，仅 1 条 minor。
- 系统性 follow-up：无

verdict: PASS

## Round 2 (2026-08-09 18:19 UTC+8)

### 前轮 finding 复核

- **f001（minor，session_typography.test.ts 文本正则断言脆弱）**：仍存在。以 diff 为准，`tests/unit/renderer/styles/session_typography.test.ts` 与 Round 1 完全一致（无任何改动），f001 未处置。minor 不阻断，交由 implementer 处置表决定（改或遗留）。

### Findings

### t273_test_f002 - compact 回归测试仅断言 compact 分支，非 compact 分支迁移未锚定

- 严重度：minor
- 锚点：行为缺陷——无（不违反具体 AC；覆盖扩展建议）
- 位置：`tests/unit/renderer/components/workspace/PaneMessageRow.test.tsx:134-139`（新用例「紧凑模式保留消息元信息的内联布局」）
- 问题：本轮新增的 compact 回归测试只渲染 `compact` 分支并断言 `conversation-message-meta` 含 `inline-flex`、不含 `mb-0.5`；**非 compact（默认）分支未断言**。被迁移的原 CSS 规则两分支均有语义：`pane.css:199-202`（`38343593` 版本）`.pane-msg-row.compact .pane-msg-meta { display: inline-flex; margin-bottom: 0; }`，默认分支为普通 flex + 底距。若实现误把默认分支同化为 `inline-flex`（compact 条件失效的另一种形式，即 `compact ? "inline-flex" : "mb-0.5 flex"` 被误改为无条件 `inline-flex`），现有测试全部仍绿：本用例只覆盖 compact 分支，`WorkspaceView.test.tsx`「视图开关：显示时间戳/紧凑模式即时生效」只断言行级 `compact` 类（`.conversation-message-row`），均不触达 meta 布局。迁移断言只锚定了原规则的一半。
- 建议：补一个非 compact 渲染断言（`meta` 含 `flex` 且含 `mb-0.5`），成本低，即可完整锚定该规则的迁移。
- 附注（行为确认）：该测试对应组件变化为 `PaneMessageRow.tsx:82-83`（`compact ? "inline-flex" : "mb-0.5 flex"`），是 Round 1 之后对「原 compact meta 规则迁移丢失」的修复。测试断言的是原 CSS 已存在行为而非迁就新实现，方向正确，符合「实现变更后新增覆盖新语义测试」；唯一遗漏即上述非 compact 分支。

### 结论

- 前轮 finding 复核：f001 仍存在（未处置，minor）；无其它 Round 1 blocker
- 改测方向复核：无「迁就实现」的改测——本轮唯一测试改动是新增 compact 用例（`PaneMessageRow.test.tsx:134-139`），断言对象为原 CSS 规则（`pane.css:199-202`）的既有行为；无既有测试被修改
- 本轮新发现：1 条（t273_test_f002，minor）
- 未进表的提示：Round 1 结论段的 AC2/AC3/AC4 黑盒验证提示继续有效，无新增遗漏；除 PaneMessageRow 组件与测试外，Round 1→2 无其它文件变化（总 insertions 1108→1120，与 compact 修复/测试吻合）
- 总体判断：无未解决 critical / important；f001、f002 均为 minor，不阻断
- 系统性 follow-up：无

verdict: PASS
