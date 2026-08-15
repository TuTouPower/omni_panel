# Task spec

## 背景

点击 session ID 复制的续接命令目前写死在内置默认映射（`src/renderer/lib/session-resume.ts`），如 kimi 固定为 `kimi -r {session_id}`。用户希望可按来源自定义模板（如 `kimi --yolo -r {session_id}`）。本 task 只做数据与逻辑层：config 字段 + `resume_command` 支持模板替换。设置面板 UI 与调用点接线分别由 t402 / t403 承接。

## 契约区

### 范围

- `AppConfiguration`（`src/shared/types/config.ts`）新增字段 `resumeCommandTemplates?: Readonly<Partial<Record<string, string>>>`：source → 命令模板，模板内含 `{session_id}` 占位符。
- `appConfigurationSchema`（`src/main/core/config/types.ts`）新增对应字段，parse / strip 后不丢弃（对照 t379 tokenStats 教训）。
- `resume_command(source, session_id, templates?)`：新增可选第三参，命中自定义模板时用 `{session_id}` 替换后返回；无自定义（缺省 / 空串）回退内置默认；未知来源返回 null。
- 单测覆盖 schema 与模板替换逻辑。

### 非范围

- 设置面板 UI（t402）。
- 工作台 / 会话库调用点接线（t403）。
- 除 `{session_id}` 外的其它占位符（如 cwd、provider）不支持。
- 复制到剪贴板的行为本身（现有调用点逻辑，t403 范围）。

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

- [ ] AC-001：`resume_command("kimi_code", "abc", { kimi_code: "kimi --yolo -r {session_id}" })` 返回 `"kimi --yolo -r abc"`。
- [ ] AC-002：不传 `templates` 或 `templates` 无对应 source 条目时返回内置默认命令（如 `kimi_code` → `kimi -r abc`）；条目为空串视同未自定义，回退默认。
- [ ] AC-003：模板内多处 `{session_id}` 全部替换为同一 session_id。
- [ ] AC-004：未知来源（无内置默认且无自定义模板）仍返回 null。
- [ ] AC-005：`appConfigurationSchema` parse 含 `resumeCommandTemplates: { kimi_code: "kimi --yolo -r {session_id}" }` 的配置对象后，字段保留且值不变（不被 zod strip 丢弃）。
- [ ] AC-006：缺省配置（不含 `resumeCommandTemplates`）parse 结果不含该字段，旧配置兼容。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

全部 AC 可自动测试：AC-001~004 纯函数单测（vitest）；AC-005~006 schema 单测（追加至 `tests/unit/config/config-schema.test.ts`）。

## 上下文区

- 来源：用户需求（2026-08-16 确认：按来源分别设置、「常规」页新增分组）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 模板含危险字符（命令注入）：复制的命令只进剪贴板，不被执行，无注入面；不测。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 纯函数单测：fixture 为内联字符串，直接断言 `resume_command` 返回值。
- schema 单测：沿用 `config-schema.test.ts` 现有风格，`appConfigurationSchema.parse` 后断言字段保留。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

无

### 风险与回退

- 风险：schema 加字段但 UI/调用点未接（t402/t403 前置），期间用户手改配置不会被 strip（schema 已放行）。
- 回退：字段为可选，删除字段定义即恢复旧行为；无数据迁移。

### 依赖与约束

- t402、t403 依赖本 task 的字段与 `resume_command` 新签名。
- `resume_command` 第三参为可选，现有两参调用不受影响。

### Finalization 时更新的 blueprint

- `docs/blueprint/conventions.md`：如需长期约束续接命令模板占位符约定，则补充；否则无。
