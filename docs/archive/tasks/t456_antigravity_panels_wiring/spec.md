# Task spec

## 背景

t455 提取器与定位器就绪后，会话面板展示侧需要 antigravity 接线。对标 t447 的会话部分；代理面板不在范围，不动 `AgentFilter`。

## 契约区

### 范围

- `session-history/markdown.ts`：`AGENT_FRIENDLY` 加 antigravity 展示名。
- `workspace/slots.ts`：`vendor_id_for_source` 加 antigravity 分支（logo 已有）。
- `session-resume.ts`：`DEFAULT_RESUME_COMMAND_TEMPLATES` 加 `antigravity: "agy --conversation {session_id}"`（s035 内 `agy --help` 已验证）；`general_section.tsx` 标题随类型自动带出。
- 依赖 t455 合入后才可验证端到端。

### 非范围

- 代理面板一切（`AgentFilter`、`AGENT_OPTIONS`、token-stats store/query 不动）。
- 用量面板连接器。
- extractor/locator 本体改动（归 t455）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `.repo_template/docs/usage.md`「命名与格式」。

<!-- /规范 -->

- [ ] AC-001：antigravity 会话在会话面板展示，对应 vendor logo 与展示名正确。
- [ ] AC-002：antigravity 会话 resume 按钮生成 `agy --conversation {session_id}` 命令。
- [ ] AC-003：代理面板过滤选项不出现 antigravity（本次只做会话面板）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：s035（resume 命令 `agy --help` 验证）、t455（前置 extractor+locator）、t447（接线参照）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 按 t447 接线测试同构：`vendor_id_for_source` 映射单测、resume 模板单测、TokenStatsView 无 antigravity 选项断言。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：t455 未合入时端到端不可验。
- 回退：按依赖顺序执行，本 task 在 t455 后 start。

### 依赖与约束

- 依赖 t455（extractor+locator 先合入）。
- 不碰代理面板文件。

### Finalization 时更新的 blueprint

- 无
