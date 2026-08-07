# 渲染包代码分割：路由懒加载 + ECharts 动态加载

## 背景

web 与 Electron renderer 两个入口共用同一个 `App`，首屏 bundle 拖入 ECharts、会话库、Markdown 渲染等全部依赖：web 构建单 chunk 约 1.76 MB（gzip 约 577 KB，触发 chunk size 警告），Electron renderer 入口约 4.2 MB。需要按路由做代码分割，并让 ECharts 随图表页面按需加载。

## 范围

- `App` 的 route 页面懒加载：只在进入对应 route 时加载该页面代码，切换加载期间有可感知占位。
- echarts 运行时代码按需加载：未进入图表页面时首屏不含 echarts 运行时。
- web 与 Electron renderer 两个构建入口均生效。
- echarts 用 `echarts/core` 按需注册（仅注册本应用用到的图表与组件）。

## 非范围

- 不调整 `chunkSizeWarningLimit` 或任何警告阈值。
- 不配置 Rollup `manualChunks` vendor 分包。
- 不改变任何页面的视觉布局、交互与数据加载逻辑。

## 验收标准

- [x] AC1：web 构建产物中 echarts 运行时代码位于独立 chunk，不在首屏入口 chunk 内；构建输出不再出现超过默认阈值的 chunk size 警告。
- [x] AC2：Electron renderer 构建产物中，会话库（SessionShell 子树）与 echarts 运行时代码分别位于独立 chunk，不在首屏入口 chunk 内。
- [x] AC3：各 route（popup / setting / tray / agent / history）页面功能与视觉与现状一致，现有 e2e 全部通过。
- [x] AC4：进入图表页面后图表正常渲染（含窗口 resize 后重绘）；快速切换离开图表页面不产生未捕获错误。
- [x] AC5：route 切换触发懒加载期间页面呈现加载占位而非白屏。

## 实现要点

- `src/renderer/App.tsx`：五个 route 页面改 `React.lazy` + `<Suspense>`，fallback 为「加载中…」占位。
- `src/renderer/hooks/use-echarts.ts`：移除顶层静态 `import * as echarts`，改 `echarts/core` 按需注册（Bar/Heatmap/Pie + Grid/Tooltip/DataZoom/VisualMap + CanvasRenderer），模块级缓存 Promise 复用一次加载。异步 init 有卸载竞态防护（disposed 标志 + getOption 经 ref 取最新闭包）。加载失败时 `.catch` 复位缓存可重试并经 `window.usageboard.log` 上报。
- 动态 import 后各 route 页面与 echarts 子模块成为独立 chunk；web 端所有 chunk < 500 kB，electron-vite 构建不输出 chunk size 警告。

## 测试覆盖

- `tests/unit/build_code_split.test.ts`：构建产物断言（入口 chunk 不含 echarts 运行时与会话库特征；存在含特征的非入口 chunk）。产物缺失时整组跳过（`describe.skipIf`），CI/全新 worktree 不挂红。
- `tests/unit/renderer/hooks/use_echarts_lazy.test.ts`：echarts 动态加载（挂载后 init 并注册、resolve 前卸载不 init、卸载后不再响应 resize）。
- `tests/e2e/electron/secrets_persistence.spec.ts`：`openSettings` 的 `isVisible()` 改 `waitFor({ state: "visible" })`，适配路由懒加载后设置窗口 chunk 加载时序。
- `pnpm test` 全量 + `pnpm test:e2e:web`（`MOCK_FIXTURE=synthetic`）+ `pnpm test:e2e:electron` + `pnpm test:packaged`（file:// 动态 chunk 加载、agent 面板、无白屏）。
