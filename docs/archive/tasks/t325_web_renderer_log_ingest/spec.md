# Task spec

## 背景

web 面板（浏览器连 local-api）前端 renderer 日志目前只打浏览器 DevTools console（`usageboard-web.ts` `log:` 桥 = `console.debug("[usageboard]", payload)`），不落盘。桌面模式 renderer 日志经 IPC 调 `handleRendererLog` → 主进程 logger（`renderer:*` 前缀）落 `~/.config/OmniPanel/logs/app-*.log`。web 无此通道，前端日志丢失。

## 契约区

### 范围

- local-api 新增 renderer 日志接收端点（如 `POST /v1/logs/renderer`，body 为 RendererLogPayload），内部复用 `handleRendererLog` 逻辑写入主进程 logger。
- `usageboard-web.ts` 的 `log:` 桥改 POST 该端点（不再仅 console.debug；可保留 console 输出便于 DevTools 调试）。
- 认证/安全对齐 local-api 现有端点约定（与 /v1/logs/export 同层）。

### 非范围

- 不改桌面 renderer 的 IPC 日志路径（log-ipc.ts 不变）。
- 不改日志轮转/脱敏机制（复用现有 logger）。
- 不改主进程自身日志（已落盘）。

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

- [ ] AC-001：web 面板触发任意 renderer 日志（如 debug/info/warn/error）后，`~/.config/OmniPanel/logs/app-*.log` 出现对应 `renderer:*` 前缀记录（与桌面模式同格式）。
- [ ] AC-002：`POST /v1/logs/renderer` 对合法 RendererLogPayload 返回成功；非法 payload（非对象/缺 module 或 message）不落盘且不抛错（与 handleRendererLog 容错一致）。
- [ ] AC-003：日志脱敏生效（payload 中已注册 secret 值被 scrubbed，不落明文）。
- [ ] AC-004：相关测试全绿（端点单测 + web log 桥用例）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：local-api 端点单测断言落盘与容错；脱敏走 logger 既有机制验证。

## 上下文区

- 来源：用户直接需求（2026-08-12：web 运行日志也要落盘）
- 现状：桌面 `handleRendererLog`（log-ipc.ts:9）已实现 payload → logger 落盘；web `usageboard-web.ts:448` log 桥仅 console.debug；local-api 已有 `/v1/logs/export`（t279）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- local-api 端点单测：POST 合法 payload → 断言日志文件出现 renderer: 记录；POST 非法 payload → 不落盘不抛错。
- web 桥用例：`usageboard-web` 测试断言 log() 发起 POST（或等价可观察行为）。
- 脱敏：复用 logger scrubber 测试（已覆盖），本 task 确认不破坏。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无（复用现有 RendererLogPayload 契约与 logger 机制）

### 风险与回退

- 风险：web 高频日志增加 local-api 负载（renderer 日志量）；端点未认证可能被滥用刷日志。
- 回退：端点可下线；log 桥回退 console.debug。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
