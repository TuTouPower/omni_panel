# Task review t052（reviewer_focus: 代码）

- task：`t052_usage_card_row_height_align`
- spec：`docs\tasks\t052_usage_card_row_height_align/spec.md`
- diff_anchor：`0e56ace91f84afdee75c8962d41c60e6ef41f105`
- target：`git diff 0e56ace91f84afdee75c8962d41c60e6ef41f105`
- round：1
- reviewed_at：2026-07-23 14:05 UTC+8

## 改动核对

- `src/renderer/styles/globals.css:355`：`.overview-grid { align-items: start }` → `align-items: stretch`。
- DOM 路径（核对自 `PopupView.tsx:599` / `ProviderOverview.tsx:78` / `ProviderCard.tsx:420` / `CollapsibleCard.tsx:32-34`）：
    - `.overview-row` > `.overview-grid` > `ProviderCard` → `CollapsibleCard` 渲染根 `<div class="card">`。
    - `.upcoming-rail` / `.upcoming-banner` 是 `.overview-row` 的子元素（`PopupView.tsx:600-610`），**不**在 `.overview-grid` 内，故 `.overview-grid` 的 `align-items` 对它们无作用。
- `.card`（`globals.css:533-539`）：仅 `background / border / border-radius / box-shadow / padding`，无 `height`、无 `display:flex`，stretch 可生效；`var(--card-bg)` 随主题切换，AC3（暗/亮一致）成立。

## 评估

| AC                                | 是否达成   | 依据                                                                                                                          |
| --------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 同行卡片底部对齐，高度 = 同行最高 | 是         | grid 默认 `grid-auto-rows: auto`，行轨道取最高 item；`align-items: stretch` 使该行所有 item 填满轨道。`globals.css:351-356`。 |
| 多余空白填充卡片背景              | 是         | `.card` 背景为 `var(--card-bg)`，box 被 stretch 后背景覆盖整块。`globals.css:533-539`。                                       |
| 暗/亮一致                         | 是         | 背景走 `var(--card-bg)`，主题变量。                                                                                           |
| 桌面/web 双路                     | 代码层成立 | 同一 CSS 文件，无平台分支。运行时验证由黑盒覆盖。                                                                             |
| 三断点无回归                      | 是         | `@container` 仅改 `grid-template-columns`（`globals.css:357-366`），`align-items` 在所有断点保持 stretch。                    |

**副作用排查**：

- `.overview-row > .overview-grid` 是 `.overview-row` 的 grid item，`.overview-row` 保留 `align-items: start`（`globals.css:373`），`.overview-grid` 本身不拉伸，rail（`.overview-row > .upcoming-rail`，`globals.css:392-405`）继续 sticky 顶部。
- `align-self: start`（`globals.css:397`）显式钉住 rail，双保险。
- 折叠态 `.card`（`data-collapsed="true"`，`CollapsibleCard.tsx:36`）：内容隐藏只剩 header，stretch 后底部留白由 `var(--card-bg)` 填充，正是 AC2 要求。
- 错误态/空态/loading 态卡片均走同一 `.card` 根，stretch 行为一致。
- `popup-mirror .scroll-inner` 的 `container-type: normal`（`globals.css:348-350`）只影响容器查询上下文，不干扰 grid 的 `align-items`。

**spec 建议项 vs 实现**：

spec 第 10 行写「卡片根元素 `height: 100%`（或 `display:flex; flex-direction:column`），内部内容区 `flex:1` 撑满」。实现未采纳，但 spec 同句括注「默认应已是 stretch，需确认被覆盖点」——实现精准定位到 `.overview-grid { align-items: start }` 这处显式覆盖，将其改回 stretch。对 grid item 而言，`align-items: stretch` + 无显式 height 已等价于「box 填满行轨道」；`height: 100%` 冗余。`display:flex; flex-direction:column` 仅在需要把内部子区域（如 footer）推到底部时才必要，AC 未提此需求，当前内容从顶部堆叠即满足「空白填背景」。实现的简化是正确的，非偏航。

## Findings

无。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：0 条。
- 总体判断：单行改动精准命中根因（显式 `align-items: start` 覆盖了 grid 默认 stretch），AC1-3 在代码层成立，AC4-5 由黑盒验证，对 rail/banner/折叠卡片/三断点无副作用。spec 第 10 行的 `height:100%` / `flex-direction:column` 建议在当前 AC 下非必需，未采纳合理。

verdict: PASS
