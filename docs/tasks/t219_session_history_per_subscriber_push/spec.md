# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

p048（t210_code_f004）：`session-history-ipc.ts` SUBSCRIBE 的 `on_update` 把增量消息发往 `history_window_controller.get_window()`（唯一历史窗口），未按「订阅方窗口」路由。当前架构下订阅只由历史窗口（t211）发起，agent route 明细表入口（t212）走 `SESSION_HISTORY_OPEN` 打开窗口而非内联订阅，故无实际推错场景。属防御性改造，为未来「窗口内嵌订阅」保留路由能力。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 让订阅与发起窗口绑定：SUBSCRIBE IPC 事件携带发起方窗口身份（sender webContents / window id），订阅表记录订阅方窗口；`on_update` 推送只发给该窗口。
- 未绑定窗口的订阅（如未来无窗口上下文调用）保持现状或明确 fallback（推给历史窗口）。
- 相关单测：多窗口订阅互不串扰、单窗口行为不回归。

### 非范围

- 会话历史窗口本身行为（t211/t212）。
- 新增内嵌订阅能力（本 task 只做路由基础，不新增内嵌 UI）。
- subscription-service 订阅表语义扩展（如需要多窗口同会话）——若涉及，纳入本 task 范围判定。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 两个不同窗口订阅同一会话，各窗口只收到自己订阅触发的推送（互不串扰）。
- [ ] 历史窗口单订阅场景（t211 现有路径）行为不回归：打开会话栏、实时追加照常。
- [ ] 订阅方窗口关闭后，该订阅不再向其推送（无残留句柄 / 无泄漏）。
- [ ] 未绑定窗口的订阅有明确 fallback 行为（文档化 + 单测锁定）。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 全部 AC 可自动测试：IPC 层 + subscription-service 单测可覆盖多窗口路由。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 真实多窗口 Electron 行为：单测 mock window 身份即可，[deploy] 不需要。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- mock 边界：SUBSCRIBE 事件带 `event.sender` 窗口身份；controller 用 mock `get_window`。
- 断言目标：推送目标窗口 id 与订阅方一致；窗口关闭后推送 no-op。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无。

### 风险与回退

- 风险：sender 身份在 Electron IPC 与 mock 间形态差异。
- 回退：用 `event.sender` 的稳定身份（webContents id 或 window id），跨进程不序列化。

### 依赖与约束

- 依赖 t210（订阅服务 / IPC）、t211/t212（历史窗口消费方）。
- 无平台/安全约束。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：§4.4 订阅/watcher 注明推送按订阅方窗口路由。
