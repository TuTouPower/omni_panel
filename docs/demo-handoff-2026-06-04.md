# Demo Handoff 分析：chat23-28 (2026-06-04)

基于 `f972d23` commit 中新增的 6 个 chat 记录 + 代码 diff，提炼 demo 变更要点及项目对齐任务。

---

## 变更 1：设置窗口合并为 in-page overlay（chat23）

Demo 把 `OmniUsage Settings.html` 独立页面合并进 `OmniUsage UI.html`，用 `settingsOpen` 状态控制 `.sp-stage` 覆盖层显示。

**项目不需要对齐。** Electron 架构下 SettingsView 是独立 BrowserWindow，更合理。

---

## 变更 2：死代码清理（chat24）

Demo 删除了未使用的图标、CSS class、组件 props。对应项目需清理：

- `UsageBarRow` 的 `color` / `danger_threshold` props（颜色系统改造后废弃）
- `globals.css` 重复两套 `.bar-row` 样式块（~472 行 vs ~1914 行）
- `.fill.blue` / `.fill.purple` / `.fill.danger` CSS 规则

---

## 变更 3：余额/MCP 分数指标（chat25）

Demo 新增 ratio 模式：`BarRow` 接受 `max` prop，有 max 时显示 `value/max` 而非百分比，且不显示 reset 时间列。

**项目对齐**：`UsageItem` schema 已有 `displayStyle: "ratio"`。`UsageBarRow` 需支持 ratio 渲染：

- `displayStyle === "ratio"` → 显示 `used/limit`，隐藏 reset
- 宽度按 `used/limit` 百分比计算

---

## 变更 4：8 色循环调色板（chat26）

颜色从按类型分配改为按位置分配，纯色无渐变，去掉 danger 红色。

```
#5B8CFF  #8B72F8  #46C7C7  #7EA2FF  #A18CFF  #72D4D1  #9CB8FF  #B6A7FF
```

规则：`color = PALETTE[idx % 8]`，idx 是条在卡片内的 0-based 位置。

**项目对齐**：

1. 新建 `src/renderer/lib/usage-colors.ts`，导出 `USAGE_COLORS` 数组 + `usage_color(idx)` 函数
2. `UsageBarRow` 删除 `color` / `danger_threshold` props，新增 `idx`，用 inline `background` 设纯色
3. `ProviderCard.render_bar_row()` 和 `ProviderAccountRow` 同改
4. CSS 删 `.fill.blue` / `.fill.purple` / `.fill.danger`

---

## 变更 5：数字居中 + grid 列宽 + 空值支持（chat27）

- `.bar-pct` 从 `text-align: right` 改为 `center`
- `.bar-row` grid 从 `42px 1fr 40px 76px` 改为 `42px 1fr 64px 76px`
- `value == null` → 空条（无填充、无数字、无 reset 时间）
- Gemini 的 metrics 全部是百分比（不是分数），修正了之前误标

---

## 变更 6：Gemini 8 条 metrics（chat26）

Demo 新增 Gemini 厂商，使用 `metrics: [{ label, value }]` 数组替代固定的 h5/week 字段，渲染 8 条百分比用量条。

**项目对齐**：`ProviderUsageGroup.periods` 本身就是多指标数组。改造点：

- 不再硬编码取前 2 个 period 渲染"5小时/一周"
- 遍历全部 `periods`，每条传 `idx` 渲染 `UsageBarRow`
- 自然支持任意条数（Gemini 8 条、GLM 3 条、DeepSeek 1 条余额）

---

## 对齐任务清单

按执行顺序排列，后者依赖前者：

### T1：用量条颜色系统重构

- 文件：`lib/usage-colors.ts`(新)、`UsageBarRow.tsx`、`ProviderCard.tsx`、`ProviderAccountRow.tsx`、`globals.css`
- 内容：
    - 导出 8 色常量 + `usage_color(idx)`
    - `UsageBarRow` 删 `color`/`danger_threshold`，加 `idx`，inline `background`
    - `ProviderCard` / `ProviderAccountRow` 传 `idx`，删 `period_fill_class`
    - CSS 删 `.fill.blue/.purple/.danger`，删 `.bar-pct.danger`

### T2：ratio/分数显示

- 文件：`UsageBarRow.tsx`、`ProviderCard.tsx`、`ProviderAccountRow.tsx`、`globals.css`
- 内容：
    - `UsageBarRow` 新增 `max?: number`，有 max 时显示 `used/limit`、隐藏 reset
    - `ProviderCard` / `ProviderAccountRow` 根据 `displayStyle === "ratio"` 传 `max`
    - CSS `.bar-pct` 改 `text-align: center`，`.bar-row` grid 列宽改 `42px 1fr 64px 76px`

### T3：遍历 periods 替代硬编码

- 文件：`ProviderCard.tsx`、`ProviderAccountRow.tsx`
- 内容：
    - 不硬编码"5小时/一周"，遍历 `periods` 数组渲染
    - 每条传 `idx`（颜色）、根据 `displayStyle` 决定百分比/分数

### T4：空值 + CSS 清理

- 文件：`UsageBarRow.tsx`、`globals.css`
- 内容：
    - `UsageBarRow` 支持 `used == null` → 空条
    - 合并 globals.css 两套重复 `.bar-row` 定义
    - 删其他死 CSS（`.app-badge` 等，与颜色改造无关的可选清理）

### 不做

- 设置窗口 in-page overlay：Electron 多窗口方案正确
