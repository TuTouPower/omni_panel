# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

`WorkspaceView.tsx` 每 5s 对每个 status=ready 的面板发一次全量 `sessionHistory.query` 作为兜底刷新。订阅 watcher（2s mtime 轮询增量提取 + 推送）已是主更新通道，兜底结果经 `merge_tail` 去重后通常零变化，属纯浪费的 IPC 与主进程解析负载：8 个槽位全开时每 5s 触发 8 次全量文件解析，是面板持续卡顿的来源之一。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 工作台兜底刷新机制降级：全量 query 频率显著降低（间隔常量化并拉长），保留其作为订阅推送失效时的拉齐手段。
- 订阅推送路径不变。

### 非范围

- 不改主进程订阅 / watcher / query 实现与缓存（另一优化 task 负责）。
- 不改 `merge_tail` 去重逻辑与消息上屏语义。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 面板打开后，固定观测窗口（60s）内每个面板的兜底全量 query 次数 ≤ 2（原 5s 周期为 12 次）。
- [ ] 活跃会话源文件追加后，新消息经订阅推送在秒级上屏，不依赖兜底周期。
- [ ] 兜底仍周期性执行：注入一条订阅未推送的消息（模拟推送丢失），在兜底周期到达后被拉齐上屏。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 全部 AC 可自动测试：fake timers + mock `window.usageboard.sessionHistory`，统计 query 调用次数并模拟推送/拉齐。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- `WorkspaceView` 单测 fake timers 推进时间，统计 mock query 调用次数；模拟 `onMessagesUpdated` 推送断言上屏不经兜底；不推送仅兜底拉齐断言 AC3。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无

### 风险与回退

- 风险：推送丢失场景的上屏延迟从 5s 级变长；兜底保留周期执行，延迟有界。
- 回退：恢复原 5s 间隔常量。

### 依赖与约束

- 无前置 task 依赖；仅调 renderer 侧间隔常量，与主进程查询缓存无文件重叠。
- 约束：与工作台组件文件拆分 task 同文件（`WorkspaceView.tsx`），须串行（conflicts_with 登记）。

### Finalization 时更新的 blueprint

- 无
