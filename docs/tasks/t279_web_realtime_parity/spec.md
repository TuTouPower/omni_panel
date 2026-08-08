# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

web 端剩余两块小缺口，同属「面板功能 web 完备可用」的收尾：

1. 会话历史实时订阅：Electron 端 `sessionHistory.subscribe` / `onMessagesUpdated` 是 watcher 推送，web 端是桩（`{subscribed:false}` / 空 unsubscribe），web 查看会话时新消息不实时出现，只能手动刷新；
2. `logs.export`：Electron 走保存对话框，web 端返回 `{saved:false}`，web 用户无法导出日志。

两者都无安全/迁移面，主要是 SSE 通道接线与 HTTP 文件下载。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 会话历史实时推送 web 化：`sessionHistory.subscribe` / `unsubscribe` / `onMessagesUpdated` 经既有 SSE 通道（或既有 watcher 桥）接通，web 会话视图新消息实时更新
- `logs.export` web 实现：local-api 提供日志导出端点，web 端触发浏览器文件下载
- web bridge 替换上述桩实现

### 非范围

- config/theme 变更推送——属 web 配置对齐 task
- tokenStats `onUpdated` 语义升级（web 轮询 data_version 恒 0）——现状可接受，不在本 task
- 日志内容/格式/轮转策略调整
- 桌面版对应功能行为调整

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：web 会话视图订阅后，监控目录产生新消息时页面实时出现更新，无需手动刷新；unsubscribe 后不再收到推送
- [ ] AC2：web 端导出日志触发浏览器下载，文件内容与桌面版导出等价
- [ ] AC3：SSE 断连后 web 端按既有重连/轮询兜底，不错乱不丢订阅语义
- [ ] AC4：桌面版会话推送与日志导出行为与现状一致（回归）

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 全部 AC 可自动测试（AC1 用真实例 + 合成会话文件落盘驱动 watcher；AC2 断言下载响应体与桌面导出文件一致）

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 浏览器原生下载弹窗/保存路径选择：浏览器行为，自动测试断言响应头与内容即可

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 单测：导出端点（文件边界、空日志）、订阅/注销状态面
- 集成/e2e：真实例 + 合成会话 jsonl 落盘，断言 SSE 事件到达 web 端；下载端点响应断言
- web e2e（mock local-api）：订阅 UI 流程按需补 mock 事件

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- sessionHistory watcher 事件当前如何到达 Electron 渲染端、SSE 通道复用接入点：`UNVERIFIED-SPIKE`，Step 1 读 session-history ipc 与 local-api SSE 核实

### 风险与回退

- 风险：订阅泄漏（web 端反复订阅不注销导致 watcher 膨胀）；SSE 事件量大影响面板
- 回退：纯新增接线路径，可整段回退；订阅数设上限或复用单订阅多播

### 依赖与约束

- 依赖 t275（CLI 模式进程形态）；与 t277/t278 并行可行
- 导出端点响应不增量持久化任何文件，直接流式输出

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：web 实时推送事件清单更新
