# Task spec

## 背景

桌面 preload 的 sessionHistory API 有两处契约错配：(1) `summaries()` 把 main 返回的 `{ summaries }` 包装对象整体断言成 map，消费方按 `key` 取键恒 `undefined`，桌面会话库首条消息摘要恒为空（web 桥先解包 `data.summaries` 正常）；(2) `open` 通道 main handler 无 return，preload 却走 `invoke<undefined>()` 的 IpcResult 校验，每次调用必抛 "Invalid IPC response"（窗口打开靠副作用生效，但产生 unhandled rejection）。

## 契约区

### 范围

- 修复 `summaries()` 解包：先取 `data.summaries` 再返回，桌面与 web 语义一致。
- 修复 `open` 通道：main handler 返回 `ok(undefined)`，或 preload 该通道改用裸 `ipcRenderer.invoke`（不校验响应信封）。
- 为 `is_ipc_result` 增加形状测试覆盖。

### 非范围

- 不改 main 侧 session-history 数据来源逻辑。
- 不重构 session_history disabled/open_only stub 重复（归 t360）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：桌面 `summaries()` 返回值与 web 一致（`Record<locKey, text>`，非包装对象），会话库首条消息摘要非空。
- [ ] AC-002：点击会话入口（open）不再产生 "Invalid IPC response" unhandled rejection。
- [ ] AC-003：`is_ipc_result` 对 undefined/非对象/合法 IpcResult 三种形状有测试覆盖。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：preload 层单测（mock invoke 返回包装对象断言解包）、is_ipc_result 形状测试。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`preload/index.ts:272-275`、`:201`、`:355`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 在 `tests/unit/preload/` 补 summaries 形状测试（main 返回 `ok({summaries})` → preload 返回 `{...}`）。
- open 通道：mock invoke 断言不抛；is_ipc_result 边界表驱动。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：open 改裸 invoke 后绕过统一错误解包，handler 未来失败时 renderer 收到裸 rejection。
- 回退：优先选 main handler 返回 `ok(undefined)`（保留统一信封）。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
