# Task review t257（reviewer_focus: 通用）

- task：`t257_session_pane_meta_display`
- spec：`docs/tasks/t257_session_pane_meta_display/spec.md`
- diff_anchor：`6801d1d69cd0ea87b6e672c310808c49841e8fec`
- target：`git diff 6801d1d69cd0ea87b6e672c310808c49841e8fec`
- round：1
- reviewed_at：2026-08-08 02:44 UTC+8

## Findings

### t257_gen_f001 - `message_may_exceed_one_line` 粗判漏掉「无换行且 ≤140 字但实际折行」的消息，内容不可达（AC9 违背）

- 严重度：important
- 锚点：AC9「内容超出一行的消息显示展开按钮，点击展开显示完整内容」
- 位置：`src/renderer/components/workspace/PaneMessageRow.tsx:18-22`
- 问题：判定仅看 `text.includes("\n")` 与 `text.length > 140`，用**原始文本长度**而非渲染宽度。无换行且 ≤140 字的文本在窄容器中折行为多行时（多面板布局下 pane 宽约 400-600px，80 字英文或 30 字中文即折行），`single-line` clamp 隐藏第一行以外内容，且不渲染展开按钮 → 消息部分内容对用户完全不可见、无任何途径展开。测试 `PaneMessageRow.test.tsx:103` 仅断言 200 字显示按钮 / "short" 不显示，固化的是启发式行为而非 AC 可观察行为，未覆盖「短文本折行」失败场景。
- 建议：改为测量实际渲染溢出（如 ResizeObserver 比较 `scrollHeight > clientHeight`，项目已有该模式），或对无法确定的行保守显示展开按钮；补「短文本在窄容器折行仍可展开」用例。

### t257_gen_f002 - 单行 clamp 的 `max-height: 1.6em` 与 markdown 行高/块级 margin 不匹配，标题开头消息折叠态首行被裁

- 严重度：minor
- 锚点：AC9 视觉呈现（折叠态首行应完整可见）
- 位置：`src/renderer/styles/pane.css:157-163`
- 问题：`.pane-msg-content` 继承基字 16px，`1.6em = 25.6px`；markdown 正文 line-height 1.65（13px → 21.45px）且 `<p>` 有 `margin: 4px 0`、`h1-h4` 有 `margin: 10px 0 6px`。普通段落文本尚可容纳，但 `# 标题` 开头消息首行为 h1（16px、行高 26.4px + 上 margin 10px = 36.4px > 25.6px），折叠态首行被 `overflow: hidden` 裁去约 40% 字身。
- 建议：`max-height` 改用与正文 line-height 一致的 `1.65em` 或放宽，或对首块为标题/代码块的折叠预览单独处理。

### t257_gen_f003 - `message_may_exceed_one_line` 边界（140/141、仅含换行的短文本）无直接单测

- 严重度：minor
- 锚点：测试策略「构造单行/多行消息，断言折叠按钮有无」
- 位置：`tests/unit/renderer/components/workspace/PaneMessageRow.test.tsx:103`；`tests/unit/renderer/lib/workspace/pane.test.ts`
- 问题：`message_may_exceed_one_line` 已 export 为纯函数，但 pane 纯函数单测未覆盖；组件测试只覆盖 200 字（显示）与 "short"（不显示），未覆盖 140/141 阈值边界与「含换行的短文本」分支。
- 建议：补纯函数边界用例。

### t257_gen_f004 - AC11 滚动稳定/列表重渲染未直接断言，仅覆盖选中态保持

- 严重度：minor
- 锚点：AC11「列表滚动位置不发生跳动错乱（虚拟列表在行高变化后仍正确渲染）」；测试策略「断言选择状态保持与列表重渲染」
- 位置：`tests/unit/renderer/components/workspace/PaneMessageRow.test.tsx:123`
- 问题：AC11 测试仅断言展开后 checkbox 仍勾选（选中态保持），未断言虚拟列表在行高变化后重渲染正确；滚动位置依赖 spike s022 所述 ResizeObserver 机制，无直接测试。
- 建议：在 VirtualMessageList 层补行高变化后 offsets/重渲染断言（可行时）。

### t257_gen_f005 - AC3/AC6(占位槽 icon 居中)/AC8 视觉断言缺失（纯 CSS）

