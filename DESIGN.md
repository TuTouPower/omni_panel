---
version: alpha
name: OmniPanel
description: OmniPanel 全窗口统一设计语言。Tailwind CSS v4 CSS-first 架构的 token 单一真相源——单一品牌蓝强调色、Inter 字体、双主题、macOS Menu Bar 工具气质。
colors:
    primary: "#3d7afd"
    primary-strong: "#2f66e0"
    on-primary: "#ffffff"
    primary-container: "#eef3ff"
    surface: "#e7eaf1"
    surface-window: "#ffffff"
    surface-card: "#ffffff"
    surface-raised: "#f1f4f9"
    field-bg: "#f6f8fb"
    menu-bg: "rgba(255, 255, 255, 0.86)"
    on-surface: "#232a38"
    on-surface-variant: "#687085"
    on-surface-muted: "#9aa2b2"
    outline: "#e6eaf1"
    hairline: "#eef1f6"
    success: "#22c55e"
    warning: "#f5a524"
    error: "#ef4444"
    risk-mid: "#eab308"
    risk-high: "#f97316"
    risk-critical: "#ef4444"
    brand-cyan: "#00d5ff"
    brand-blue: "#1482ff"
    brand-violet: "#4e5bff"
    brand-magenta: "#f23bc4"
    primary-dark: "#5b8dff"
    primary-container-dark: "rgba(91, 141, 255, 0.16)"
    surface-dark: "#0c0e13"
    surface-window-dark: "#181b22"
    surface-card-dark: "#1f232c"
    surface-raised-dark: "#262b34"
    chip-active-dark: "#363c48"
    field-bg-dark: "#20242c"
    menu-bg-dark: "rgba(34, 38, 47, 0.9)"
    on-surface-dark: "#e9ecf3"
    on-surface-variant-dark: "#a3abba"
    on-surface-muted-dark: "#6c7382"
    outline-dark: "#2a2f3a"
    hairline-dark: "#262b34"
    success-dark: "#34d27b"
    warning-dark: "#f7b53c"
    error-dark: "#ff6b6b"
typography:
    display-num:
        fontFamily: '"Inter Variable", system-ui, "PingFang SC", "Microsoft YaHei", sans-serif'
        fontSize: 30px
        fontWeight: 700
        lineHeight: 1.15
        letterSpacing: -0.02em
        fontFeature: '"tnum"'
    title-lg:
        fontFamily: '"Inter Variable", system-ui, "PingFang SC", "Microsoft YaHei", sans-serif'
        fontSize: 21px
        fontWeight: 650
        lineHeight: 1.3
        letterSpacing: -0.01em
    title-md:
        fontFamily: '"Inter Variable", system-ui, "PingFang SC", "Microsoft YaHei", sans-serif'
        fontSize: 17px
        fontWeight: 600
        lineHeight: 1.35
        letterSpacing: -0.01em
    title-sm:
        fontFamily: '"Inter Variable", system-ui, "PingFang SC", "Microsoft YaHei", sans-serif'
        fontSize: 15px
        fontWeight: 600
        lineHeight: 1.4
    body-md:
        fontFamily: '"Inter Variable", system-ui, "PingFang SC", "Microsoft YaHei", sans-serif'
        fontSize: 13.5px
        fontWeight: 450
        lineHeight: 1.5
    body-sm:
        fontFamily: '"Inter Variable", system-ui, "PingFang SC", "Microsoft YaHei", sans-serif'
        fontSize: 12.5px
        fontWeight: 450
        lineHeight: 1.5
    label-md:
        fontFamily: '"Inter Variable", system-ui, "PingFang SC", "Microsoft YaHei", sans-serif'
        fontSize: 11.5px
        fontWeight: 550
        lineHeight: 1.35
    label-caps:
        fontFamily: '"Inter Variable", system-ui, "PingFang SC", "Microsoft YaHei", sans-serif'
        fontSize: 10.5px
        fontWeight: 650
        lineHeight: 1.2
        letterSpacing: 0.06em
    code-md:
        fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace'
        fontSize: 12.5px
        fontWeight: 450
        lineHeight: 1.55
rounded:
    xs: 6px
    sm: 8px
    md: 10px
    lg: 14px
    xl: 18px
    full: 999px
spacing:
    card-gap: 12px
    card-padding: 16px
    section-gap: 24px
    panel-padding: 14px
    row-height: 40px
