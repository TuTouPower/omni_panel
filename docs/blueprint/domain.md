# OmniPanel 领域模型

术语与跨功能业务不变量的唯一真相源。技术栈/目录见 `architecture.md`；编码风格见 `conventions.md`。

## 1. 数据模型层级

数据自上而下：**连接器（定义）→ 数据源（实例）→ 厂商 → 账号 → 用量 → 用量条 → 观测（原子）**。

| 中文   | 英文        | 代码标识                                              | 定义                                | 数量关系                                                                                                                                                                                                                                                                                    |
| ------ | ----------- | ----------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 连接器 | connector   | 目录 `manifest.json` + `connector.ts`                 | 采集逻辑的声明式定义，内置只读      | 一类接入一份定义                                                                                                                                                                                                                                                                            |
| 数据源 | data source | `ConnectorConfiguration` / `instanceId`               | 用户配置的一份连接实例 = 设置页一行 | 见 §2                                                                                                                                                                                                                                                                                       |
| 厂商   | provider    | `provider`                                            | AI 服务商，UI 聚合维度              | 开放 snake*case 命名空间（`^[a-z]a-z0-9*]\*$`，t095）；内置：`claude` `codex` `antigravity` `kimi` `glm` `minimax` `deepseek` `tavily` `firecrawl` `mimo` `opencode_go` `grok` `getoneapi` `exa` `tikhub`，用户可自定义任意 snake_case provider；`cpa` 为聚合渠道，不单独作为 provider 出现 |
| 账号   | account     | `accountId` / `accountLabel`（显示名，不得含 secret） | 某厂商下一个真实账号                | 一厂商可多账号                                                                                                                                                                                                                                                                              |
| 用量   | usage       | 某 account 下全部 observation 的集合                  | 一个账号的用量数据集                | 一账号 = 一份用量                                                                                                                                                                                                                                                                           |
| 用量条 | metric      | `metricId` / `metricName`                             | 用量里的单条指标                    | 一账号多条（Claude 5小时+一周=2条）                                                                                                                                                                                                                                                         |
| 观测   | observation | `Observation`                                         | 单次采集产出的原子记录              | 最小单元                                                                                                                                                                                                                                                                                    |

**观测核心字段**：`provider` + `sourceInstanceId` + `accountId` + `metricId` + `used`/`limit` + `source` + `observedAt` + `stale`/`lastError` + `cycleDurationMs`。完整字段与 SQLite schema 见 `specs/observation-store.md`。

### 高发 bug 区

- **账号 ≠ 用量条**：`5小时`/`一周` 是同一账号下两条 metric，绝不能渲染成两个账号。UI 先按 `accountId` 聚合，再列 metric。
- **采集维度 ≠ 展示维度**：采集按 `source` 组织，展示按 `provider` 聚合，靠 `accountId` 缝合。

## 2. 数据源的两种形态

| 形态        | 英文       | 数量关系                      | UI                         |
| ----------- | ---------- | ----------------------------- | -------------------------- |
| 直连        | direct     | 1 数据源 = 1 厂商 = 1 账号    | 设置页普通一行             |
| 聚合（CPA） | aggregator | 1 数据源 = N 账号，横跨多厂商 | 设置页可展开行，子行为账号 |

- GLM 填两个密钥 = 两个独立直连数据源（两行），非一数据源多账号。
- **CPA 是当前唯一聚合数据源**：一份 `cpa_mgmt_key` 拉回 Claude×N + Codex×N + Antigravity + Kimi。

## 3. 四种采集能力（capability）

| 英文      | 中文 | 含义                             | 例                                             |
| --------- | ---- | -------------------------------- | ---------------------------------------------- |
| `poll`    | 轮询 | 按声明发 HTTP 拉官方用量 API     | Tavily、Firecrawl、DeepSeek、GLM、MiniMax、CPA |
| `local`   | 本地 | 读本地凭证/用量文件              | Claude（`~/.claude`）、Codex（`~/.codex`）     |
| `session` | 会话 | 受控网页登录，捕获 Cookie 后采集 | MiMo、OpenCode Go、Kimi                        |
| `observe` | 探测 | 发最小请求从响应头提取用量       | Brave 型（有运行时代码，无内置连接器）         |

`source` 取值：`poll` / `local` / `session` / `probe` / `wrapper` / `gateway`（CPA 走 `gateway`）。

## 3.1 Kimi 用量字段口径（t113）

`connectors/kimi/connector.ts` 解析 `/coding/v1/usages` 响应，参考实现 `vendors/KimiCodeBar/macOS/KimiCodeBar/KimiCodeBarQuotaService.swift`：

