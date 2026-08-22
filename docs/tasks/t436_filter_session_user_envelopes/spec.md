# Task spec

## 背景

会话历史把 coding agent 写进 `role=user` 的框架信封当成「用户」气泡：Grok 的 `<user_info>` / `<system-reminder>` / `<user_query>`、Claude 的 `isMeta` skill dump 与 slash XML、Kimi/OpenCode 的纯 `<system-reminder>`。决策 2 只按 record type 留 user/assistant，不拆 user 正文。`summaries` / `first_user` 以及 Claude、Kimi 用量 session 标题走同一条「首条 user 文本」路径，会被信封污染。根因与四端抽样见 p203。

## 契约区

### 范围

- 四端会话历史提取器（`claude_code` / `opencode` / `kimi_code` / `grok`）对 **user** 文本做展示归一后再产出 `HistoryMessage`：全量、增量、`extract_*_first_user`（`summaries` 吃 first_user，随其变干净）。
- Claude token-stats session 标题的「无 summary 时用首条 user 文本」与 Kimi token-stats session 标题的「首条 append_message user 文本」走同一套可保留 user 文本规则。
- 补四端 history fixture 与 reader 单测，覆盖信封丢弃、query/slash 展开、first_user、增量、既有裸文本不回归。

### 非范围

- 不改 renderer（角色标签与 Markdown 仍消费 `HistoryMessage`）。
- 不改 Grok / OpenCode token-stats 标题（Grok 用目录 basename，OpenCode 用 db `session.title`）。
- 不改 token-stats 用量计数、采集周期、store schema。
- 不改 assistant 文本路径（不套用户信封规则；既有 thinking/tool 过滤保持）。
- 不接入 Codex / Cursor。
- 不改 `session-locator` 多文件选取。
- 不写会话源文件。
- 不改 UI 布局/样式。

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

- [ ] AC-001：Grok `chat_history.jsonl` 含独立 user 行 `<user_info>`/`<git_status>`/`<rules>`/`<user_rules>`、纯 `<system-reminder>`、以及 `<user_query>` 与 `<skill_information>` 同条、再加 assistant 与后一条纯 `<user_query>` 时：`extract_grok` 只产出两条 user（分别为两段 query inner，不含任何信封标签）与一条 assistant；`extract_grok_first_user` 等于第一段 query inner。全量后再追加一条纯 reminder user 行，增量 `messages` 为空；再追加一条 `<user_query>`，增量恰为该 inner，且 id/text 与全量重提取尾部相等。
- [ ] AC-002：Claude jsonl 含 `isMeta` skill dump、`<local-command-stdout>`、整条文本为 `[Request interrupted by user]` 的 user、`<command-name>`+`<command-args>` slash、后续裸 user、assistant 时：`extract_claude_code` 不产出 isMeta / stdout / interrupted 三条；slash 那条 `role=user` 且 text 为 `/`+命令名（`command-name` 去掉前导 `/`）+（args 去首尾空白非空时）一个空格+args 原文，不含 XML 标签；裸 user 与 assistant 原文保留。`extract_claude_code_first_user` 等于展开后的 slash 文本。整条仅为 interrupted 字面量的记录丢弃后，其后独立裸 user 仍产出。增量：追加 isMeta 或 interrupted 行不产生消息；追加裸 user 与全量尾部一致。
- [ ] AC-003：Kimi wire 含裸 user、单独一条 `<system-reminder>` 的 append_message user、再一条裸 user、以及 `content.part type=text` assistant 时：`extract_kimi_code` 产出两条 user（两段裸文本）与 assistant，不产出 reminder 那条；`extract_kimi_code_first_user` 等于第一段裸 user。增量追加 reminder-only 行 `messages` 为空；追加裸 user 与全量尾部一致。旧 `append_message` role=assistant 路径仍产出 assistant（t425 不回归）。
- [ ] AC-004：OpenCode db 中同一 session 先有 user text part 为整段 `<system-reminder>Note: The user opened the file ...`、再有 user `hi`、再有 assistant text 时：`extract_opencode` 产出 user `hi` 与 assistant，不产出 reminder part；`extract_opencode_first_user` 等于 `hi`。增量插入 reminder part 不产生消息；再插入 keepable user text part 与全量尾部一致。
- [ ] AC-005：Claude token-stats 扫描：无 `type=summary` 时，首条可保留 user 文本（跳过 isMeta、local-command、interrupted 字面量、信封-only）作为 `sessions[].title`（仍受既有 120 字截断）；存在 `type=summary` 且 summary 非空时 title 仍等于 summary，不改成 user 文本。slash 作为首条可保留 user 时 title 等于 AC-002 的展开式。
- [ ] AC-006：Kimi token-stats 扫描：首条可保留 append_message user 文本作为 `sessions[].title`（跳过 reminder-only；仍受既有 120 字截断）。若全部 user 均被丢弃，title 回退既有规则（workDir basename，再无则 null）。
- [ ] AC-007：既有无信封 history fixture（claude `帮我看看这个文件`、grok `hello grok`、kimi `hello kimi`、opencode `你好`）提取出的 user/assistant 文本、角色、顺序、id 与修复前单测期望一致。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试（history 四端 extractor 单测 + claude-reader / kimi-reader 单测，fixture 驱动）。

