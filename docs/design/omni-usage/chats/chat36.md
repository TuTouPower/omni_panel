# 标签设计

_Started 2026-06-06 12:34 UTC_

---

## User

<system-info comment="Only acknowledge these if relevant">
Project title is now "omni_usage"
Project currently has 15 file(s)
User is viewing file: OmniUsage UI.html
Current date is now June 6, 2026
</system-info>

<default aesthetic_system_instructions>
The user has not attached a design system. If they have ALSO not attached references or art direction, and the project is empty, you must ASK the user what visual aesthetic they want. Use the questions_v2 tool to ask about preferred vibe, audience, colors, type, mood, etc. Do NOT just pick your own visual aesthetic without getting the user's aesthetic input -- this is how you get slop!

Once answered, use this guidance when creating designs:
- Choose a type pairing from web-safe set or Google Fonts. Helvetica is a good choice. Avoid hard-to-read or overly stylized fonts. Use 1-3 fonts only.
- Foreground and background: choose a color tone (warm, cool, neutral, something in-between). Use subtly-toned whites and blacks; avoid saturations above 0.02 for whites.
- Accents: choose 0-2 additional accent colors using oklch. All accents should share same chroma and lightness; vary hue.
- NEVER write out an SVG yourself that's more complicated than a square, circle, diamond, etc.
- For imagery, never hand-draw SVGs; use subtly-striped SVG placeholders instead with monospace explainers for what should be dropped there (e.g. “product shot”)

CRITICAL: ignore default aesthetic entirely if given other aesthetic instructions like reference images, design systems or guidance, or if there are files in the project already.
</default aesthetic_system_instructions>

<pasted_text name="Pasted text (245 lines)">
请继续修改 OmniUsage 主面板的用量行布局。你已经了解项目背景和现有 UI，只需要按下面方案调整，不要重新设计整体界面。

## 目标

用量行需要做到：

* 所有厂商、所有账号、所有用量条全局列对齐
* label 列固定宽度
* 用量条起点、终点全局对齐
* 数值列全局对齐
* 日期和具体时间分开对齐
* 不做长 label 特殊布局
* 不做紧凑模式
* 不做两行用量条
* 不根据厂商或内容动态改变列宽

## 最终一行结构

每一行用量统一使用 5 列：

```text
[label] [progress] [value] [date] [clock]
```

推荐 grid：

```css
.bar-row {
  display: grid;
  grid-template-columns: 6ic minmax(0, 1fr) 9ch 9ch 5ch;
  align-items: center;
  column-gap: 8px;
}
```

对应含义：

```text
[label 6ic] [progress 1fr] [value 9ch] [date 9ch] [clock 5ch]
```

视觉示例：

```text
5小时        progress        15%        今天        01:10
一周         progress        44%        明天        12:38
余额         progress        52/100     6.22        20:31
Embedding    progress        31%        tomorrow    01:02
```

## 各列规则

### 1. label 列

```text
宽度：6ic
对齐：左对齐
```

规则：

* 所有厂商、所有账号、所有用量行共用同一个 label 宽度
* 不按内容变化
* 不按厂商变化
* 不按最长 label 变化
* 使用 displayLabel，不直接展示超长 rawLabel
* 超出宽度时 CSS ellipsis
* hover 显示完整名称 tooltip
* 常见长名称，例如 Gemini、MiniMax 的模型名，用内置映射提前缩短
* 用户可以在设置里自定义映射

不要再用 JS 按字符数量截断 label。

### 2. progress 列

```text
宽度：minmax(0, 1fr)
```

规则：

* 占据剩余空间
* 窗口变宽时，只拉伸 progress
* 窗口变窄时，只压缩 progress
* 不允许挤压 label、value、date、clock
* 所有进度条的起点和终点全局对齐

### 3. value 列

```text
宽度：9ch
对齐：右对齐
```

用于：

```text
15%
52/100
95/1000
742/10000
--
```

规则：

* 不居中
* 不左对齐
* 数字尽量紧凑，例如 `95/1000`，不要写成 `95 / 1000`
* 建议启用 tabular numbers

### 4. date 列

```text
宽度：9ch
对齐：右对齐
```

用于：

```text
今天
明天
6.22
today
tomorrow
--
```

规则：

* 日期和具体时间必须拆开
* date 列只放日期部分
* 右对齐
* 超出时 ellipsis
* 如果没有日期，显示 `--` 或留空，但不能破坏列结构

### 5. clock 列

```text
宽度：5ch
对齐：右对齐
```

用于：

```text
01:10
12:38
20:31
--
```

规则：

* clock 列只放 `HH:mm`
* 右对齐
* 建议启用 tabular numbers
* 这样 `今天 01:10`、`明天 12:38`、`6.22 20:31` 后面的时间可以严格对齐

