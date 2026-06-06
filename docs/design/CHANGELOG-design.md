# Demo 变更日志

记录 `docs/design/omni-usage/` 设计稿每次 handoff 的变更。
以下内容基于代码实际状态验证，不仅仅来自聊天记录。

---

## chat30 ~ chat39（2026-06-06）

### 1. 统一五列行结构（chat30 → chat35 最终定稿）

`components.jsx` BarRow + `omniusage.css` .bar-row：

```
grid-template-columns: 4ic minmax(0, 1fr) 5ch 5ch 5ch;
column-gap: 6px;
```

- **label** `4ic` — 固定，全局不按厂商/内容变化
- **progress** `minmax(0, 1fr)` — 唯一弹性列
- **value** `5ch` — 右对齐，tabular-nums，超长走 ellipsis + hover tooltip
- **date** `5ch` — 右对齐，数字日期 `MM.DD` 格式（`_fmtDate()`）
- **clock** `5ch` — 右对齐，tabular-nums

时间拆分逻辑 `splitTime()`（components.jsx）：`"今天 13:10" → {date:"今天", clock:"13:10"}`、`"5/18 21:00" → {date:"05.18", clock:"21:00"}`、空值 → `{date:"", clock:""}`

长标签映射 `LABEL_MAP` + `displayLabel()`：`gemini-3.1-flash-lite-preview → 3.1 Flash-Lite·Pv`，超长 CSS ellipsis + title tooltip

chat30 先做了 per-card 动态 label 宽度，chat35 最终改为全局固定 4ic。

### 2. 面板尺寸与交互（chat30）

`app.jsx` + `omniusage.css` .window：

- width `482px`（默认），min `472px`，max `780px`
- 右边缘拖拽手柄 `.win-resize`，仅拉伸 progress 列
- 高度由 ResizeObserver 驱动，clamped `[160px, 75% vh]`

### 3. 细线型高度（chat34）

`.track { height: 4px; }`，骨架屏 `.skel { height: 4px; }`

### 4. 账号 Key 移除（chat33）

主面板 `.acct-item` 和设置页账号行均不显示 Key。设置页 `DiscovedGroup` 也不显示 `.dr-key`（CSS 仍保留但 JSX 不渲染）。

### 5. 粗胶囊型用量条（chat37）

`BarStyleContext` 独立于 `BarSchemeContext`，两个独立设置。

**细线型**（默认）：5 列 `4ic 1fr 5ch 5ch 5ch`
**胶囊型**：4 列 `4ic 1fr 5ch 5ch`

```css
.bar-row.cap {
    grid-template-columns: 4ic minmax(0, 1fr) 5ch 5ch;
    column-gap: 8px;
}
```

胶囊特性（`components.jsx` + `omniusage.css`）：

- `.cap-track` 22px 高，999px 圆角，`isolation: isolate`（防 z-index 泄漏覆盖设置窗口）
- 轨道 = 填充色 16% 透明度：`color-mix(in srgb, ${fillColor} 16%, transparent)`
- 数值居轨道中心（`inset:0; justify-content:center`）
- 文字对比：深色底层 + 白色 `clip-path` 裁剪到填充区域的二层方案
- 行距 `.bars:has(.bar-row.cap)` gap 7px

### 6. 设置界面（chat36）

设置面板已合并到 `OmniUsage UI.html`（不再有独立 `OmniUsage Settings.html`）。

`settings-panel.jsx` 变更：

- 常规页：移除「点击托盘图标」，新增「窗口」分组（打开方式 select、置顶 toggle、浮动高度 select）
- 账号页：`OneRowAccount` 和 `MultiGroup` 不渲染密钥列
- CPA 已发现账号：`DiscovedGroup` 不渲染 `.dr-key`

`settings-panel.css` 变更：`.ao-key`、`.gr-key` CSS 保留但不再有对应 JSX 元素。

### 7. 骨架屏（chat38）

DeepSeek 余额行 `balance.reset = ''`，`splitTime('')` 返回 `{date:'', clock:''}`，显示为空而非 `--`。

### 8. 代码清理（chat39）

- 删除 `screenshots/`、`uploads/` 目录（仅 logo.png 保留）
- 移除 disabled-card 全部死代码：`.card.disabled`、`.off-badge`、"监控已关闭" 状态
- 移除 `status` 对象、`footerUpdated` 状态、`.statusbar` / `.dot` CSS

### 9. Gemini 数据（chat32）

`data.js` gemini 账号含 8 个真实模型名作为 metrics label，值由 `LABEL_MAP` 映射显示。

---

## chat28 ~ chat29（2026-06-05 ~ 06）

### 用量条颜色方案

`BarSchemeContext` + `barFillColor()`，三套方案：

1. **risk-current**（默认）：`riskCurrentLevel(pct)` — ≥95 红、>85 橙、>60 黄、其他绿
2. **risk-projected**：`riskProjectedLevel(pct, elapsed)` — projected = pct/100/elapsed，无 elapsed 回退方案 1
3. **nine-cycle**：`USAGE_COLORS[idx % 9]`，纯视觉区分

CSS 变量：亮暗主题各有 `--risk-green/yellow/orange/red`
轨道底色：`--bar-track`（`#E9EDF5` 亮 / `#2b313c` 暗）
