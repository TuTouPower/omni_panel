# Task spec

## 背景

会话历史面板（session-history）只有 claude_code / opencode / kimi_code / grok / codex / antigravity 六端，Command Code 未接入：`HistorySource` 联合、locator 路径解析、extractor、subscription-service 四处 switch 均无 commandcode（`src/main/core/session-history/session-locator.ts:110-121,309-321,627-638`、`subscription-service.ts:64,406-495`）。s037 采样（`~/.commandcode/projects/<encoded-cwd>/<session-id>.jsonl`）记录正文在 `message.content[]` 的 `text` 块（user/assistant），需过滤 assistant 的 `thinking`/`tool_use` 与 user 的 `tool_result`（`message.meta.source=="tool"`），时间戳取 message 顶层 ISO8601，恢复命令 `cmd --resume <session-id>`。

本仓核实（2026-09-14）：既有 codex extractor（`codex-extractor.ts`）已实现半行容错、增量游标与 `valid_count` 延续 id 命名空间；本 task 对齐该形态。现有 resume 实现为 renderer 端 `SESSION_RESUME` 模板 + `SessionPane.tsx:119-130` 用 `navigator.clipboard.writeText` 复制命令（web 非安全上下文无 clipboard 时直接 return）。用户裁定 resume 应在宿主执行且两端可用，不因 Web 禁用；同时避免扩大为任意命令执行。

公共接线归属（明确）：`HistorySource`/`ExtractorKind` 枚举、locator switch、subscription-service 四处 switch、extractor 本体、两面板 agent 展示映射与 resume 模板由\*\*本 task（t484）\*\*负责；token-stats reader/collector/store 采集侧与 `commandcode_projects_path` 由 t483 负责，本 task 复用其路径函数，不重复定义。

## 契约区

### 范围

- `HistorySource` / `ExtractorKind` 接纳 `commandcode`；locator 新增 commandcode 分支：复用 t483 的 `commandcode_projects_path`，在 `~/.commandcode/projects/<encoded-cwd>/` 下按文件名 `<session_id>.jsonl` 匹配。
- 新增 commandcode 提取器：全量提取、增量提取、首条 user 文本提取、末条 user 文本提取；`HistoryMessage.timestamp` 取 message 顶层 ISO8601。
- 过滤规则：只取 `type=="message"` 且 `message.content[]` 的 `text` 块；user 需 `message.meta.source=="user"`（真人），剔除 `source=="tool"` 的 tool_result；assistant 剔除 `thinking`/`tool_use` 块；未知 content block 类型跳过。
- subscription-service 全量/增量/first_user/last_user 四处 switch 接 commandcode 分支，覆盖**生产订阅路径**（`subscribe`/`on_update` watcher → 增量推送，不只单测直接调 extractor）。
- 两面板接线：代理面板 AgentFilter 下拉与展示名、dashboard agent 标签/色/图例、会话历史展示名/abbrev/vendor logo/accent、resume 命令模板（`cmd --resume {session_id}`）与设置页标题。
- 补 panels-wiring 型接线测试。
- **resume 宿主执行**：续接命令由固定 source→模板 + `session_id` 生成（不接受任意命令输入），由宿主执行（或宿主负责复制），桌面与 Web 两端均可用；不因 Web 禁用。
- 两端均可打开订阅查询：web 经 LocalAPI（`/v1/sessionHistory/subscribe` 等）与桌面 IPC 都能订阅并收到 `messagesUpdated`。
- **边界行为契约**（按既有实现调查后明确，本 task 落实并测试）：
    - 半行/多字节截断：增量游标落在 JSON 行中间或多字节 UTF-8 字符中间时，回退到行边界重读，不把半个字符/半行当消息；尾部未完成半行停留行首，下次续读不丢。
    - 非法 JSON 行：跳过不报错，不影响后续行。
    - 未知 content block：按「跳过未知类型」处理，不整条丢弃。
    - 截断替换恢复：文件被截断或重写（`stat.size < cursor.offset` 或 mtime/size 变化）时，回退全量重提取而非续读错位。
    - 畸形 timestamp：非 ISO/不可解析的时间戳行按既有 extractor 策略（跳过该条或置默认）处理，策略须与 codex 等既有实现一致并在测试断言。

### 非范围

