# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

`src/renderer/App.tsx` 静态引入全部 route 页面（PopupView、SettingsView、TrayMenu、TokenStatsView、SessionShell），且 `src/renderer/hooks/use-echarts.ts` 顶层静态引入 echarts（其余图表组件均为 type-only 引入，构建期擦除）。web 与 Electron renderer 两个入口都挂载同一个 `App`，导致首屏 bundle 拖入 ECharts、会话库、Markdown 渲染等全部依赖：web 构建单 chunk 约 1.76 MB（gzip 约 577 KB，触发 chunk size 警告），Electron renderer 入口约 4.2 MB。需要按路由做代码分割，并让 ECharts 随图表页面按需加载。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- `App` 的 route 页面改为懒加载：只在进入对应 route 时加载该页面代码，页面切换加载期间有可感知占位（不出现白屏或未捕获错误）。
- echarts 运行时代码改为按需加载：未进入图表页面时，首屏加载的代码中不含 echarts 运行时。
- web 与 Electron renderer 两个构建入口均生效（两者共享 `App`，同一份改动覆盖）。

### 非范围

- 不调整 `chunkSizeWarningLimit` 或任何警告阈值。
- 不配置 Rollup `manualChunks` vendor 分包（动态 import 已满足拆分；缓存策略若需要另行立项）。
- 不改变任何页面的视觉布局、交互与数据加载逻辑。
- 不做 ECharts 模块级裁剪（echarts/core 按需注册）；整包动态加载已满足当前拆分目标。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：web 构建产物中 echarts 运行时代码位于独立 chunk，不在首屏入口 chunk 内；构建输出不再出现超过默认阈值的 chunk size 警告。
- [ ] AC2：Electron renderer 构建产物中，会话库（SessionShell 子树）与 echarts 运行时代码分别位于独立 chunk，不在首屏入口 chunk 内。
- [ ] AC3：各 route（popup / setting / tray / agent / history）页面功能与视觉与现状一致，现有 e2e 全部通过。
- [ ] AC4：进入图表页面后图表正常渲染（含窗口 resize 后重绘）；快速切换离开图表页面不产生未捕获错误。
- [ ] AC5：route 切换触发懒加载期间页面呈现加载占位而非白屏。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC1 / AC2：可通过构建脚本断言产物 chunk 划分（构建后检查输出文件与入口 chunk 内容），可自动测试。
- AC3：由现有 e2e 套件覆盖，可自动测试。
- AC4：图表渲染与 resize 由现有 e2e 覆盖；「快速切换离开」的卸载竞态可用组件级测试或 e2e 模拟，可自动测试。
- AC5：占位元素可在 e2e 或组件测试中断言，可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 回归：现有 web / electron e2e 全量通过（覆盖五个 route 与图表渲染）。
- 构建产物断言：新增测试在构建输出上断言 echarts 与 SessionShell 位于非入口 chunk（可用 vite manifest 或产物文件名/内容检查）。
- echarts 卸载竞态：动态 import resolve 前组件已卸载时不得对已卸载容器调用 init/setOption，用组件级测试覆盖。
- 打包形态黑盒：`pnpm test:packaged` 验证 file:// 下动态 chunk 加载正常。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- electron-vite renderer 构建对动态 import 的代码分割行为（含打包后 file:// 协议下 chunk 加载）：`UNVERIFIED-SPIKE`，执行期 Step 1 用最小实验 + `pnpm build` / `pnpm test:packaged` 核实。

### 风险与回退

- 风险：懒加载占位处理不当导致 route 切换白屏；echarts 异步初始化与组件卸载存在竞态；打包形态下动态 chunk 加载失败（file:// 路径）。
- 回退：还原为静态 import 的单 commit revert 即可，无数据或协议迁移。

### 依赖与约束

- 与 backlog 的会话历史窗体 task（t243–t247）无入口文件重叠；本 task 只改 import 方式，SessionShell 子树内部不动。
- 日志与密钥规则不受影响（纯前端加载方式变更）。

### Finalization 时更新的 blueprint

- 无
