# Task spec

## 背景

t445（codex token-stats reader）与 t446（codex session-history extractor）落地数据能力后，两面板 UI 仍不可见 codex：代理面板 `AGENT_OPTIONS` / `AgentFilter` 无 codex 选项，会话库/工作台无 codex 会话展示与续接。`Icon.tsx` 的 codex vendor logo 已就绪（235 行 + svg 资源），接线即可展示（来源 d051）。

## 契约区

### 范围

- 代理面板过滤：`AgentFilter` 与 `AGENT_OPTIONS` 新增 codex 选项（label "Codex"），选中后 dashboard/会话列表按 `agent='codex'` 过滤。
- 会话面板展示：会话库/工作台可列出并打开 codex 会话（标题取首条 user 文本、`session_index.jsonl` 的 thread_name 作回退；directory 取 cwd basename，语义对齐 t430）。
- 续接命令：session-resume 新增 `codex: "codex resume {session_id}"`。
- codex 会话行徽标走既有 codex vendor logo。

### 非范围

- 不改 t445/t446 的数据逻辑（reader/extractor 缺陷回对应 task 修）。
- 不改用量面板 codex connector。
- 不做 `session_index.jsonl` 索加速（t446 已明确不做）。

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

- [ ] AC-001：代理面板工具下拉含 "Codex" 选项；选中后 dashboard agent_totals 与会话列表仅含 codex 会话，其余四端被滤除。
- [ ] AC-002：会话库出现 codex 会话行（标题/时间/directory 非空），点击可打开消息 pane，user/assistant 正文正常渲染且不含 `<environment_context>` 原文。
- [ ] AC-003：codex 会话的续接命令为 `codex resume {session_id}`（复制/点击行为与四端一致）。
- [ ] AC-004：codex 会话行徽标展示 codex vendor logo（与用量面板 codex 卡片同 logo）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001/003/004：可自动测试（组件/单元：选项存在性、过滤参数、resume 模板、logo 映射）。
- AC-002：会话行出现与 pane 打开可自动测试（mock sessions_provider + extractor fixture）；真实 codex 数据的端到端渲染需本机 `~/.codex`，以等价 fixture 覆盖，替代验证为组件测试。

## 上下文区

- 来源：d051（s034：`codex resume {session_id}` 已实测；Icon.tsx codex logo 已就绪；2026-09-04）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 真实 `~/.codex` 端到端：以 fixture 等价覆盖，不读用户真实会话目录（见可测试性声明）。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 按项目默认（renderer 组件测试 + session-resume 单元测试基建）。
- mock 边界：sessions_provider 返回 codex 行、extractor 返回 fixture 消息；断言过滤参数/标题/directory/resume 命令/logo key。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：`AgentFilter` 联合扩充触及存量过滤逻辑——改动面限选项与透传参数，不改四端查询语义，回归由既有过滤测试覆盖。
- 回退：git revert。

### 依赖与约束

- 依赖 t445（codex 明细数据）与 t446（codex 提取器/locator）；本 task 只做展示接线，数据逻辑缺陷回对应 task。
- 单测不读真实 `~/.codex`。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：无。