shadows:
    window: "0 20px 60px -12px rgba(23, 33, 68, 0.28)"
    card: "0 1px 2px rgba(22, 33, 66, 0.04), 0 6px 18px -8px rgba(22, 33, 66, 0.08)"
    menu: "0 12px 38px rgba(20, 30, 60, 0.2)"
    window-dark: "0 20px 60px -12px rgba(0, 0, 0, 0.65)"
    card-dark: "0 1px 2px rgba(0, 0, 0, 0.3)"
components:
    window-panel:
        backgroundColor: "{colors.surface-window}"
        textColor: "{colors.on-surface}"
        rounded: "{rounded.xl}"
    card:
        backgroundColor: "{colors.surface-card}"
        textColor: "{colors.on-surface}"
        rounded: "{rounded.lg}"
        padding: "{spacing.card-padding}"
    button-primary:
        backgroundColor: "{colors.primary}"
        textColor: "{colors.on-primary}"
        typography: "{typography.body-md}"
        rounded: "{rounded.md}"
        padding: 9px 18px
    button-primary-hover:
        backgroundColor: "{colors.primary-strong}"
    button-secondary:
        backgroundColor: "{colors.surface-window}"
        textColor: "{colors.on-surface}"
        typography: "{typography.body-md}"
        rounded: "{rounded.md}"
        padding: 9px 18px
    button-danger:
        backgroundColor: "{colors.error}"
        textColor: "{colors.on-primary}"
        typography: "{typography.body-md}"
        rounded: "{rounded.md}"
        padding: 9px 18px
    icon-button:
        backgroundColor: transparent
        textColor: "{colors.on-surface-variant}"
        rounded: "{rounded.sm}"
        size: 32px
    icon-button-hover:
        backgroundColor: "{colors.surface-raised}"
        textColor: "{colors.on-surface}"
    input-field:
        backgroundColor: "{colors.field-bg}"
        textColor: "{colors.on-surface}"
        typography: "{typography.body-md}"
        rounded: "{rounded.md}"
        padding: 9px 12px
    segmented-item-active:
        backgroundColor: "{colors.surface-card}"
        textColor: "{colors.primary}"
        typography: "{typography.label-md}"
        rounded: "{rounded.sm}"
    badge-count:
        backgroundColor: "{colors.primary-container}"
        textColor: "{colors.primary}"
        typography: "{typography.label-caps}"
        rounded: "{rounded.full}"
        padding: 2px 8px
    list-row:
        backgroundColor: transparent
        textColor: "{colors.on-surface}"
        typography: "{typography.body-md}"
        padding: 10px 12px
    list-row-hover:
        backgroundColor: "{colors.surface-raised}"
    menu-popup:
        backgroundColor: "{colors.menu-bg}"
        textColor: "{colors.on-surface}"
        typography: "{typography.body-md}"
        rounded: "{rounded.md}"
        padding: 6px
    menu-item-hover:
        backgroundColor: "{colors.primary}"
        textColor: "{colors.on-primary}"
    dialog:
        backgroundColor: "{colors.surface-window}"
        textColor: "{colors.on-surface}"
        rounded: "{rounded.lg}"
        padding: "{spacing.section-gap}"
        width: 372px
    progress-track:
        backgroundColor: "{colors.surface-raised}"
        rounded: "{rounded.full}"
        height: 6px
    progress-fill:
        backgroundColor: "{colors.primary}"
        rounded: "{rounded.full}"
        height: 6px
    progress-capsule:
        backgroundColor: "{colors.surface-raised}"
        textColor: "{colors.on-surface}"
        typography: "{typography.label-md}"
        rounded: "{rounded.full}"
        height: 22px
    status-dot:
        backgroundColor: "{colors.success}"
        size: 7px
        rounded: "{rounded.full}"
    metric-value:
        textColor: "{colors.on-surface}"
        typography: "{typography.display-num}"
---

## Overview

OmniPanel 是一个常驻桌面的用量监控工具：它把多个 AI 服务商的额度、余额、用量集中读出来，如实标注来源与新鲜度。它的设计参照物是 macOS 原生 Menu Bar 工具（iStat Menus、UsageBoard 这一类）——不是营销页面，不是聊天应用，是一件每天被瞥几十次的精密仪表。

这件仪表的气质由三条定义：

- **密度优先**。面板默认 482×480，信息必须在小面积内分层排布：大数字、细标签、发丝分隔线、紧凑行距。留白服务于分组，不服务于气派。
- **诚实于数据**。每个数字都有来源与新鲜度标注；状态（正常/风险/过期/失败）用克制的语义色表达，绝不为了好看而掩盖异常。
- **安静**。无渐变背景、无装饰插图、无炫耀性动效。唯一的色彩浓度来自品牌蓝强调色与风险语义色，其余是中性灰阶。品牌渐变（青→蓝→紫→品红）只属于 logo 本身，不进入界面。

