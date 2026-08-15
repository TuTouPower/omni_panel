# Task spec

## 背景

续接命令默认写死在各来源（`src/renderer/lib/session-resume.ts`）。用户要求可自定义点击 session ID 后复制的命令（如 kimi 改为 `kimi --yolo -r {session_id}`）。本 task 在设置面板「常规」新增「会话续接命令」分组，4 来源各一个模板输入框，持久化到 `config.resumeCommandTemplates`。逻辑层字段与 `resume_command` 模板替换由 t401 提供。

## 契约区

### 范围

- `src/renderer/views/settings-view/sections/general_section.tsx` 新增「会话续接命令」分组，含 4 行 `SetRow`（claude_code / kimi_code / grok / opencode），各一个文本输入框。
- 输入框占位符显示各来源内置默认命令；`sub` 说明 `{session_id}` 占位符用法。
- 输入值写 `config.resumeCommandTemplates[source]` 并 `save_config` 持久化；清空保存后移除该来源条目。
- 已有自定义值从 config 回显。

### 非范围

- `resume_command` 模板替换逻辑与 config schema 字段（t401）。
- 工作台 / 会话库调用点消费自定义模板（t403）。
- 模板合法性校验（如强制包含 `{session_id}`）——仅提示，不做 block。

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

- [ ] AC-001：「常规」页显示「会话续接命令」分组，含 4 个来源输入行；各输入框占位符为对应来源内置默认命令（如 kimi_code 占位 `kimi -r {session_id}`）。
- [ ] AC-002：kimi_code 输入 `kimi --yolo -r {session_id}` 保存后，`config.resumeCommandTemplates.kimi_code` 等于该值（mock config save 断言落盘载荷）。
- [ ] AC-003：清空某来源输入并保存后，该来源条目从 `resumeCommandTemplates` 移除（`undefined` / 键消失）。
- [ ] AC-004：已有自定义值重新打开设置页时在对应输入框回显。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

全部 AC 可自动测试：组件测试或 web e2e，mock `window.usageboard.config.get` / `save`，断言 DOM 占位符、输入值、保存载荷与清空行为。

## 上下文区

- 来源：用户需求（2026-08-16 确认：「常规」新增分组）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 模板不含 `{session_id}`：不强制校验，用户自行负责；不测。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- mock `window.usageboard.config.get` 返回带/不带 `resumeCommandTemplates` 的配置，`save` 记录载荷。
- 断言：占位符文本、输入框 value、保存载荷的 `resumeCommandTemplates`、清空后键消失。
- fixture 用与 `config-schema.test.ts` 一致的配置形状。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

无

### 风险与回退

- 风险：输入框无合法模板时 session id 不出现（用户手误）；仅提示不拦截。
- 回退：清空条目即回退内置默认；无数据迁移。

### 依赖与约束

- 依赖 t401 的 `resumeCommandTemplates` 字段与 schema（否则保存被 strip，回显丢失）。
- 与 t403 相互独立，可并行。

### Finalization 时更新的 blueprint

- 无
