# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

用量面板 popup 模式关闭即销毁窗口（`main-panel-controller.ts:186-188` 走 `close()`），每次重开都要重建渲染进程、重跑 `connector:list`/`config:get`/vault 读取、React 重挂载、trend 组件级缓存全丢。floating 模式已有 hide 逻辑可对标，popup 沿用即可消除冷启动。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- popup 模式关闭改为隐藏窗口，下次打开直接 show，不重建渲染进程。
- 隐藏期间窗口状态保留：React 不重挂载、组件级缓存与已加载数据不丢。
- 窗口隐藏后释放前台资源占用（如停止不必要的计时器/轮询、降低心跳），重新显示时恢复；不破坏后台仍需的订阅。
- 模式切换（popup↔floating）仍按现有关闭重建语义；配置变更、电源恢复等已有副作用路径不受隐藏影响。

### 非范围

- 不改 floating 模式已有的隐藏行为。
- 不改窗口创建、尺寸、定位、托盘交互逻辑。
- 不改采集调度、connector、IPC 契约。
- 不改代理面板（agent/TokenStats）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [x] AC1：popup 关闭后窗口进程仍在（隐藏而非销毁），再次打开不创建新渲染进程。
- [x] AC2：重开面板时已加载的用量数据和组件级缓存仍在，不重新发起启动期的全量 IPC（connector:list/config:get）。
- [x] AC3：隐藏期间不再渲染不可见面板，前台计时器/轮询按既定策略降级；重新显示后恢复刷新。
- [x] AC4：模式切换仍触发关闭重建；配置变更、电源恢复、托盘打开等既有路径行为不变。
- [ ] AC5：`[deploy]` 打包后真实启动，多次开关键盘操作不出现冷启动延迟与白屏。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC5：真实打包启动的体感延迟需人工签收；AC1–AC4 由自动化覆盖。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 不测隐藏后操作系统层面的 GPU 合成停顿：平台差异，由 packaged smoke 人工观察。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 主进程控制器测试用 fake WindowLike 验证 hide/show/close 调用与重建路径。
- renderer 测试断言隐藏信号触发降级、重显触发恢复，不重挂载根组件。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 隐藏窗口在 Windows/macOS/Linux 三平台的资源占用与可见性行为差异：已验证（s010）。Windows 实测：hide 后渲染进程存活、工作集内存保留（94.2MB 不变）、隐藏 3s CPU 增量为 0（Chromium 后台节流暂停渲染）、show 复用同一 webContents/OS 进程且 load 计数不增。跨平台：hide()/show() 为 Electron 原生 API，webContents 生命周期三平台一致，floating 模式已生产跨平台使用同一 hide 路径；OS 层 GPU 合成停顿差异属有意不测。

### 风险与回退

- 风险：隐藏窗口仍占内存；隐藏期间订阅未降级导致后台持续刷新；某些平台 hide 后 webContents 仍全速渲染。
- 回退：恢复 close 语义，单点改动可回退实现 commit。

### 依赖与约束

- 无前置依赖；与 agent/TokenStats 优化链独立。
- 窗口生命周期变更使用 full review。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：popup 窗口生命周期改为隐藏不销毁，含降级与恢复数据流。
