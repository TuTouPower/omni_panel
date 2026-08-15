# Task spec

## 背景

续接命令默认写死在各来源（`src/renderer/lib/session-resume.ts`）。t401 为 `resume_command` 增加自定义模板替换能力与 `config.resumeCommandTemplates` 字段。本 task 让两处点击 session ID 复制命令的调用点读取 config 并传入 `resume_command`，使自定义命令生效。设置面板输入 UI 由 t402 提供。

## 契约区

### 范围

- `src/renderer/components/workspace/SessionPane.tsx`：读取 `config.resumeCommandTemplates` 传入 `resume_command`。
- `src/renderer/components/session-library/SessionCard.tsx`：同上。
- 两处复制行为（clipboard 守卫、toast 提示、未知来源 null 跳过）保持不变。
- config 访问方式由实现自选：组件内 `use_config()` 或父级下传，保持现有代码风格。

### 非范围

- `resume_command` 模板替换逻辑与 schema 字段（t401）。
- 设置面板 UI（t402）。
- 复制命令执行/续接会话本身（本 task 只影响剪贴板内容）。

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

- [ ] AC-001：配置 `resumeCommandTemplates.kimi_code = "kimi --yolo -r {session_id}"` 后，工作台会话面板点击 kimi 会话 session ID，复制到剪贴板的内容为替换后的命令（`kimi --yolo -r <session_id>`）。
- [ ] AC-002：同上配置下，会话库卡片点击 session ID，复制到剪贴板的内容为替换后的命令。
- [ ] AC-003：未配置自定义模板的来源，复制行为与现状一致（内置默认命令）。
- [ ] AC-004：clipboard 缺失 / 拒绝时静默跳过、成功时 toast「已复制」的守卫与提示保持现状。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

全部 AC 可自动测试：组件测试或 web e2e，mock `window.usageboard.config.get` 与 `navigator.clipboard.writeText`，断言剪贴板写入内容；AC-004 对缺失 `navigator.clipboard` 的守卫单独断言。

## 上下文区

- 来源：用户需求（2026-08-16 确认：按来源分别设置）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 跨窗口 config 广播后再次渲染的时序：由现有 `use_config` 广播机制保证，不重复测。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- mock `window.usageboard.config.get` 返回带 `resumeCommandTemplates` 的配置（fixture 与 `config-schema.test.ts` 形状一致）；mock `navigator.clipboard.writeText` 记录写入内容。
- 断言点击后 `writeText` 收到的字符串；未配置来源断言收到默认命令。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

无

### 风险与回退

- 风险：SessionPane / SessionCard 组件树无法就近取 config 时需改父级下传，触及渲染链路。
- 回退：不读 config 时 `resume_command` 第三参缺省，行为与现状完全一致；无数据迁移。

### 依赖与约束

- 依赖 t401 的 `resume_command` 新签名与字段。
- 与 t402 相互独立，可并行。
- 复制命令不进剪贴板之外的任何路径（无执行、无 shell）。

### Finalization 时更新的 blueprint

- 无