## 文本 CSS

建议：

```css
.bar-label,
.bar-value,
.bar-date,
.bar-clock {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.bar-value,
.bar-date,
.bar-clock {
  text-align: right;
}

.bar-value,
.bar-clock {
  font-variant-numeric: tabular-nums;
}
```

## 时间格式处理

原来的一整个 time 文案不要直接放到同一列。需要拆成：

```text
date + clock
```

示例：

```text
今天 01:10      → date: 今天      clock: 01:10
明天 12:38      → date: 明天      clock: 12:38
6.22 20:31      → date: 6.22      clock: 20:31
today 01:10     → date: today     clock: 01:10
tomorrow 01:02  → date: tomorrow  clock: 01:02
```

如果没有时间：

```text
date: --
clock: --
```

或按现有空态样式留空，但列必须保留。

## 不要做的事情

不要做长 label 特殊布局。
不要做紧凑模式。
不要把 label 放到进度条上方。
不要把时间合成一个整体 time 列。
不要根据不同厂商动态改变 label 宽度。
不要用 px 写死 label、value、date、clock 的列宽。
不要让 value 或 time 居中。
不要让 progress 挤压其它列。
不要让 label 和 progress 重叠。
不要破坏现有卡片视觉风格。

## 最终结果

所有用量行都应该使用统一结构：

```text
6ic | 1fr | 9ch | 9ch | 5ch
```

最终效果：

* label 全局对齐
* progress 全局对齐
* value 全局右对齐
* date 全局右对齐
* clock 全局右对齐
* `今天 01:10`、`明天 12:38`、`6.22 20:31` 的具体时间部分严格对齐
* 窗口变宽时只拉伸 progress
* 整体保持 OmniUsage 当前清爽、紧凑、现代的小面板风格

</pasted_text>


<system-reminder>Auto-injected reminder (ignore if not relevant): do not recreate copyrighted or branded UI unless the user's email domain matches that company. Create original designs instead.</system-reminder>

## Assistant

_[tool: list_files]_

I'll start by examining the current OmniUsage UI to understand the existing structure before making changes.I'll explore the key files to understand the current bar-row structure.

_[tool: read_file]_

I'll read the components, data, and CSS files to understand the bar-row structure.

_[tool: read_file]_

_[tool: grep]_

Now let me look at the CSS for the bar-row and the data format for reset times.

_[tool: read_file]_

_[tool: read_file]_

Now let me look at the data to understand reset time formats and labels.

_[tool: grep]_

The reset times are space-separated `date clock` strings (e.g. `今天 13:10`, `5/18 21:00`, `--`). Now let me check for other usages of the functions/classes I'll change.

_[tool: str_replace_edit]_

All usages are contained in `components.jsx` and `omniusage.css`. Let me make the changes. First, replace the label-measurement/truncation block in components.jsx with a display-label mapping and a time-splitter.Now update the BarRow render to 5 columns:

_[tool: str_replace_edit]_

_[tool: read_file]_

Now remove the per-card label-width logic and the `--lbl-w` style props. Let me view the current state:

_[tool: read_file]_

_[tool: str_replace_edit]_

Now remove the four `--lbl-w` style props on the `.bars`/`.acct-detail` containers:

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now update the CSS for the 5-column grid:

_[tool: grep]_

Let me check the account-detail bar styles don't override the grid, and bump cache versions:

_[tool: str_replace_edit]_

`.ai-bars` reuses `.bar-row` verbatim — global alignment holds. Now bump cache versions in the HTML:Now let me render and screenshot to verify the alignment:

_[tool: show_html]_

_[tool: show_html]_

_[tool: eval_js]_

The 5-column split layout works — date (今天) and clock (13:10/21:00) are now separately aligned, value right-aligned, progress bars aligned. Let me verify the Gemini card (long model labels → display mapping + ellipsis):

_[tool: save_screenshot]_

_[tool: save_screenshot]_

_[tool: done]_

The Gemini card now shows clean mapped display labels (2.5 Pro, 3.1 Flash-Lite·Pv, etc.) all fitting the fixed 6ic label column, with value / date / clock columns globally right-aligned. The raw model name remains in the hover tooltip. Let me finish and verify it loads cleanly.

_[tool: fork_verifier_agent]_

Done. The usage rows now use one global 5-column structure across every vendor, account, and bar:

**`6ic | 1fr | 9ch | 9ch | 5ch`** → `[label] [progress] [value] [date] [clock]`