目标读者的情感预期：「这东西靠谱、清楚、不吵」。

## Tailwind 架构

全项目样式收敛到 Tailwind CSS v4 的 CSS-first 模型，本文件是其上游真相源。架构分四层，每层职责唯一：

1. **Token 层（本文件 → `@theme`）。** front matter 中的 token 经 `designmd export --format css-tailwind` 导出为 `@theme` 块，落入唯一的全局样式入口 `src/renderer/styles/globals.css`。任何视觉值（颜色、字号、圆角、间距、阴影）必须能追溯到 token，禁止在组件里写散落的字面量。
2. **语义变量层。** 明暗双主题不在工具类里复制，而是走 CSS 变量翻转：`@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *))`，`@theme inline` 把语义名（`--color-surface`、`--color-on-surface`…）指向随 `data-theme` 切换的底层变量。组件只写 `bg-surface text-on-surface`，永远不写 `dark:bg-xxx`——主题分支只存在于变量定义一处。
3. **组件层（React + utility class）。** 按钮、卡片、输入框、开关、对话框等实现为 `src/renderer/components/ui/` 下的 React 组件，类名由 token 工具类组合（`clsx` + `tailwind-merge`）。出现三次以上的复合模式才允许沉淀为 `@utility`（如 `glass-menu`、`metric-num`），一次性的布局直接写在 JSX 里。
4. **清零手写 CSS。** BEM 风手写类（`.card`、`.btn-primary`、`.sp-*`…）整体退役；`globals.css` 只保留 token 定义、`@utility` 与极少量无法工具化的基础样式。session-shell / token-stats 两套作用域色板随组件改造一并删除，桥接变量不保留。

图标统一 lucide-react（已是依赖），手绘 SVG 图标集退役；厂商 logo 保留资产文件，明暗双份用 `dark:` 变体切换。

## Colors

单一强调色系统：品牌蓝 `{colors.primary}` 是界面唯一的强调色，驱动所有交互（主按钮、选中态、链接、聚焦环、菜单悬停）。用户在设置中可切换强调色（蓝/紫/青/橙/红五档），实现上只翻转一个 `--color-primary` 变量，所有窗口的所有面板同时响应——不存在第二套强调色。

