# Demo 对齐清单

> 基于 `docs/design/CHANGELOG-design.md`（chat28 + chat29）与当前前端代码的差异分析。

## 一、用量条颜色方案（chat28 / chat29）

**Demo 现状**：用量条颜色从单一位置色板升级为三套可选方案，默认必须是「风险色：仅当前用量」。九色循环只作为第三个可选方案，不再默认启用。

| 顺序 | 方案                       | 规则                                                           |
| ---- | -------------------------- | -------------------------------------------------------------- |
| 1    | 风险色：仅当前用量（默认） | `>=95` 红，`>85` 橙，`>60` 黄，其他绿                          |
| 2    | 风险色：带投影预测         | 额外计算 `projected = current / elapsed`，无法计算时回退方案 1 |
| 3    | 彩色区分：九色循环         | 按位置 `idx % 9` 循环冷色系，只做视觉区分                      |

**本项目状态**：已实现。`src/renderer/lib/usage-colors.ts` 提供三套取色逻辑；投影方案会按已知周期标签与 `resetAt` 推算 elapsed，无法计算时回退当前用量风险色；`ProviderCard.tsx` / `ProviderAccountRow.tsx` 默认使用风险色，仅在配置为 `nine-cycle` 时使用九色循环；`SettingsView.tsx` 在「设置 > 外观 > 用量条颜色方案」提供三项选择并持久化到 `usageBarColorScheme`。

**九色循环色板**：

```ts
const USAGE_COLORS = [
    "#5B8CFF",
    "#8B72F8",
    "#46C7C7",
    "#7EA2FF",
    "#A18CFF",
    "#72D4D1",
    "#9CB8FF",
    "#B6A7FF",
    "#A7D8D8",
];
```

**已实现**：

| 文件                               | 状态                                      |
| ---------------------------------- | ----------------------------------------- |
| `src/renderer/lib/usage-colors.ts` | 三套方案 + 默认 `risk-current` + 九色循环 |
| `ProviderCard.tsx`                 | 概览/列表卡片按配置取色                   |
| `ProviderAccountRow.tsx`           | 标签页账号详情按配置取色                  |
| `SettingsView.tsx`                 | 外观页新增三选项设置                      |
| `globals.css`                      | 新增亮/暗主题风险色变量和设置项样式       |

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

| 状态       | 项                              | 涉及文件                                                                                           |
| ---------- | ------------------------------- | -------------------------------------------------------------------------------------------------- |
| **已完成** | 用量条三套颜色方案 + 默认风险色 | `usage-colors.ts`, `ProviderCard.tsx`, `ProviderAccountRow.tsx`, `SettingsView.tsx`, `globals.css` |
| **已完成** | 数字居中对齐                    | `globals.css`                                                                                      |
| **已完成** | 分数/ratio 显示支持             | `ProviderCard.tsx`, `ProviderAccountRow.tsx`, `globals.css`                                        |
| **已完成** | 空用量条支持                    | `ProviderCard.tsx`, `ProviderAccountRow.tsx`                                                       |
| **已完成** | CSS 死代码清理                  | `globals.css`, `Icon.tsx`                                                                          |
| **不适用** | 设置窗口 in-page overlay        | 本项目已有 frameless BrowserWindow，维持现状                                                       |