- **周用量 / 5 小时限额**：沿用既有 `usage` 与 `limits[].duration==300`。
- **加油包余额 `kimi:booster_balance`**：取自顶层 `boosterWallet`。仅当 `status`（uppercase）∈ {`STATUS_ACTIVE`, `STATUS_ENABLED`} 时 `balance.amountLeft` 为真余额；其余状态（含 `STATUS_UNKNOWN`）返回的 `amountLeft` 是「月度上限 − 月度消费」误导值，必须显示 0。`amountLeft` 单位 **1e-8 元**（`315250700 = ¥3.15`），`balance_yuan = max(0, amountLeft / 1e8)`。display_style `ratio` + limit=0（复用 t097 显示原值），不参与 warning/critical 阈值。
- **总配额 `kimi:total_quota`**：顶层 `totalQuota`，无 `used` 字段，`used = max(0, limit - remaining)`，display_style `percent`。
- **会员等级**：顶层 `user.membership.level` 装饰到 `account_label`（`Kimi（${level}）`），无 level 时回退 `Kimi`；不新增 metric。

## 3.2 TokenStats 数据源 grok（t197）

token-stats 采集管线新增第 4 个 source `grok`（枚举：`claude_code` / `opencode` / `kimi_code` / `grok`），仅 WSL（Windows 无 grok CLI 数据），与连接器 `connectors/grok`（billing 百分比）互不相干。

- **数据位置**：`~/.grok/sessions/{enc_cwd}/{session_id}/updates.jsonl`（`{enc_cwd}` 为 URL-encoded cwd；每个会话一个文件）。Windows 侧经 `\\wsl.localhost\{wsl_distro}\home\{wsl_user}\.grok\sessions\...` 读取。
- **事件口径**：`turn_completed` 事件的 `usage` 是【该 user prompt 一轮的独立总量】，跨 inference loop 累加、下一轮从零起算，**勿用相邻事件差分**（会把每轮总量误当累计快照造成巨量漏记）。`reasoningTokens ⊂ outputTokens` 不计费，output 直接映射、reasoning 不单独记账。`costUsdTicks` 不入账。
- **records agent 值约定**：kebab-case，`agent="grok"`，与 `source="grok"` 一致。
- **展示层映射**（t198）：label `"Grok"`、color `#b687f0`（紫），records 侧 `AGENT_*` 与 buckets/rollup 侧 `BUCKET_AGENT_*`/`ROLLUP_AGENT_*` 三组映射同构扩展；`AgentFilter` 含 `"grok"`；SessionTable chip class `gk`。展示层权威映射在 `src/renderer/lib/token-stats/chart-data.ts` 与 `src/renderer/views/TokenStatsView.tsx` 的 `AGENT_OPTIONS`。

## 4. 跨功能业务不变量

1. **最新观测即真值**：同一 `(provider, accountId, metricId, sourceInstanceId)` 允许多来源多观测，`observedAt` 最新者胜出。去重、"实时上报"与"兜底探测"在数据层自然融合。
2. **新鲜度必须可见**：每条带 `observedAt` + `source`；采集失败保留上次成功观测，挂 `stale:true` + `lastError`，绝不覆盖删除。脚本成功返回零有效观测（`items` 空，如上游 200 但无可用字段）同样视为采集异常：有上次成功则保留，无则标 `failed`，绝不写 `ready + 空`（t039）。首次采集即失败（无历史 observation）的直连账号须合成失败占位行（`periods:[]` + `error`），不得从用量面板消失；CPA 多账号不合成（t040）。消费方展示任何数字必须能取到 `observedAt + source`。
3. **accountId 必须稳定**：由聚合源返回的稳定账号标识（邮箱、UUID、workspace id、CPA auth_index）生成，**绝不用"实例 + 序号"**。否则远端账号顺序一变，本地隐藏设置/自定义标签/历史观测全部错位。
4. **instance identity 归宿主**：`sourceInstanceId` 由宿主盖，脚本不可伪造，防同 provider 多实例 collapse。
5. **CPA 错误归属到账号，不到渠道**：单账号失败只让那一行 stale，同 provider 其他账号照常刷新。绝不能因 Kimi 拉失败让整个 CPA 渠道挂掉、连带 Claude 不显示。仅 CPA 管理密钥失效/Manager 连不上时才整渠道 stale。
6. **聚合用总量比，不用百分比均值**：多账号 provider 概览 `整体使用率 = sum(used)/sum(limit)`，绝不对各账号百分比取平均。仅 `used/limit` 有限、`used≥0`、`limit>0` 的 metric 参与。
7. **聚合时间的收敛规则**：同周期内有效账号时间差 ≤ 10 分钟（可由 `convergentTimeMinutes` 覆盖）显示最新时间，> 阈值则不显示，绝不编造"平均时刻"。
8. **所有权决定可删除性**：CPA 账号存在性由远端 CPA-Manager 决定 → 本地**只能隐藏**（写 `accountOverrides.hidden`），不调远端删除；直连账号存在性由本地配置定义 → **可删除**（连 secret 一起清）。破坏性操作只出现在"行即数据源"层级，账号子行只做显示调整。直连删除须 tombstone 持久化（`removedConnectorIds` 记 manifest id），`auto_seed_connectors` 跳过 tombstone id，重启不复活（t038）。
9. **密钥按需暴露**：日常只拿 `hasSecret` 布尔；设置编辑时经 `config:getSecrets` 按实例拉明文回填。连接器 secret just-in-time 解密注入宿主请求；日志强制脱敏，开发期同样生效。用量面板不拉密钥。
10. **CPA 用量面板隐身**：用量面板无"CPA" provider tab，CPA 采来的账号并入对应真实 provider 卡片；CPA 只在设置页作为可展开连接呈现。

