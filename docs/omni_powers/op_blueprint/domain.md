<!-- omni_powers: blueprint/domain -->

# OmniUsage 领域模型

术语与跨功能业务不变量的唯一真相源。技术栈/目录见 `architecture.md`；编码风格见 `conventions.md`。

## 1. 数据模型层级

数据自上而下：**连接器（定义）→ 数据源（实例）→ 厂商 → 账号 → 用量 → 用量条 → 观测（原子）**。

| 中文   | 英文        | 代码标识                                              | 定义                                | 数量关系                                                                                                   |
| ------ | ----------- | ----------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 连接器 | connector   | 目录 `manifest.json` + `connector.ts`                 | 采集逻辑的声明式定义，内置只读      | 一类接入一份定义                                                                                           |
| 数据源 | data source | `ConnectorConfiguration` / `instanceId`               | 用户配置的一份连接实例 = 设置页一行 | 见 §2                                                                                                      |
| 厂商   | provider    | `provider`                                            | AI 服务商，UI 聚合维度              | `claude` `codex` `antigravity` `kimi` `glm` `minimax` `deepseek` `tavily` `firecrawl` `mimo` `opencode_go` |
| 账号   | account     | `accountId` / `accountLabel`（显示名，不得含 secret） | 某厂商下一个真实账号                | 一厂商可多账号                                                                                             |
| 用量   | usage       | 某 account 下全部 observation 的集合                  | 一个账号的用量数据集                | 一账号 = 一份用量                                                                                          |
| 用量条 | metric      | `metricId` / `metricName`                             | 用量里的单条指标                    | 一账号多条（Claude 5小时+一周=2条）                                                                        |
| 观测   | observation | `Observation`                                         | 单次采集产出的原子记录              | 最小单元                                                                                                   |

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

## 4. 跨功能业务不变量

1. **最新观测即真值**：同一 `(provider, accountId, metricId, sourceInstanceId)` 允许多来源多观测，`observedAt` 最新者胜出。去重、"实时上报"与"兜底探测"在数据层自然融合。
2. **新鲜度必须可见**：每条带 `observedAt` + `source`；采集失败保留上次成功观测，挂 `stale:true` + `lastError`，绝不覆盖删除。消费方展示任何数字必须能取到 `observedAt + source`。
3. **accountId 必须稳定**：由聚合源返回的稳定账号标识（邮箱、UUID、workspace id、CPA auth_index）生成，**绝不用"实例 + 序号"**。否则远端账号顺序一变，本地隐藏设置/自定义标签/历史观测全部错位。
4. **instance identity 归宿主**：`sourceInstanceId` 由宿主盖，脚本不可伪造，防同 provider 多实例 collapse。
5. **CPA 错误归属到账号，不到渠道**：单账号失败只让那一行 stale，同 provider 其他账号照常刷新。绝不能因 Kimi 拉失败让整个 CPA 渠道挂掉、连带 Claude 不显示。仅 CPA 管理密钥失效/Manager 连不上时才整渠道 stale。
6. **聚合用总量比，不用百分比均值**：多账号 provider 概览 `整体使用率 = sum(used)/sum(limit)`，绝不对各账号百分比取平均。仅 `used/limit` 有限、`used≥0`、`limit>0` 的 metric 参与。
7. **聚合时间的收敛规则**：同周期内有效账号时间差 ≤ 10 分钟（可由 `convergentTimeMinutes` 覆盖）显示最新时间，> 阈值则不显示，绝不编造"平均时刻"。
8. **所有权决定可删除性**：CPA 账号存在性由远端 CPA-Manager 决定 → 本地**只能隐藏**（写 `accountOverrides.hidden`），不调远端删除；直连账号存在性由本地配置定义 → **可删除**（连 secret 一起清）。破坏性操作只出现在"行即数据源"层级，账号子行只做显示调整。
9. **密钥按需暴露**：日常只拿 `hasSecret` 布尔；设置编辑时经 `config:getSecrets` 按实例拉明文回填。连接器 secret just-in-time 解密注入宿主请求；日志强制脱敏，开发期同样生效。主面板不拉密钥。
10. **CPA 主面板隐身**：主面板无"CPA" provider tab，CPA 采来的账号并入对应真实 provider 卡片；CPA 只在设置页作为可展开连接呈现。

## 5. 废弃对照（落后词 → 统一词）

| 废弃                                      | 统一                                          |
| ----------------------------------------- | --------------------------------------------- |
| 插件 / plugin / PluginConfiguration       | 连接器 / connector / `ConnectorConfiguration` |
| 子账号                                    | 账号（CPA 下为展开子行）                      |
| `defaultSource: api_key/cpa/direct/oauth` | 四能力 `poll/local/session/observe`           |
| 用量项 / UsageItem                        | 用量条 / metric / `MetricRecord`              |

> 代码里仍残留 `plugin`（IPC `connector` 别名、config `plugins[]` 字段、`preload` 的 `plugin` 别名）为兼容包袱，新代码一律用统一词。
