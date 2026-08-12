# Task spec

## 背景

web 面板（WSL 无头运行时的唯一 UI）右上角没有「会话历史」按钮，因 `TitleBar` 用 `!is_web()` 隐藏。但 web 模式 `usageboard-web.ts` 已实现完整 `sessionHistory` bridge（open 分发 onFocus、subscribe/query 等），web 面板本有会话历史能力。用户确认 web 也显示。见 p136。

## 契约区

### 范围

- 用量面板右上角“会话历史”按钮在 web 模式（data-web=1）下也渲染。
- 点击按钮在 web 模式下正常触发会话历史打开（走既有 web sessionHistory.open → onFocus 分发），并进入 t313 定义的 `#session` 路由。

### 非范围

- 不改 web sessionHistory bridge 实现（已可用）。
- 不改桌面模式按钮行为。

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

- [ ] AC-001：web 面板（data-web=1）右上角渲染「会话历史」按钮。
- [ ] AC-002：web 面板点击「会话历史」按钮触发 onFocus 分发并进入 `#session` 路由，无报错。
- [ ] AC-003：桌面模式（非 web）按钮行为不变（仍打开会话历史窗口）。
- [ ] AC-004：相关测试全绿。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：web e2e 断言按钮可见、点击触发并进入 `#session`；桌面 e2e 断言按钮行为不变。

## 上下文区

- 来源：p136（2026-08-11 用户确认 web 也显示会话历史）
- 路由约束：依赖 t313 完成 `#history` → `#session`，本 task 按最终路由验收。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- web e2e：断言 titlebar 会话按钮在 web 渲染，点击后 onFocus 订阅者收到事件且 hash 为 `#session`。
- 桌面 e2e/单测：断言非 web 下按钮仍渲染且 onClick 调 sessionHistory.open。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无（web sessionHistory 已实现，见 usageboard-web.ts:607）

### 风险与回退

- 风险：t313 路由改名若有残留，按钮点击可能分发 onFocus 但未挂载 `#session` 面板。
- 回退：恢复 `!is_web()` 条件。

### 依赖与约束

- 依赖 t313 完成 `#session` 路由与会话面板挂载。
- t311 在本 task 后把 web 标题栏导航入口改为原生链接。

### Finalization 时更新的 blueprint

- 无