- **Primary (#3d7afd / 暗色 #5b8dff):** 品牌蓝。交互的唯一驱动色。白字蓝底的主按钮接受 AA 大字级对比（≥3:1），正文级文字不放在蓝底上。
- **中性灰阶:** 冷灰。亮色主题 `surface` 桌面衬底 #e7eaf1、窗口 #ffffff；暗色主题 #0c0e13 / #181b22。卡片在亮色下与窗口同色，靠描边与浅投影分出层级；暗色下卡片 #1f232c 比窗口略亮。
- **文字三级:** `on-surface` 正文 / `on-surface-variant` 次级说明 / `on-surface-muted` 元数据（时间戳、来源标注）。元数据永远用第三级，且绝不使用强调色。
- **语义色:** 成功绿、警示琥珀、错误红只表达状态。用量风险走四级阶梯：绿（正常）→ 黄（>60%）→ 橙（>85%）→ 红（≥95%），与用量条和状态点共用同一组值。
- **品牌渐变四色**（`brand-cyan/blue/violet/magenta`）只出现在 logo 渲染中，禁止用作 UI 元素颜色。

暗色主题是完整的一等公民：所有颜色 token 的暗色值以 `-dark` 后缀定义在本文件 front matter 中，经 `@custom-variant dark` + 变量翻转统一切换。主题默认值跟随用户配置（light/dark/system），所有窗口行为一致——不存在「某窗口默认暗、某窗口默认亮」的例外。

## Typography

双字体策略：**Inter Variable**（自打包可变字体，拉丁与数字）+ 系统 CJK 回退（PingFang SC / Microsoft YaHei）。等宽用自打包 **JetBrains Mono**，只用于密钥、ID、代码片段。字体资产随应用分发，不依赖系统安装，也不引用 CDN。

层级收敛为九级，映射为 `--text-*` token；新界面不得在这九级之外自造字号：

- **display-num (30px/700):** 面板焦点数字（Token 总量、额度读数）。必须 `tabular-nums`。
- **title-lg (21px/650):** 窗口级标题（设置分区大标题）。
- **title-md (17px/600):** 卡片标题、对话框标题。
- **title-sm (15px/600):** 分区小节标题。
- **body-md (13.5px):** 正文基准。按钮文字同此级（字重 600）。
- **body-sm (12.5px):** 次级说明、列表次行。
- **label-md (11.5px/550):** 表单标签、分段控件、图注。
- **label-caps (10.5px/650, +0.06em):** 徽章、来源标注、状态标签；大写仅用于拉丁字母，中文不加字距。
- **code-md (12.5px mono):** 密钥、ID、路径。

Inter Variable 的字重轴用 450/550/600/650/700 五档。数字一律 `tabular-nums`（Inter 的 `tnum` 特性），保证刷新时位数不跳动。标题用 `-0.01em` 紧排，正文不加字距。

## Layout

四种窗口形态共享一套布局语言，差异只在尺寸与 chrome：

| 窗口             | 默认尺寸                   | 形态                              |
| ---------------- | -------------------------- | --------------------------------- |
| 用量面板 usage   | 482×480（最小 480×360）    | 无边框浮动/托盘弹出双形态，可置顶 |
| 设置 setting     | 820×660                    | 无边框 + 统一标题栏，圆角         |
| Agent 统计 agent | 900×700                    | 同 setting                        |
| 会话历史 history | 1000×720                   | 同 setting                        |
| 托盘菜单 tray    | 内容自适应（兜底 184×340） | 透明、置顶、毛玻璃                |

- **网格:** Tailwind v4 默认 4px 间距基网（`--spacing`），所有 `p-*`/`gap-*`/`m-*` 直接用整数倍。语义间距另设 token：卡片间距 `{spacing.card-gap}`、卡片内边距 `{spacing.card-padding}`、分区间隔 `{spacing.section-gap}`。
- **卡片网格:** `grid-cols-[repeat(auto-fill,minmax(420px,1fr))]`，账户/服务商卡片自适应填充。
- **标题栏:** 所有窗口使用统一的 PanelTitleBar 组件：24px logo + 窗口标题 + 面板切换 + min/max/close。用量面板因浮动形态省略窗口控制钮，但 logo、标题字号、高度与其它窗口一致。
- **层级（z-index）:** 全应用统一五层并定义为工具类——`z-sticky` 10、`z-menu` 60、`z-scrim` 90、`z-context` 100、`z-modal` 120。任何新浮层对号入座，不自造中间值。
- **密度:** 列表行高 `{spacing.row-height}`（40px，紧凑变体 36px），行内图标 14–16px。宁可缩短文案，不放大行距。

## Elevation & Depth

层级靠「描边 + 浅投影」表达，阴影本身是 token（`--shadow-*`），不写内联值：

- **窗口:** `{shadows.window}`，无边框窗口靠投影浮在桌面上；暗色用 `{shadows.window-dark}`。
- **卡片:** 1px 发丝描边（`outline`/`hairline`）+ `{shadows.card}`。暗色主题投影减弱为 `{shadows.card-dark}`，描边承担更多分层职责。macOS Retina 下描边可用 0.5px，其它平台 1px，同一组件不得混用。
- **毛玻璃只给菜单类浮层:** 托盘菜单、右键菜单、卡片菜单统一 `backdrop-blur-[28px] backdrop-saturate-[1.7]` + 半透明 `menu-bg`，沉淀为 `@utility glass-menu`。对话框遮罩用 `blur(3px)` 的轻压暗。内容卡片永远不用毛玻璃。

## Shapes

圆角尺度收敛为六档，映射为 `--radius-*` token，同类元素全应用同档：

- **xs 6px:** 小徽章、内嵌 chip。
- **sm 8px:** 图标按钮、分段控件选中块、菜单项。
- **md 10px:** 按钮、输入框、菜单弹层、进度条容器。
- **lg 14px:** 所有内容卡片（不设例外）。
- **xl 18px:** 浮动窗口外壳。
- **full 999px:** 进度条、开关、状态点、计数徽章。

图标统一 lucide-react（1.5–2px 描边、圆角端点），行内尺寸 14/16/20 三档。可交互元素一律 `cursor-pointer`。

## Components

本节是设计层规范：定义每个组件**获准存在的形态全集**及各形态取值的 token 来源。两条原则：

- **形态保留。** 产品中现存的所有组件形态（含设置里暴露给用户的每个样式选项）全部保留，一种不删。本规范只统一各形态内部的参数（粗细、字号、颜色、圆角、间距、阴影），不改变形态的数量与结构。
- **合并不在此决策。** 代码里哪些近似实现合并为一个组件的 variant、组件库怎么组织，由实施 task 按代码盘点决定；本节只保证每种现存形态在规范中有对应条目、有 token 可取。

组件样式以 front matter 中的 `components` token 为准。以下为各组件的形态与取值要点。

### 按钮

按钮形态：primary（蓝底白字，每屏最多一个主动作）、secondary（窗口底色 + 描边）、danger（红底白字，仅不可逆操作）、ghost/text（无底无边文字钮，用于行内次级操作）、icon（32×32，标题栏内 28×28，透明底、hover 铺 `surface-raised`）。统一 `px-[18px] py-[9px]`、圆角 md、字重 600。primary hover 加深至 `primary-strong`，不做位移、不放更大投影。

### 卡片

内容卡片 = `card` token：14px 圆角 + 发丝描边 + `shadow-card` + 16px 内边距。卡片标题用 `title-md`，右上角可挂卡片菜单（`z-menu` 层）。骨架屏用 shimmer 渐变，与卡片同圆角同布局。

### 表单

输入框 = `field-bg` 底 + 描边 + 圆角 md，聚焦时蓝边 + `ring-[3px] ring-primary/15` 光环。开关 38×22 pill，开启态绿色、白色圆钮平移。分段控件容器铺 `surface-raised`，选中块卡片底色 + 蓝字 + 浅投影。

### 菜单与对话框

所有弹出菜单（托盘、右键、卡片溢出）同一份配方：毛玻璃底、圆角 md、6px 内边距、菜单项整行 hover 蓝底白字（危险项红底）。对话框居中，遮罩压暗 + `blur(3px)`，宽度 372px（宽表单 420px），圆角 lg，入场只做 160ms 的轻微上浮淡入。

### 徽章与状态

徽章两种形态：计数徽章（`badge-count`，品牌蓝 12% 底 + 蓝字 + full 圆角）与来源/状态标签（灰底 `surface-raised` + `label-caps` 第三级文字色），二者不可互换。状态点 7px 圆 + 同色 16% 光晕，只表达在线/风险/失效三类状态。

### 数据展示

KPI 大数字用 `display-num` + `tabular-nums`，标签用 `label-caps` 第三级文字色。用量条保留**细线 / 胶囊两种形态**，是用户在设置中可切换的显示偏好：细线型 6px pill 轨道（`progress-track`/`progress-fill`），胶囊型 22px 高、数值内嵌（`progress-capsule`）；两种形态共用同一套填充色，填充色随风险阶梯变化。

## Motion

动效是状态反馈，不是装饰：

- 交互反馈（hover、press、toggle）：`duration-120`，`ease-[cubic-bezier(0.2,0,0,1)]`，沉淀为 `@utility transition-feedback`。
- 浮层入场（菜单、对话框、面板切换）：160–200ms，只做透明度 + ≤8px 位移。
- 数据刷新不播动画，数字直接替换（`tabular-nums` 保证不跳位）。
- 尊重 `prefers-reduced-motion`：全部时长归零（Tailwind `motion-reduce:` 变体统一处理）。

## Do's and Don'ts

- **Do** 让每个视觉值追溯到 token。审查新代码时，任何散落的颜色/字号/圆角字面量都视为缺陷；确属一次性例外的用 arbitrary value 并在评审中说明。
- **Do** 保留现存形态。样式统一只把参数平移到 token；任何组件形态（含设置中暴露给用户的样式选项）的增、删、合并，都须经代码盘点后在实施 task 中显式决策，不在统一过程中顺手为之。
- **Do** 明暗双主题成对交付。暗色值只写在变量翻转一处，组件里不出现 `dark:` 变体。
- **Do** 复合模式沉淀为 `@utility` 或 React 组件后再复用；第三次复制粘贴前必须抽象。
- **Do** 用 `tabular-nums` 渲染一切会变化的数字。
- **Do** 元数据（来源、新鲜度、时间戳）用第三级文字色 + `label-caps`，保持「诚实标注」可读但不抢戏。
- **Don't** 新增手写 BEM 类、作用域色板或第二套强调色——session-shell / token-stats 两套历史体系是待删除的存量，不是可复制的先例。
- **Don't** 在内容卡片上使用毛玻璃、渐变背景或品牌渐变四色。
- **Don't** 自造 z-index 层级、非 4px 倍数间距或第九级以外的字号。
- **Don't** 绕过组件层直接拼按钮/卡片/输入框样式；业务代码里出现第三个 `bg-primary text-white rounded-md` 复制体时，停下来把它收进组件。
- **Don't** 引入新的字体家族、图标库或 CSS 框架；Inter + JetBrains Mono + lucide 是全部。
