# d024 渲染层代码分割与 echarts 按需注册（2026-08-07）

- 来源：t249 / s018
- 结论：
    1. `React.lazy` + `<Suspense>` 在 web 与 Electron renderer 两个入口均触发 Vite 代码分割：各 route 页面成为独立 chunk，首屏入口不再含 echarts 运行时与会话库子树。
    2. echarts 整包动态 import 后独立 chunk 约 1.1 MB，仍超 Vite 默认 500 kB chunk size 阈值；改用 `echarts/core` 按需注册（仅注册 Bar/Heatmap/Pie + Grid/Tooltip/DataZoom/VisualMap + CanvasRenderer）后，**web 端**所有 chunk < 500 kB，web 构建不再输出 chunk size 警告；renderer 端 echarts 按子模块拆分为独立 chunk（charts/components/Axis 最大约 655 kB），electron-vite 构建不输出 chunk size 警告。echarts 运行时特征串为 `echarts_instance_`。
    3. echarts 动态加载与组件卸载存在竞态：异步 init resolve 前组件已卸载时不得调用 `init`/`setOption`。防护 = 卸载时置 disposed 标志，resolve 回调先检查；`getOption` 须经 ref 取最新闭包，避免动态 import 期间 option 变化。
- 证据：s018 最小实验构建产物 chunk 划分（web 入口 204 kB、echarts 拆分 core/charts/components/Axis 各 < 300 kB；renderer 同构但最大约 655 kB）、`tests/unit/build_code_split.test.ts` 产物断言、`tests/unit/renderer/hooks/use_echarts_lazy.test.ts` 竞态测试。
- 影响：后续新增图表/渲染组件优先走按需注册 + 懒加载；chunk 阈值不调整；新增懒加载路由须带 Suspense fallback。
- 现状：有效
