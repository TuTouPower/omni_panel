# Task spec

## 背景

会话列表现有 `search` 把 title、directory、id 拼成一串做子串匹配，无法表达「标题含 A 且工作目录含 B」。会话库 UI 与 coding agent 都要用独立条件 AND。本 task 只改查询契约（store / HTTP / IPC / 正文搜索候选过滤），UI 与 skill 分给后续 task。

## 契约区

### 范围

- 会话列表查询增加可选独立 `title`、`directory`：非空时大小写不敏感子串匹配对应字段；省略或空字符串 = 该项不约束。
- 新条件与现有 `source` / `sources` / `env` / `search` / `start_at` / `end_at` / `order_by` / `direction` / `limit` / `offset` 全部 AND。
- 旧 `search`（标题/目录/id 混搜）语义不变。
- `GET /v1/sessions`、桌面会话列表请求、web `getSessions` 均可携带这两项，过滤语义相同。
- 正文搜索 `searchContent` 的 filters 同样接受 `title`、`directory`，先过滤候选再扫正文。

### 非范围

- 会话库筛栏控件（t458）。
- 桌面写入 `cli.json`（t459）。
- skill / 使用指南（t460）。
- 新增排序字段、改默认 limit、返回命中消息片段。
- 新鉴权或改 LocalAPI 绑定地址。

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

- [ ] AC-001：仅提供非空 `title=T` 时，返回会话的 title 均含 T（大小写不敏感）；title 不含 T 的会话不返回，即使其 directory 或 id 含 T。
- [ ] AC-002：仅提供非空 `directory=D` 时，返回会话的 directory 均含 D（大小写不敏感）；directory 不含 D 的不返回，即使其 title 或 id 含 D。
- [ ] AC-003：同时提供非空 `title` 与 `directory` 时，返回会话必须同时满足两条；只满足其一的不返回。
- [ ] AC-004：`title` / `directory` 与现有 `sources`、`start_at`/`end_at`、`search`、`order_by`/`direction`、`limit`/`offset` 同时提供时全部 AND 生效；排序与分页仍按现有字段工作。
- [ ] AC-005：省略 `title` 与 `directory`，或二者为空字符串时，列表结果与只使用其余过滤条件时一致；仅 `search` 的标题/目录/id 混搜仍成立。
- [ ] AC-006：正文搜索请求的候选过滤接受同样的 `title`、`directory`，语义与列表查询一致；被这两项排除的会话不因正文含 keyword 而进入命中。
- [ ] AC-007：`GET /v1/sessions`、桌面会话列表请求、web `getSessions` 均可携带 `title`、`directory`，同一组条件得到同一过滤结果。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：无（产品需求：会话库与 coding agent 共用独立标题/工作目录过滤）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 大会话表上 LIKE 的耗时：不设秒数门禁。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 真实 sqlite store：插入 title/directory/id 互不相同的会话行，断言独立过滤与 AND。
- HTTP：经 LocalAPI `GET /v1/sessions` 与 `POST /v1/sessionHistory/searchContent` 走同一过滤。
- 桌面 IPC / web `getSessions`：断言请求带上新字段且结果与 store 一致。
- `title`/`directory` 的 LIKE 特殊字符转义与现 `search` 同策略，用含 `%`/`_` 的值回归。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：新条件与旧 `search` 同时使用导致结果过窄；LIKE 注入若误拼接用户输入。
- 回退：去掉 `title`/`directory` 过滤，保留旧 `search`；用户输入必须走参数绑定，禁止拼进 SQL。

### 依赖与约束

- 无前置 task。t458 / t460 依赖本 task。
- 只读查询，不改会话源文件。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：会话库查询路径补独立 `title` / `directory` 过滤。
