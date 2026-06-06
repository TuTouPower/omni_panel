# 标签列宽度设置

_Started 2026-06-06 12:14 UTC_

---

## User

用量条前面的文字描述是 标签列，后面的用量数字，是数值列，再之后是时间列。现在标签列的宽度是多少？具体用什么代码定义的？具体的多宽

## Assistant

_[tool: grep]_

_[tool: grep]_

_[tool: grep]_

_[tool: grep]_

_[tool: grep]_

_[tool: read_file]_

_[tool: eval_js_user_view]_

标签列的宽度不是写死的固定值，而是 **JS 运行时测量出来的**。链路如下：

**1. CSS 里定义列结构**(omniusage.css:309-312)
```css
.bar-row {
  display: grid;
  grid-template-columns: var(--lbl-w, 62px) minmax(0, 1fr) var(--val-w) var(--time-w);
  align-items: center; gap: 10px;
}
```
四列依次是：**标签列 `var(--lbl-w)`** → 用量条 `1fr` → 数值列 `--val-w` → 时间列 `--time-w`。`62px` 只是 `--lbl-w` 没被设置时的兜底值。

**2. `--lbl-w` 的真实值由 JS 注入**(components.jsx:285 等)
```jsx
<div className="bars" style={{ '--lbl-w': mainLblW + 'px' }}>
```
而 `mainLblW = labelColWidth()`,该函数固定返回 `LBL_MIN_W`(components.jsx:84-86)。

**3. `LBL_MIN_W` 是"5 个汉字"的渲染宽度**(components.jsx:80-82)
```js
const _LBL_FONT = '12.5px -apple-system, ... "PingFang SC", "Microsoft YaHei", ...';
const LBL_MIN_W = Math.round(_measureLabel('汉'.repeat(5)));   // 5 汉字
```
也就是用 canvas 按 **12.5px** 字号实际测量字符串 `"汉汉汉汉汉"` 的像素宽度,再四舍五入。

**具体多宽**

因为是按实际字体测量的,所以严格说取决于运行设备上命中的字体。在 PingFang SC / 微软雅黑 这类全角字形下,12.5px 的一个汉字约 12.5px 宽,5 个 ≈ **62–63px**(这也正是 CSS 兜底写 `62px` 的原因)。

我在你当前页面里实测一下确切数值:实测确认:

**当前标签列宽度 = `63px`**

- 计算公式:`Math.round(measureText("汉汉汉汉汉"))`,即 12.5px 字号下 5 个汉字的渲染宽度 → **63px**
- 页面里 `.bars` 元素上实际的 `--lbl-w` 也正是 `63px`,两者一致。

所以标签列是**恒定 5 个汉字宽(63px)**,与标签文字实际长短无关:短的左对齐不撑开,超过 5 字的会被截断加 `...`(由 `truncateLabel` 处理)。这样保证了所有卡片的标签列、数值列、时间列都能纵向对齐。

如果你想改这个宽度,改 components.jsx:82 的 `'汉'.repeat(5)` 里的数字(比如改成 6 就是 6 个汉字宽),或直接改测量字号 `12.5px`。

