# OmniUsage 术语表（单一真相源）

> 本文件是项目中英文术语的唯一权威。代码、文档、UI 文案、commit、测试命名一律以此为准。
> 术语落后即更新，不保留旧词包袱。废弃词见文末「废弃对照」。

## 1. 数据模型层级

数据自上而下：**连接器（定义）→ 数据源（实例）→ 厂商 → 账号 → 用量 → 用量条 → 观测（原子）**。

| 中文   | 英文        | 代码标识                                                        | 定义                                       | 数量关系                                                                                  |
| ------ | ----------- | --------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 连接器 | connector   | `connector`（目录：`manifest.json` + 可选 `connector.ts`）      | 采集逻辑的声明式定义，内置只读，无环境权限 | 一类接入一份定义                                                                          |
| 数据源 | data source | `ConnectorConfiguration` / `instanceId`                         | 用户配置的一份连接实例，= 设置页的一行     | 见 §2                                                                                     |
| 厂商   | provider    | `provider`                                                      | AI 服务商，UI 聚合维度                     | `claude` `codex` `gemini` `glm` `minimax` `deepseek` `tavily` `mimo` `kimi` `antigravity` |
| 账号   | account     | `accountId`（稳定 ID）/ `accountLabel`（显示名，不得含 secret） | 某厂商下的一个真实账号                     | 一厂商可多账号                                                                            |
| 用量   | usage       | （某 account 下全部 observation 的集合）                        | 一个账号的用量数据集                       | **一账号 = 一份用量**                                                                     |
| 用量条 | metric      | `metricId` / `metricName`                                       | 用量里的单条指标                           | **一账号多条**（DeepSeek 余额 1 条；Gemini 8 条；Claude 5 小时 + 一周 = 2 条）            |
| 观测   | observation | `Observation`                                                   | 单次采集产出的原子记录                     | 最小单元                                                                                  |

**观测字段**：`provider` + `accountId` + `metricId` + `used`/`limit` + `source` + `observedAt` + `stale`/`lastError`。
当前值 = 同一 `(provider, accountId, metricId)` 下 `observedAt` 最新的那条（§架构 v2 §4.1）。

### 关键区分（bug 高发区）

- **账号 ≠ 用量条。** `5 小时` / `一周` 是同一账号下的两条**用量条**（metric），绝不能渲染成两个账号。UI 必须先按 `accountId` 聚合，再在账号内列出多条用量条。
- **采集维度 ≠ 展示维度。** 采集按 `source` 组织，展示按 `provider` 聚合，靠 `accountId` 缝合（§架构 v2 §5.5）。

## 2. 数据源的两种形态

| 形态 | 中文             | 英文               | 数量关系                          | UI                         |
| ---- | ---------------- | ------------------ | --------------------------------- | -------------------------- |
| 直连 | 直连数据源       | direct data source | **1 数据源 = 1 厂商 = 1 账号**    | 设置页普通一行             |
| 聚合 | 聚合数据源 / CPA | aggregator / CPA   | **1 数据源 = N 账号，横跨多厂商** | 设置页可展开行，子行为账号 |

- GLM 填两个密钥 = **两个独立直连数据源**（两行），不是一个数据源多账号。
- CPA 是当前**唯一**的聚合数据源：一份 `cpa_mgmt_key` 拉回 Claude×N + Codex×N + Gemini + Antigravity + Kimi。
- 所有权：直连账号可**删除**（存在性由本地配置定义）；CPA 账号只能**隐藏**（存在性由远端 CPA-Manager 定义）。

## 3. 采集能力（source capability）

统一用架构 v2 四能力。一个连接器可声明多种。**面向用户和代码都用这四个词**，不另造「API/中转/网页」分类。

| 英文      | 中文 | 含义                                   | 例                                          |
| --------- | ---- | -------------------------------------- | ------------------------------------------- |
| `poll`    | 轮询 | 按 manifest 声明发 HTTP 拉官方用量 API | Tavily、DeepSeek、GLM、MiniMax；CPA（多步） |
| `local`   | 本地 | 读本地凭证 / 用量文件                  | Claude（`~/.claude`）、Codex（`~/.codex`）  |
| `session` | 会话 | 受控网页持久化登录，捕获 Cookie 后采集 | MiMo、Kimi                                  |
| `observe` | 探测 | 发最小请求从响应头提取用量             | Brave 型                                    |

## 4. 废弃对照（落后词 → 统一词）

| 废弃                                              | 统一                                      | 位置                        |
| ------------------------------------------------- | ----------------------------------------- | --------------------------- |
| 插件 / plugin                                     | 连接器 / connector                        | SPEC.md、部分代码注释       |
| `PluginConfiguration`                             | `ConnectorConfiguration`                  | `shared/types/config.ts` 等 |
| `PluginScheduler`                                 | `ConnectorScheduler`                      | 已部分完成                  |
| 子账号                                            | 账号（CPA 下为展开子行）                  | UI 文案、TASKS.md           |
| `defaultSource`：`api_key`/`cpa`/`direct`/`oauth` | 四能力 `poll`/`local`/`session`/`observe` | SPEC.md §3.2、manifest      |
| 用量项 / usage item / `UsageItem`                 | 用量条 / metric / `MetricRecord`          | 不一致处统一                |

> 维护规则：发现新落后词，先更新本表，再改代码/文档。本表与 `docs/omniusage-architecture-v2.md` 数据模型章节必须一致，冲突以本表为准。
