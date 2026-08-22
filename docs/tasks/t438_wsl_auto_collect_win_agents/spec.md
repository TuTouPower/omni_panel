# Task spec

## 背景

p204：用户在 Windows 跑 Kimi，在 WSL OmniPanel 网页搜「黑沙皇」为空——会话未入库。t437 将 env 改为 `win|wsl|linux|mac`。本 task 在 **WSL/Linux 宿主**上自动发现 Windows 用户目录，把 Windows 侧 agent 数据采成 `env=win`（零手填路径），与 Windows 宿主已能采 `env=wsl` 对称。

## 契约区

### 范围

- 当应用跑在 WSL（或 linux 宿主且能发现 Windows 用户 home）时，自动调度 `env=win` 的 claude_code / opencode / kimi_code / grok 采集（path 指向该 Windows home 下标准目录）。
- **默认零配置**；自动发现失败则 win 源 unavailable，不崩溃（linux/mac local 侧照常）。
- `session-locator`：对 `env=win` 能 resolve 到 Windows 路径上的会话文件。
- 入库后：元信息搜索与「包含消息内容」对 Windows kimi 会话可命中（p204 场景）。
- 会话库搜索 UI：未勾选「包含消息内容」时说明搜标题/目录/id。

### 非范围

- 不重做 t437 的枚举迁移（须已完成）。
- 不要求用户填路径作为主路径；可选覆盖仅作探测失败逃生舱。
- 不改信封归一（t436）。

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

- [ ] AC-001：模拟 host=linux 且 Windows home 可发现时，采集后存在 `source=kimi_code` 且 `env=win` 的会话，id 等于放在该 Windows home `.kimi-code` 下的 fixture session。
- [ ] AC-002：对 AC-001 会话，`query_sessions({ search: "黑沙皇" })` 命中（title 含该词的 fixture）。
- [ ] AC-003：正文含「黑沙皇」、title/directory/id 均不含时，`searchContent(keyword="黑沙皇")` 仍命中该 `kimi_code|win|<id>`（证明内容支路）。
- [ ] AC-004：同时存在 POSIX home（`env=linux`）与 Windows home（`env=win`）的 kimi 会话时两者并存、互不覆盖。
- [ ] AC-005：无法发现 Windows home 时，win 源不调度或 status=unavailable，进程不崩；`env=linux`/`mac` 采集不受影响。
- [ ] AC-006：claude_code / opencode / grok 在可发现 Windows home 时 paths 对 `env=win` 非 null，且 collector 源清单含对应 win 源。
- [ ] AC-007：会话库未勾选「包含消息内容」时，界面有文案说明搜索范围为标题、目录与会话 id。
- [ ] AC-008：`[deploy]` 本机 WSL + 网页：刷新后搜「黑沙皇」能列出 `session_e36b69aa-2e48-4d19-8494-9ed890da3612`（或仍存在的等价 Windows kimi 会话）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001～007：可自动测试。
- AC-008：`[deploy]`。

## 上下文区

- 来源：p204；依赖 t437；用户要求 Win/WSL 对称、禁止默认手填路径（2026-08-23）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 企业定制 Windows 用户目录：探测失败走 AC-005。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 注入 Windows home 探测结果 + 临时目录树；禁止单测硬依赖真实 `/mnt/c`。
- 断言 upsert.env、`query_sessions`、`searchContent` hits、sources_status。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- WSL 下 Windows 用户 home 自动发现顺序：`UNVERIFIED-SPIKE`（Step 1 本机实测；可复用/延伸 t437 探测结论）。

### 风险与回退

- 风险：误采错误 Windows 用户；内容搜索候选变多变慢。
- 回退：关闭 win 源自动发现。

### 依赖与约束

- `depends_on: t437`（env 枚举与迁移已完成）。
- 主键 `(id, source, env)`；Windows 数据必须 `env=win`。

### Finalization 时更新的 blueprint

- domain/architecture：WSL 宿主 ↔ Windows 对称采集表。
- decisions：零配置自动发现。
- specs_index：挂 t438；p204 归档于收尾。