- 严重度：minor
- 锚点：AC3（标题字号 < 元信息字号）、AC6（折叠槽位正方形且 icon 居中）、AC8（元信息字号 > 标题字号）
- 位置：`tests/unit/renderer/components/workspace/SessionPane.test.tsx`、`SessionRail.test.tsx`、`src/renderer/styles/pane.css` / `session-library-results.css`
- 问题：三个字号互换与 icon 居中都只以 CSS 实现，组件测试未断言 `pane-title`/`pane-meta`、`lib-card-title`/`lib-card-summary` 的字号 class 或计算样式，折叠态占位槽「正方形+icon 居中」也未断言（仅断言空槽文案为「+」）。
- 建议：jsdom 可读 computed style，补字号断言；rail 折叠态补槽位尺寸/徽标存在断言。

### t257_gen_f006 - `last_message_time` 空消息回退 openedAt 未测

- 严重度：minor
- 锚点：AC4 日期回退语义
- 位置：`src/renderer/components/workspace/SessionPane.tsx:285-288`
- 问题：`messages` 为空时回退 `openedAt` 的分支无测试；SessionPane AC1/AC4 用例均提供两条消息。
- 建议：补空消息（回退 openedAt）用例。

### t257_gen_f007 - SessionRail.test.tsx 两个 import 同行无换行

- 严重度：minor
- 锚点：无（风格）
- 位置：`tests/unit/renderer/components/workspace/SessionRail.test.tsx:2`
- 问题：`import { describe, expect, it } from "vitest";import { SessionRail } ...` 同行合并，破坏多行 import 排版。
- 建议：拆分换行。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：7 条（important 1 / minor 6）
- 未进表的提示：
    - t257 将消息行默认折叠为单行，使每行高度显著变小；t237 web e2e「加载多页后消息区 DOM 行数有固定上界（≤40）」断言依赖行高，若 p075 fixture 缺口修复后该用例可能因行数超界转红——属既有测试边界隐患，非本次引入，建议在 p075 修复时同步复核。
    - 元信息在 `slot_meta.model` 缺失时渲染以「· 」开头的悬空前缀，极轻微。
    - e2e session_panel 4 失败为 p075 既有（synthetic fixture 缺口，主仓基线同失败），非 t257 回归，AC12 不新增违反。
- 总体判断：实现整体符合 AC1-AC12 主体，但 `message_may_exceed_one_line` 启发式对「无换行短文本折行」一类消息隐藏内容且无展开入口，违反 AC9 可观察行为，属未解决 important → FAIL。
- 系统性 follow-up：无（f001 可并入 t257 自身修复，不必单列）

## Round 2 (2026-08-08 02:58 UTC+8)

### 前轮 finding 复核（以 `git diff 6801d1d6` 与当前代码为准）

- **f001（important）修不彻底**：真实测量方向正确——`content_overflows` 在折叠态读 `scrollHeight > clientHeight`，解决了「无换行短文本折行」漏判；jsdom 无布局（尺寸 0）退化回文本含换行启发式，语义合理。但 `useLayoutEffect` 依赖含 `expanded`，展开态重测会把 `overflows` 翻转为 `false`，展开按钮随之消失，用户无入口恢复折叠（详见 f008）。核心问题（内容可达性）在 AC10 路径上仍失败。
- **f002（minor）已修**：`.pane-msg-content.single-line` 仅保留 `line-clamp` + `overflow:hidden`，无 `max-height`，标题首行不再被裁。消除。
- **f003（minor）已修**：`message_may_exceed_one_line` 启发式函数已删除，替换为 `content_overflows`。消除。
- **f004（minor）遗留接受**：字号互换/icon 居中等 CSS 视觉断言仍缺失，jsdom 断言字号值不可靠，非 blocking，同意遗留。
- **f005（minor）遗留接受**：AC11 滚动/重渲染断言仍缺失，依赖 spike s022 确认的 ResizeObserver 行高重测机制，非 blocking，同意遗留。
- **f006（minor）已修**：SessionPane.test.tsx 新增「AC4：无消息时日期回退到打开时间」用例，断言 `2026-01-02 03:04:05`，覆盖 `last_message_time` 空消息回退分支。消除。
- **f007（minor）已修**：SessionRail.test.tsx 两个 import 已分行。消除。