Key changes:
- **Label** — fixed 6ic width, never per-card/per-vendor/per-content. Overflow handled by CSS ellipsis + hover tooltip (full raw name). Removed all JS character-count truncation.
- **Display mapping** — long machine names (e.g. `gemini-3.1-flash-lite-preview` → `3.1 Flash-Lite·Pv`) shortened via a built-in `LABEL_MAP`, overridable from settings via `window.__labelMap`.
- **Progress** — `minmax(0,1fr)`, the only elastic column; widening the window stretches only the bar.
- **Value** — 9ch, right-aligned, tabular nums; compact `95/1000`.
- **Date / Clock split** — every reset string (`今天 13:10`) is split into a 9ch date column and a 5ch clock column, so the `HH:mm` parts align strictly across all rows. Empty/`--` states preserve the columns.

Account-detail rows reuse `.bar-row` verbatim, so the multi-account view stays globally aligned too. Card visuals are untouched.

## User

标签改成 4ic

## Assistant

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Label column narrowed to 4ic. Let me verify it renders cleanly:

_[tool: show_html]_

标签列已改为 4ic，进度条整体左移、更宽，全局列对齐保持不变（数值、日期、时钟列严格右对齐，`今天 13:10`、`5/18 21:00`、`6/8 19:00` 的时间部分依然对齐）。`95/1000`、`52/100` 等数值列也正常容纳。

## User

所有的日期列都改成 今天 明天 05.27 06.08 类似的格式，

## Assistant

_[tool: grep]_

I need to look at the current date formats in the data and normalize them to 今天/明天/MM.DD format.

_[tool: str_replace_edit]_

Dates are stored as `M/D` (e.g. `5/18`, `6/8`). I'll normalize the date part to zero-padded `MM.DD` in the time-splitter, keeping 今天/明天 as-is.Also update the comment in CSS to reflect the new format, and bump the components cache version:

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: show_html]_

_[tool: show_html]_

所有数字日期已统一为零填充的 `MM.DD` 格式：`5/18 → 05.18`、`5/17 → 05.17`、`6/8 → 06.08`、`6/1 → 06.01`。`今天`/`明天` 等文字日期保持不变，时钟列继续严格右对齐。

## User

日期列和数值列为什么中间空那么多？你先不要改代码，你告诉我原因。

## Assistant

空格来自**两个右对齐的定宽列叠加**，而不是真有那么多间距。

具体看这两列的设置：

- value 列 = `9ch`，右对齐
- date 列 = `9ch`，右对齐
- 中间 `column-gap: 8px`

问题出在 **date 列**。它固定 `9ch` 宽，但里面的内容（`今天`、`05.18`）其实只占 4~5ch。因为是右对齐，文字被推到这一格的**最右边**，于是这一格**左侧那 4~5ch 就空着**——而这块空白正好夹在 value 和 date 之间，看起来就成了「数值和日期中间空很多」。

同理 value 列 `9ch` 也偏宽：`15%` 只有 3ch，右对齐后它的左侧也空出来，但那块空白被前面的进度条（`1fr`）顶住了，所以不明显；夹在 value↔date 之间的 date 列空白就特别显眼。

一句话：**date 列按最长内容（如 `tomorrow`）预留了 9ch，但常见内容只有 2~5ch，右对齐又把空白全挤到了左侧**，于是 value 和 date 之间出现一道固定空隙。

如果想收窄，方向是：把 date 列改窄（比如 `6ch`，刚好放下 `05.18`/`今天`，长词 `tomorrow` 走 ellipsis），或者把 value/date/clock 用一个右对齐的子网格打包、整体靠右，去掉中间的固定空格。要我改的话告诉我你倾向哪种。

## User

value 改成 5ch date 改成 5ch

## Assistant

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: grep]_

_[tool: grep]_

_[tool: str_replace_edit]_

_[tool: show_html]_

Interesting — the grid is already `5ch 5ch 5ch` and the CSS is at `v=9`. The changes are in place. Let me just fix the comment and verify render:

_[tool: show_html]_

已改为 value `5ch` / date `5ch`，数值和日期之间的空隙明显收紧了。

一个需要提醒你的副作用:GLM 那行的 `95/1000` 现在放不下、被截成了 `95/10...`(5ch 容不下 6 个字符的分数)。百分比类(`15%`、`44%`)和 `52/100` 都没问题。如果你希望 `95/1000` 这类完整显示,value 列需要 7ch 左右;date 保持 5ch 即可。要我把 value 单独放宽一点吗?

## User

glm mcp 这种被遮挡的情况继续遮挡 不用改，加一个就用户鼠标放上去的话能看到完成数字。gap 改成 6

## Assistant

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Done. 数值列保持原样截断(`95/10...`),但鼠标悬停在数值上即可看到完整数字(如 `95/1000`);列间距 `column-gap` 已从 8px 改为 6px。