## 上下文区

- 来源：p203（2026-08-23；本机四端真实 transcript 抽样。Grok 10 文件 58 条 user 几乎全是信封/query 包装；Claude 近 80 文件无 `<user_query>`，注入为 isMeta / command-\* / local-command / `[Request interrupted by user]`；Kimi 25 个 main wire 约 45% user 为 reminder-only；OpenCode text part 含 file-open reminder。用户确认：interrupted 字面量若整条只有它则丢掉；Claude/Kimi 用量标题纳入本 task）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 真实 `~/.grok` / `~/.claude` / `~/.kimi-code` / `opencode.db` 磁盘 e2e：fixture 已按 p203 形态固化；打开会话面板属人工验收，非本 task 门禁。
- renderer 气泡/复制/搜索：消费提取结果，无第二套解析；提取器测过即这些面一起干净。
- `subscription-service.summaries` 切片 80 字：只截 first_user，不另测截断算术。
- Grok 多段 `<user_query>` 同条：抽样均为单段；多段时按出现序换行拼接写在 AC-001，用一条 fixture 覆盖即可，不另做排列组合。
- 未知新信封标签名：只认 p203 目录；未识别标签留在 leftover（可能仍展示），不测穷尽未来 agent 格式。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- fixture：扩展 `tests/fixtures/session-history/` 下 claude_code / grok / kimi / opencode 目录，按 p203 脱敏形态写信封行；保留既有裸文本文件供 AC-007。
- token-stats：在 `claude-reader.test.ts` / `kimi-reader.test.ts` 用临时 jsonl/wire，断言 `sessions[].title`。
- 断言对象：`messages[].role/text/id`、`extract_*_first_user` 返回值、增量 `toEqual` 全量尾部、reader `title`。
- 不 mock 提取器/reader 内部；直接读临时文件或 fixture。
- 旧测试原样保留或整体删除并写理由；禁止把旧期望改成未过滤信封的当前输出。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无。信封形态已由 p203 本机真实文件核实；实施 Step 1 可用 `.scratch/task_bug_session_msg_roles/sample_extract.py` 再扫一轮补标签进 fixture，不阻断 start。

### 风险与回退

- 风险：归一过宽会吞真用户话（用户正文碰巧包在未登记标签里）；过窄则信封仍进气泡。Grok 合法消息 id 按「保留条数」计数，过滤后同一物理行的 `grok:N` 会相对修复前左移，已打开栏若按旧 id 去重可能短暂重画（刷新后稳定）。Claude isMeta 整条丢弃，若未来 isMeta 夹带真用户话也会丢（当前抽样仅 skill dump / caveat）。
- 回退：还原四端 extractor、`claude-reader` / `kimi-reader` 标题路径与 fixture/测试；会话历史回退为 user 原文。

### 依赖与约束

- 决策 2 仍成立：tool/system/thinking/reasoning 按 record type 剔除；本 task 在此之上对 **user 文本** 做信封归一。
- 硬约束：源文件只读。
- 可保留 user 文本规则（实施共用，四端 history + Claude/Kimi 标题）：
    1. Claude `isMeta === true` 的记录整条丢弃。
    2. 含 `<user_query>`：展示文本为各闭合 inner 按出现序、每段 trim 后以换行拼接；标签外信封丢弃。
    3. 含 `<command-name>`：展示 `/` + 名称（去掉前导 `/`）；`command-args` 去首尾空白非空则再拼一个空格 + args 原文。
    4. 去掉已知信封块之后 leftover trim 为空，或 leftover trim 等于 `[Request interrupted by user]`：丢弃该条。
    5. 其余 leftover 作为 user 文本保留（裸提问）。
- 已知信封（p203）：`system-reminder`、`user_info`、`git_status`、`rules`、`user_rules`、`user_rule`、`always_applied_workspace_rules`、`always_applied_workspace_rule`、`skill_information`、`skills_referenced`、`attached_files`、`file_contents`、`local-command-caveat`、`local-command-stdout`、`command-name`、`command-message`、`command-args`、`user_query`。
- id：Claude uuid / Kimi 字节 offset / OpenCode part id 对保留行不变；Grok `grok:N` 只对保留消息计数（与现有「合法消息才 +1」一致，过滤后集合变小）。
- 无其它 task 依赖。

### Finalization 时更新的 blueprint

- `docs/blueprint/domain.md`「会话历史消息提取」：补 user 文本信封归一（query inner / 丢 reminder 与 isMeta / slash 展开）；Claude/Kimi 用量标题同源规则。
- `docs/specs/session-history-window.md` 决策 2：澄清「user 文本」= 归一后的用户话，不含框架信封。
- `docs/specs/kimi-session-history-extractor.md`：reminder-only append_message 不产出消息。
- `docs/findings/d017_transcript.md`：补各端 user 信封形态与展示规则。
- `docs/specs_index.md`：上述 spec 行追加 t436。