### 本轮新发现

#### t257_gen_f008 - 展开后真实测量翻转 overflows=false，展开按钮消失，无法恢复折叠（AC10 违背）

- 严重度：important
- 锚点：AC10「再次点击恢复单行折叠。各消息的折叠/展开状态互不影响。」
- 位置：`src/renderer/components/workspace/PaneMessageRow.tsx:47-52`（useLayoutEffect）+ `97-108`（按钮渲染条件）
- 问题：`useLayoutEffect` 依赖数组含 `expanded`，点击展开后重测。展开态 `.pane-msg-content` 移除 `single-line` clamp、无裁剪，`scrollHeight === clientHeight`，`content_overflows` 返回 `false` → `set_overflows(false)` → `overflows && (按钮)` 不再渲染。用户点击「展开」后按钮消失，无任何入口恢复折叠，AC10「再次点击恢复单行折叠」不可达。测试 `PaneMessageRow.test.tsx:94-103` 用 `mock_content_size(80, 20)` 恒定 mock 尺寸，展开后 effect 重测仍得 `true`、按钮保留——固化的是 mock 行为而非真实布局（真实浏览器展开态尺寸必然变化）。现有单测 3 条、e2e 均未覆盖展开后按钮留存这一路径。
- 建议：仅在折叠态测量溢出（如 effect 内 `if (expanded) return`，展开态沿用折叠态测量结果），或展开态改为按 `expanded` 显式渲染「收起」按钮；补「真实布局下展开后按钮仍保留、可再点击收起」用例（mock 需区分折叠/展开两态尺寸）。

### 结论

- 前轮 finding 复核：7 条——f002/f003/f006/f007 已修消除；f004/f005 遗留（minor 接受）；f001 修不彻底（方向正确但引入 f008）。
- 本轮新发现：1 条（important 1）
- 未进表的提示：`PaneMessageRow.test.tsx:94-103` 用 `Object.defineProperty` 污染 `HTMLElement.prototype.scrollHeight/clientHeight` 且未 `afterEach` restore（vitest 文件隔离内可控，属测试卫生）；`content_overflows` 的 jsdom 退化分支（含换行启发式）无直接单测。
- 总体判断：f001 修复方向正确但引入 f008——展开后按钮消失致无法恢复折叠，AC10 未解决 → FAIL。
- 系统性 follow-up：无

verdict: FAIL

## Round 3 (2026-08-08 03:03 UTC+8)

### 前轮 finding 复核（以当前工作区源码为准）

- **f008（important）已消除**：`PaneMessageRow.tsx:49-53` `useLayoutEffect` 依赖已去掉 `expanded`，改为 `[message.id, message.text]`，注释明确说明「展开后 scrollHeight===clientHeight 会误判不超行，导致展开按钮消失」。实机语义：挂载（折叠态）测一次定 `overflows`；点击展开仅改 `expanded` 状态、不触发 effect 重测，`overflows` 保持折叠态测量结果，按钮持续渲染（`aria-label` 在 `展开`/`折叠` 间切换），AC10「再次点击恢复单行折叠」可达，展开/折叠循环完整。实现方向与 f008 建议的「只在折叠语义下测一次」一致。消除。

### 本轮新发现

无。

### 结论

- 前轮 finding 复核：f008（important）已消除；f002/f003/f006/f007 此前已修，f004/f005 遗留（minor 接受），本轮无新增 blocker。
- 本轮新发现：0 条。
- 未进表的提示：
    - `PaneMessageRow.test.tsx:117-136` AC9/AC10 用例断言展开后按钮仍在（`getByLabelText("折叠消息")` 若按钮消失即抛错）并可再点收起，覆盖了 AC10 可观察行为；但 jsdom 用 `mock_content_size(80,20)` 恒定 mock，折叠/展开两态尺寸不区分，无法在 jsdom 复现 f008 原缺陷——属测试深度提示，非本轮引入，来源已修，不阻断。
    - `content_overflows` 的 jsdom 退化分支（含换行启发式）仍无直接单测，沿用 Round 2 提示。
- 总体判断：f008 唯一 blocker 已在源码层真修，展开后按钮保留、折叠可达，AC10 满足；无未解决 critical / important → PASS。
- 系统性 follow-up：无

verdict: PASS