## 5. 废弃对照（落后词 → 统一词）

| 废弃                                      | 统一                                          |
| ----------------------------------------- | --------------------------------------------- |
| 插件 / plugin / PluginConfiguration       | 连接器 / connector / `ConnectorConfiguration` |
| 子账号                                    | 账号（CPA 下为展开子行）                      |
| `defaultSource: api_key/cpa/direct/oauth` | 四能力 `poll/local/session/observe`           |
| 用量项 / UsageItem                        | 用量条 / metric / `MetricRecord`              |

> 代码里仍残留 `plugin`（IPC `connector` 别名、config `plugins[]` 字段、`preload` 的 `plugin` 别名）为兼容包袱，新代码一律用统一词。

## 6. 产品边界（明确不做）

- 不做完整多维趋势图 UI（柱状/热力/区间选择仍归 TokenStats 独立窗口）；账号展开区出近 7 天 sparkline 迷你走势（T006），SQLite 历史已用于此时序聚合。
- 不做通用开放代理（LocalAPI 只白名单 ingest + health）。
- 不做系统钥匙串/safeStorage（自管 Vault，见 `specs/secret-vault.md` 威胁模型）。
- 用户自定义连接器在 `node:vm` 沙箱执行（t095 开放 `userData/connectors` 自定义脚本），`node:vm` 非真隔离，见 `architecture.md` §6 已知限制；用户自负脚本风险，文档 `guides/custom-connector.md` 标注约束。
- 界面语言切换、检查更新、问卷、赞助入口当前为占位，未落地实现。

## 会话历史消息提取（t209）

四端（claude_code/opencode/kimi_code/grok）会话历史窗口的消息正文提取，来源与裁剪规则（需求决策 2/13，spike s015、finding d017）：

- claude_code：`~/.claude/projects/<proj>/<sess>.jsonl`，每行 `{type:"user|assistant|...",message:{content},uuid,timestamp}`；只取 user/assistant 的 content 中 `type==="text"` 段，剔 thinking/tool_use/tool_result/system/summary。决策 13：只读主 transcript，不读 agent-\*.jsonl。
- opencode：`~/.local/share/opencode/opencode.db` SQLite，`message.data.role` 关联 `part.data{type:"text",text}`，过滤 tool/reasoning/step-\*/patch/compaction；时间 `part.time_created`。
- kimi_code：`~/.kimi-code/.../wire.jsonl` 的 `context.append_message.message.{role,content[type=text]}` + 顶层 `time`；`turn.prompt` 与 append_message 重复 user 输入，取 append_message 去重。
- grok：**正文在 `chat_history.jsonl`（WSL `~/.grok/sessions/<enc_cwd>/<sess>/`），非 `updates.jsonl`**（后者只 turn_completed usage 元数据）。每行 `{type:"user|assistant|system|reasoning|tool_result",content}`，**无顶层 timestamp**（按行序）。

统一模型 `HistoryMessage{id,role,text,timestamp|null}`；增量游标 byte_offset（JSONL 端）或 sqlite_rowid（opencode）。硬约束：对会话源文件全程只读；提取器对新行型一律跳过（宁可漏不可错），窗口层空态兜底。
