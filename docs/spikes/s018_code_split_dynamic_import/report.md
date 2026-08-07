# Spike report

## 问题

electron-vite renderer 构建对动态 import 的代码分割行为（含打包后 file:// 协议下 chunk 加载）。spec `t249` 的 `UNVERIFIED-SPIKE` 项，需核实后改写为验证结论。

## 成功判据

- web 构建产物中 echarts 运行时代码位于独立 chunk，不在首屏入口 chunk 内。
- Electron renderer 构建产物中，SessionShell 子树与 echarts 运行时代码分别位于独立 chunk，不在首屏入口 chunk 内。
- 构建输出的 chunk 警告状态可量化记录，供 AC 判定使用。

## 尝试

在 worktree `omni_usage_t249` 直接实施最小实现改动后执行 `pnpm build`：

- `src/renderer/App.tsx`：五个 route 页面改为 `React.lazy` + `<Suspense>`，fallback 为「加载中…」占位。
- `src/renderer/hooks/use-echarts.ts`：顶层 `import * as echarts` 移除，改为 effect 内 `import("echarts").then(({ init }) => ...)` 异步初始化；`getOption` 经 ref 取最新闭包；`disposed` 标志防卸载竞态（resolve 前组件已卸载时不 init）。
- 基线：web 单 chunk 1,760.58 kB（gzip 576.82 kB）触发 chunk size 警告；electron renderer 单 chunk 4,218.84 kB。

## 证据

改动后构建产物（electron renderer `out/renderer/`）：

- 入口 `index-CUjMJbHa.js` 539.56 kB，grep 计数 echarts=0。
- `SessionShell-Cy2Kl4cH.js` 479.64 kB、`TokenStatsView-CafODGXE.js` 82.67 kB、`PopupView-*`、`SettingsView-*`、`TrayMenu-*` 均为独立 chunk。
- `index-Ch-sEdwe.js` 2,764.91 kB（含 echarts 运行时 + tslib 等共享依赖）。

web 构建产物（`out/web/`）：

- 入口 `index-Bc51CmzJ.js` 204.28 kB（gzip 63.85 kB），grep echarts=0。
- `SessionShell-CWPFhFkU.js` 204.78 kB、`TokenStatsView-*` 等独立 chunk。
- echarts 独立 chunk `index-C-uxhVkd.js` 1,128.12 kB（gzip 379.24 kB）。

补充实验（按需注册）：改用 `echarts/core` + `echarts/charts` + `echarts/components` + `echarts/renderers` 按需注册，仅注册本应用用到的图表与组件（BarChart / HeatmapChart / PieChart + Grid / Tooltip / DataZoom / VisualMap + CanvasRenderer），模块级缓存 Promise 复用一次加载。

按需注册后构建产物：

- web：`charts-*.js` 260.95 kB、`components-*.js` 260.83 kB、`Axis-*.js` 246.22 kB、`renderers-*.js` 33.96 kB、`core-*.js` 5.00 kB，入口 `index-*.js` 204.28 kB。所有 chunk < 500 kB，**无 chunk size 警告**。
- electron renderer：`charts-*.js` 654.62 kB、`components-*.js` 620.48 kB、`Axis-*.js` 610.57 kB、入口 `index-*.js` 539.56 kB、SessionShell 479.64 kB 等独立 chunk；electron-vite 构建**不输出 chunk size 警告**（grep 全量 build 输出无匹配）。

## 结论

- electron-vite renderer 对 `React.lazy` 动态 import 的分割行为正常：各 route 页面与 echarts 运行时均从首屏入口剥离，成为独立 chunk；web 与 Electron renderer 两个入口同时生效。file:// 下 chunk 加载需 `pnpm test:packaged` 真机黑盒，属 AC4/AC5 黑盒验证范围，未在本 spike 单独打包验证。
- echarts 整包动态加载后 web 端独立 chunk 1,128 kB 超 Vite 默认 500 kB 阈值仍告警；改用 `echarts/core` 按需注册后，web 端所有 chunk < 500 kB，web 构建不再输出 chunk size 警告；renderer 端 echarts 按子模块拆分为独立 chunk（最大约 655 kB），electron-vite 构建不输出 chunk size 警告，AC1 原样满足。按需注册需要 spec「非范围」去掉「不做 ECharts 模块级裁剪」条款（用户已确认无警告为达成目标）。

## 是否采纳

- 决定：是（分割机制可用）
- 理由：动态 import 分割 + echarts/core 按需注册后，web 端无 chunk size 警告、renderer 端 electron-vite 亦无警告，达到「首屏不拖入 echarts 与会话库」且 AC1 原样满足。
- 后续 task：t249；spec 非范围需同步去掉裁剪禁令。