- 不做用量采集（归 t483）。
- 不做 Windows/WSL 路径——本批仅本机 `linux`/`mac`（用户 2026-09-14 决定）。
- 不消费 `.meta.json` title / `.checkpoints.jsonl` / `history.jsonl`（标题首屏可空，留后续优化）。
- 不把 resume 扩大为任意命令执行（仅模板 + session_id）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：给定含 user/assistant text + thinking/tool_use/tool_result 干扰块的 commandcode fixture，全量提取只返回 user 与 assistant 文本消息（顺序与 fixture 行序一致），timestamp 全部非空。
- [ ] AC-002：同一 fixture 追加新 message 行后，增量提取只返回新增消息，不重返旧消息。
- [ ] AC-003：first_user / last_user 提取分别返回 fixture 首条与末条 user 文本（与全量一致）。
- [ ] AC-004：locator 以 session_id 可解析到 `~/.commandcode/projects/<encoded-cwd>/<session_id>.jsonl`；不存在的 session_id 返回未找到而非报错。
- [ ] AC-005：代理面板 agent 下拉接纳 `commandcode` 且请求以 `agent=commandcode` 过滤；dashboard 含 commandcode 标签/色，其余端数值不受影响。
- [ ] AC-006：会话历史展示名/abbrev/vendor logo/accent 对 commandcode 有独立映射（不落 fallback），resume 模板产出 `cmd --resume <sid>`。
- [ ] AC-007：生产订阅路径可观察：经 subscription-service `subscribe` 对 commandcode 文件订阅后，新增消息触发 `on_update` 推送；增量与全量结果一致。
- [ ] AC-008：半行/多字节截断、非法 JSON、未知 content block、文件截断重写、畸形 timestamp 五类边界按本 spec 契约处理，各有独立测试断言。
- [ ] AC-009：resume 命令在桌面与 Web 两端均可由宿主执行（或宿主复制），仅由固定模板 + `session_id` 生成；不接受任意命令输入，不因 Web 禁用。
- [ ] AC-010：web 与桌面均可打开 commandcode 会话的订阅查询并收到消息更新（经各自 HTTP/IPC 通路）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试（fixture 构造 commandcode JSONL，走 extractor/locator/subscription 单元断言；AC-005/006/009 走 wiring 映射层断言，面板渲染行为由现有 view 测试形态覆盖；AC-010 走 LocalAPI 集成 + IPC 单测）。
- 宿主真实打开终端执行 resume 的终端行为属 `[deploy]` 人工签收，自动化只断言「宿主被调用 + 命令字符串来自模板」。

## 上下文区

- 来源：d059（s037 采样：正文块类型、user 的 `meta.source` 区分、时间戳顶层 ISO8601、过滤规则、恢复命令 `cmd --resume`；2026-09-14）。**注：以上为历史采样记录；本 task 不访问外部迁移仓，边界行为以本仓既有 codex extractor/实现为对齐基准，不依赖外部核实。**

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 面板实际渲染像素/交互：归 view 层既有测试与人工签收，本 task 只断言映射层（friendly/slug/accent/logo/resume/筛选）。
- title 为空的首屏展示：归会话库既有空 title 处理，不另测。
- 真实终端执行 resume：`[deploy]` 人工签收。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 按项目默认（session-history extractor/locator 测试基建，对齐 `codex-extractor.test.ts` 形态）。
- fixture 来源：s037 采样形态手工精简；mock 边界为文件系统（fixture 目录），不碰真实 `~/.commandcode`。
- 边界用例：半行、多字节截断、非法 JSON、未知块、截断重写、畸形 timestamp 各一。
- 接线测试克隆 `codex_panels_wiring` 形态；subscription 覆盖真实 watcher 生产路径。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无（本机 mac/linux 的正文路径、过滤规则与恢复命令已由 s037/d059 采样记录；`cmd` 新增 content block 类型按提取器既有「跳过未知行型」原则处理，不属未知项。边界行为以本仓 codex extractor 为已核实对齐基准。）

### 风险与回退

- 风险：`meta.source` 区分漏判导致工具回填内容混入用户气泡——按 t436 normalize 路径 + 显式过滤，测试覆盖 AC-001。
- 风险：增量游标跨字节边界半行/多字节——对齐 codex extractor 的半行容忍策略，测试覆盖 AC-008。
- 风险：resume 宿主执行若放开输入会成为任意命令执行——限定模板 + `session_id`，不做任意命令输入。
- 回退：git revert。

### 依赖与约束

- 与 t483 共用路径函数（`commandcode_projects_path`）与 source/agent 枚举：本 task 依赖 t483 先实施固定该函数/枚举，建议 t483 先、本 task 后。已用 `task.py edit --conflicts-with t483` 登记冲突（同文件区域不可并行），理由：两者都触碰 `paths.ts` 与共享 source/agent 注册点；不登记为硬 `depends_on` 是因为 extractor/locator 可独立于 reader 实现与测试。
- 公共接线归属：HistorySource/ExtractorKind、locator、subscription 四处 switch、extractor、两面板展示映射与 resume 模板归本 task；reader/collector/store 归 t483（见背景）。
- 对会话源文件全程只读。

### Finalization 时更新的 blueprint

- `docs/specs/session-library.md` 或 session-history spec：commandcode 提取契约与边界行为。
- `docs/blueprint/decisions.md`：resume 宿主执行、仅模板 + session_id 不扩大为任意命令执行。
- `docs/specs_index.md`：挂 t484。
