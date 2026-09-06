# Task spec

## 背景

会话面板要接入 antigravity CLI 会话（s035 已验证数据源）。对标 t446，本 task 先做提取器与定位器；展示接线归 t456。

## 契约区

### 范围

- 新增 `antigravity-extractor.ts`：全量提取 + byte_offset 增量 + first_user，与 grok/codex 提取器同构。
- `session-locator.ts`：`HistorySource` 加 `"antigravity"`，新增 antigravity 分支（`conversation_summaries.db` 索引优先定位，缺行回退扫 `conversations/*.db` 文件名）。
- `subscription-service.ts`：`ExtractorKind` 加 `"antigravity"`，三处 switch（全量/增量/first_user）加分支。
- 数据源只做 CLI（`~/.gemini/antigravity-cli`，用户确认）。

### 非范围

- 代理面板/token-stats（无 token 来源，s035 明确不做）。
- 用量面板 antigravity 额度连接器。
- GUI `state.vscdb`。
- 展示层接线（`markdown.ts`/`slots.ts`/resume 模板归 t456）。
- tool 输出/system notice 行不进入会话消息（过滤掉）。

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

- [ ] AC-001：索引命中的会话 id 经 locator 解析到 `conversations/<id>.db`，返回 `extractor_kind` 为 antigravity 的 `ResolvedSession`。
- [ ] AC-002：全量提取含该会话用户首条文本（与 `history.jsonl` 同会话 display 一致），全部消息 `timestamp` 非空。
- [ ] AC-003：增量提取与全量同一 id 命名空间，byte_offset 游标续读不丢不重。
- [ ] AC-004：不存在的会话 id 返回 null，不抛错。
- [ ] AC-005：task tool 输出与 system notice 行被过滤，不出现在提取结果。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：s035（`docs/spikes/s035_google_antigravity_support/`，2026-09-06；结论：会话面板可接，代理面板不做）、d054（t455 Step 1 实验结论：user field19/sub2、assistant field20/sub1、tool field14/sub4 过滤、时间戳 field5/sub1/sub1）、d051/t446（codex 同构实现参照）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 索引 db 缺行回退全量扫：只测分支命中一次，不测 38 库级性能。
- macOS/Windows 数据目录形态：无环境实测，fixture 只覆盖 linux（与 codex 无 wsl 对侧同理）。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- fixture 脱敏自建：按实测结构手造最小 `conversation_summaries.db`（sqlite）、`history.jsonl` 行、steps protobuf（field 19 子消息，文本替换为假文）；不断言真实用户文本。
- 断言目标：定位命中/未命中、消息 role/文本/timestamp、增量与全量 id 一致、tool 行过滤。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- assistant 回复文本 protobuf 字段映射：已验证，结论见 d054（type15/field20/sub1 为正文，sub3 思考摘要与 sub14 base64 块过滤；验证方式：12 库 / 1608 steps wire 遍历 + 抽样实例）。
- macOS/Windows 下 CLI 数据目录形态：已验证（结论：linux 实测通过，其余平台随 paths 层 resolve 惯例，无环境实测；验证方式：本机 linux 全量结构探测，见 d054）。

### 风险与回退

- 风险：protobuf field 号随 CLI 版本漂移（d054 记录当前映射，漂移回本条修订）。

### 依赖与约束

- t456 依赖本 task（先合本 task 再接线）。
- 只读用户 `~/.gemini` 数据做 fixture 脱敏，不入库真实文本与 token 文件内容。

### Finalization 时更新的 blueprint

- 无
