# Demo 对齐清单

> 基于 `f972d23`（最新 design demo commit）与当前前端代码的差异分析。
> 聊天记录：`docs/design/omni-usage/chats/chat23.md` ~ `chat27.md`

## 一、用量条颜色系统（chat26）

**Demo 现状**：用量条颜色不再按指标类型（蓝=5小时、紫=一周）分配，改为按**条在卡片内的位置**固定分配 8 色冷色调色板，纯色填充，无渐变。

```ts
// 固定 8 色调色板（3主+3次+2弱），按位置循环
const USAGE_COLORS = [
    "#5B8CFF",
    "#8B72F8",
    "#46C7C7",
    "#7EA2FF",
    "#A18CFF",
    "#72D4D1",
    "#9CB8FF",
    "#B6A7FF",
];
// 颜色索引 = 位置 % 8
```

**本项目状态**：已实现。`src/renderer/lib/usage-colors.ts` 提供 8 色调色板和循环取色；`ProviderCard.tsx` / `ProviderAccountRow.tsx` 按行位置传入索引并用纯色 `style.background` 渲染；`globals.css` 使用 `--bar-track` 作为统一轨道底色，已删除旧 `.fill.blue` / `.fill.purple` / `.fill.danger` 样式。

**已实现**：

| 文件                               | 状态                                                        |
| ---------------------------------- | ----------------------------------------------------------- |
| `src/renderer/lib/usage-colors.ts` | 已新增 `USAGE_COLORS` / `usage_color(idx)`                  |
| `ProviderCard.tsx`                 | 已删除类型颜色映射，按位置索引渲染纯色                      |
| `ProviderAccountRow.tsx`           | 已按位置索引渲染纯色                                        |
| `globals.css`                      | 已删除旧 fill class 和重复 bar 定义，轨道使用 `--bar-track` |

**颜色调色板常量**（建议放 `src/renderer/lib/usage-colors.ts`）：

```ts
export const USAGE_COLORS = [
    "#5B8CFF", // 1 主蓝
    "#8B72F8", // 2 主紫
    "#46C7C7", // 3 主青
    "#7EA2FF", // 4 扩展蓝
    "#A18CFF", // 5 扩展紫
    "#72D4D1", // 6 扩展青
    "#9CB8FF", // 7 浅蓝灰
    "#B6A7FF", // 8 浅紫灰
];
export function usage_color(idx: number): string {
    return USAGE_COLORS[((idx % USAGE_COLORS.length) + USAGE_COLORS.length) % USAGE_COLORS.length];
}
```

## 二、用量条数值居中对齐（chat27）

**Demo 现状**：`.bar-pct { text-align: center; }`，数字在列内居中。

**本项目状态**：已实现。`globals.css` 中唯一 `.bar-pct` 定义为 `text-align: center`，并有 `tests/unit/renderer/globals_css.test.ts` 锁定。

## 三、分数/余额/MCP 等非百分比指标（chat25）

**Demo 现状**：`BarRow` 支持 `max` prop，有 max 时显示为"value/max"分数格式，去掉 reset 时间列。

```jsx
<BarRow label="MCP" value={95} max={1000} idx={2} />
// 显示：MCP  ████████░░  95/1000
<BarRow label="余额" value={52} max={100} idx={0} />
// 显示：余额 ██████████  52/100
```

**本项目状态**：已实现。插件输出的 `displayStyle: "ratio"` 映射为 `value/limit`，ratio 行使用 `.bar-row.frac`，reset 列留空。当前没有独立 `UsageBarRow.tsx`，逻辑在 `ProviderCard.tsx` / `ProviderAccountRow.tsx` 中等价实现。

## 四、空用量条支持（chat27）

**Demo 现状**：当 `value == null` 时，用量条为空（不渲染进度填充、不显示数字、不显示刷新时间）。示例：MiniMax 的 5小时条。

```jsx
// h5: null → 空条
<BarRow label="5小时" value={null} idx={0} reset="" />
```

**本项目状态**：已实现。`used == null` 时填充宽度为 0，右侧数字和 reset 均为空；`provider_card.test.tsx` 已覆盖空条。

## 五、CSS 清理

**Demo 删除了以下未使用的样式**（chat24）：

- `.app-badge` / `.app-badge.sm` — 使用 logo 图片替代
- `.aa-badge` — about 面板改用 logo
- `.tray-win-tag` — 未使用
- `.window.hidden` + `@keyframes popIn` — 未使用
- `ma.css` 中的 `.ma-window` / `.avg-badge` / `.acct-toggle` — 指向不存在的文件

**本项目状态**：已完成清理。`globals.css` 不再包含 `.app-badge`、`.aa-badge`、`.tray-win-tag`、旧 fill class、`.bar-pct.danger` 和第二段重复 bar 定义；`Icon.tsx` 删除了无引用的 `clock` / `warn`，项目内没有 `key` / `clipboard` icon 定义。

## 六、设置窗口覆盖层（chat23）

**Demo 现状**：设置窗口不再用 `window.open()` 打开独立 HTML，而是作为 in-page overlay（`sp-stage`）在同一个 HTML 内渲染。

**本项目现状**：使用独立的 Electron `BrowserWindow` 显示 `SettingsView`（通过 `window.usageboard.settings.open()` IPC 调用）。

**判断**：本项目的独立 BrowserWindow 方案更适合生产环境（frameless + 自定义标题栏已在 26.2 实现）。不需要改为 demo 的 in-page overlay 方式。此项**不对齐**。

## 七、数据模型扩展（chat25/26）

**Demo 新增字段**（仅 demo 静态数据，不需要后端改动）：

- `balanceOnly: boolean` — 卡片仅显示余额（如 DeepSeek）
- `balance: { value: number, max: number }` — 余额分数
- `mcp: { value: number, max: number }` — MCP 调用量
- `metrics: Array<{ label: string, value: number, max?: number }>` — 通用多条指标（Gemini 8条）

这些是 demo 静态数据的展示形式。本项目的真实数据来自插件输出（`usePlugins`），插件的 `UsageItem` schema 已支持 `displayStyle: "percent" | "ratio"`。对齐方案：

- `UsageBarRow` 的 `max` prop 对应 schema 的 `displayStyle === "ratio"` 场景
- `metrics` 数组形态对应同一 account 下的多条 `UsageItem`（目前已按 periods 渲染）

## 总结：需要改动的优先级

| 状态       | 项                               | 涉及文件                                                                       |
| ---------- | -------------------------------- | ------------------------------------------------------------------------------ |
| **已完成** | 用量条 8 色位置调色板 + 纯色填充 | `usage-colors.ts`, `ProviderCard.tsx`, `ProviderAccountRow.tsx`, `globals.css` |
| **已完成** | 数字居中对齐                     | `globals.css`                                                                  |
| **已完成** | 分数/ratio 显示支持              | `ProviderCard.tsx`, `ProviderAccountRow.tsx`, `globals.css`                    |
| **已完成** | 空用量条支持                     | `ProviderCard.tsx`, `ProviderAccountRow.tsx`                                   |
| **已完成** | CSS 死代码清理                   | `globals.css`, `Icon.tsx`                                                      |
| **不适用** | 设置窗口 in-page overlay         | 本项目已有 frameless BrowserWindow，维持现状                                   |
