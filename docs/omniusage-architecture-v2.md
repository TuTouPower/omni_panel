# OmniUsage 架构设计 v2

> 状态:方案定稿(团队开工版)
> 输入:现有 SPEC.md 的产品范围(服务商清单、多账号、CPA 聚合、本地文件源、网页登录源)
> 范围:只设计架构与数据流,不覆盖 UI 细节;UI 仅作为消费方出现
> 关键约束:**密钥采用应用自管存储,不使用系统密钥管理器**(含 Electron safeStorage,其底层即系统钥匙串),接口留好日后切换的口子

---

## 0. 定位与主线

OmniUsage 是常驻桌面进程,把多个 AI 服务商的用量/额度集中读出来、统一展示。读 SPEC 后确认:真正的架构难点是**用量数据有四种本质不同的栖息地**,现有 spec 用"每个服务商一个可执行插件子进程"统一应付,代价是安全边界弱、接入成本高。

v2 的主线不变:**用量真值在服务端(或本地凭证文件里),客户端的任务是低成本、高新鲜地读出来,并如实标注来源和时间。** 围绕这条主线,把采集统一为"四种来源能力 + 一条观测快照流"。

---

## 1. 设计原则

1. **最新观测即真值。** 同一指标允许多来源观测,`observedAt` 最新者胜出。这条原则让"实时上报"和"兜底探测"在数据层自然融合,不需要特殊调度逻辑。
2. **新鲜度必须可见。** 每条数据带 `observedAt` 和 `source`,采集失败时保留上次成功数据并明确标记 stale。监控工具最大的罪不是数据旧,而是把旧数据装成新的。
3. **能力归宿主,逻辑归声明。** 连接器(connector)没有任何环境权限——不能任意联网、不能任意读文件、默认摸不到密钥明文。所有 I/O 由宿主按 manifest 声明代办。
4. **密钥不出主进程。** 自管存储意味着加密强度有限(见 §6.2 威胁模型),因此更要靠"最小暴露"补:渲染进程只见"是否已配置",连接器脚本默认不见明文,日志强制脱敏(**取消** 现有 spec 中"开发期 raw 日志不脱敏"的例外)。
5. **探测成本自适应,且不进入业务关键路径。** 主动探测频率随额度紧张程度调整;本地转发网关永远是可选项,不是统计正确性的前提。

---

## 2. 顶层架构

```
┌────────────────────────────────────────────────────────────────┐
│                         Main Process                           │
│                                                                │
│  平台模块(危险能力全部收敛于此)                                   │
│  ┌───────────┐ ┌────────────┐ ┌────────────┐ ┌─────────────┐  │
│  │ Scheduler │ │SecretsVault│ │ SessionMgr │ │  LocalAPI   │  │
│  │ 调度/自适应│ │ 自管密钥    │ │ 登录态捕获  │ │127.0.0.1+token│ │
│  └─────┬─────┘ └─────┬──────┘ └─────┬──────┘ └──────┬──────┘  │
│        │             │              │               │         │
│  ┌─────┴─────────────┴──────────────┴───────────────┴──────┐  │
│  │              ConnectorRuntime(连接器运行时)               │  │
│  │   manifest 解析 → esbuild 编译 → 隔离沙箱执行              │  │
│  │   能力注入:ctx.http / ctx.files / ctx.params             │  │
│  │   四种来源能力:poll │ local │ session │ observe           │  │
│  └──────────────────────────┬───────────────────────────────┘  │
│                             ▼                                  │
│  ┌──────────────────────────────────────────────┐              │
│  │        SnapshotStore(SQLite,只追加观测)        │              │
│  │   observations 历史表 + latest 当前值视图       │              │
│  └──────────────────────────┬───────────────────┘              │
│                             │                                  │
│  ┌───────────┐ ┌────────────┴┐ ┌────────────┐                  │
│  │ConfigStore│ │  EventBus   │ │   Logger   │                  │
│  │ Zod+迁移  │ │ 状态广播     │ │ 强制脱敏    │                  │
│  └───────────┘ └──────┬──────┘ └────────────┘                  │
└───────────────────────┼────────────────────────────────────────┘
                        │ contextBridge(preload 白名单)
┌───────────────────────┴────────────────────────────────────────┐
│  Renderer(消费方):只读快照 DTO + 白名单命令。细节不在本文范围        │
└────────────────────────────────────────────────────────────────┘
        ▲
        │ POST /v1/ingest(本地 API,外部 producer 上报)
   SDK wrapper / 主动探测 / 可选网关
```

数据单向流动:**采集 → 观测快照 → 消费**。消费方从不直接碰服务商,也不知道数据怎么来的。

---

## 3. 进程与安全边界

| 边界             | 规则                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Renderer         | `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`;只能调 preload 白名单 API,拿不到任何密钥明文,只拿 `hasSecret` 布尔 |
| Connector 沙箱   | 无 `require`/`process`/`fs`/网络等环境权限;只有宿主注入的能力对象;能干什么完全由 manifest 声明决定                                     |
| 主进程           | 唯一持有密钥明文、文件系统、网络、浏览器会话的地方                                                                                     |
| LocalAPI         | 仅 `127.0.0.1`,Bearer token 鉴权,上游域名白名单,绝不做通用开放代理                                                                     |
| 内置连接器完整性 | 打包产物对 `resources/connectors` 做 SHA-256 清单校验,不匹配则跳过(沿用现有 spec 做法)                                                 |

---

## 4. 统一观测快照(数据模型,产品的脊柱)

所有采集路径输出同一种东西——**观测(observation)**。字段对齐现有 spec 的 items schema,补上多来源所需的维度:

| 字段               | 说明                                                           |
| ------------------ | -------------------------------------------------------------- |
| `provider`         | 归属服务商,UI 按它聚合(如 `claude` / `brave_search`)           |
| `sourceInstanceId` | 连接器实例 ID(对应一份配置)                                    |
| `accountId`        | 账号稳定 ID(多账号场景,如 CPA 下的多个 Claude 账号)            |
| `accountLabel`     | 账号显示名,**不得含 secret**                                   |
| `metricId`         | 指标唯一标识(连接器名+指标名)                                  |
| `name`             | 指标显示名                                                     |
| `window`           | 计量窗口:`second` / `day` / `month` / `total` 等               |
| `used` / `limit`   | 用量与上限;`used` 可为 null(从未使用)                          |
| `displayStyle`     | `percent` / `ratio`                                            |
| `resetAt`          | 窗口重置时间,可为 null                                         |
| `status`           | `normal` / `warning` / `critical` / `unknown`                  |
| `observedAt`       | **观测时刻**(新鲜度来源,宿主盖章,不信任脚本自报)               |
| `source`           | `poll` / `local` / `session` / `wrapper` / `probe` / `gateway` |

### 4.1 核心语义

- 同一 `(provider, accountId, metricId)` 允许多条不同 `source` 的观测;**当前值 = `observedAt` 最新的那条**。
- 采集失败:不覆盖、不删除,latest 视图保留最近成功观测,挂上 `stale: true` 和 `lastError`。等价于现有 spec 的 stale data 策略,但语义收进数据层而不是缓存层。
- 消费方展示任何数字都必须能取到 `observedAt + source`。

### 4.2 存储:SQLite 取代 states/\*.json

- `observations` 只追加历史表 + `latest` 物化视图(或同构表,采集时 upsert)。
- 理由:多来源新鲜度比较是天然的查询问题;历史留存为趋势图留口子(第一版不做趋势 UI,但留数据);WAL 模式单文件零运维;事务保证崩溃一致性。JSON 状态文件在"多来源、多账号、带历史"下会迅速变成手写数据库。
- 配置仍是 `config.json`(见 §8),不进 SQLite——配置要可读可手改可导出,数据要可查询,两者诉求不同。

---

## 5. 采集层

### 5.1 四种来源能力

对照 SPEC 的真实服务商清单,采集场景收敛为四类能力(一个连接器可声明多种):

| 能力      | 数据在哪                     | 宿主代办的 I/O                            | SPEC 中的代表                            |
| --------- | ---------------------------- | ----------------------------------------- | ---------------------------------------- |
| `poll`    | 服务商官方用量 API           | 按声明发 HTTP                             | Tavily、DeepSeek、GLM、MiniMax;CPA(多步) |
| `local`   | 本机文件                     | 按声明的路径模式读文件                    | Claude(`~/.claude`)、Codex(`~/.codex`)   |
| `session` | 网页后台登录态背后的内部接口 | 受控登录窗口 + 凭据捕获 + 附加凭据发 HTTP | MiMo;Brave dashboard(候选)               |
| `observe` | 真实业务请求的响应头         | LocalAPI 收上报 + 按声明探测              | Brave Search(`X-RateLimit-*`)            |

### 5.2 连接器模型:manifest + 可选脚本

**放弃"插件 = 可执行子进程"。** 连接器是一个目录:`manifest.json`(必有)+ `connector.ts`(可选)。

**Tier 1:纯声明(零代码)。** 简单轮询型服务商只写 manifest:

```json
{
    "id": "tavily",
    "provider": "tavily",
    "capabilities": ["poll"],
    "parameters": [
        { "name": "api_key", "type": "secret", "required": true, "label@zh-Hans": "API Key" }
    ],
    "endpoints": { "default": "https://api.tavily.com" },
    "poll": {
        "request": {
            "endpoint": "default",
            "path": "/usage",
            "auth": { "type": "bearer", "secret": "api_key" }
        },
        "map": { "used": "$.usage.month", "limit": "$.plan.limit", "window": "month" }
    }
}
```

好处:审计零成本、贡献门槛极低、可热更新(服务商改字段名,推 manifest 即修,不发版)。SPEC 里 DeepSeek/GLM/MiniMax/Tavily 全部落在这一层。

> manifest 用独立 JSON 文件,**不再用"脚本头部 80 行注释块"承载元数据**——注释块解析脆、没有 schema 校验、和代码耦合。多语言 key(`label@zh-Hans`)、`endpoints`、`supportedProviders`、参数类型等沿用现有 spec 的定义,原样搬进 manifest schema。

**Tier 2:沙箱脚本(能力注入)。** 响应需要编排或解析逻辑时(CPA 多账号多步、Antigravity 三 URL 回退、Gemini 两步请求、解析 `~/.claude` 文件格式),manifest 声明 `script: "connector.ts"`。脚本经 esbuild 编译(按源码 SHA-256 缓存,沿用现有机制),在**隔离沙箱**中执行:

- 沙箱里**没有** `require`、`process`、`fs`、`fetch`、定时器等任何环境能力。
- 一切 I/O 通过注入的能力对象,而能力对象严格受 manifest 声明约束:
    - `ctx.http.getJson / postJson(endpointKey, path, opts)` — 只能用声明过的 endpoint key;实际请求由宿主发出(走代理、走 endpoint override);**鉴权由宿主按 manifest 的 auth 模板注入,密钥明文默认不进沙箱**。
    - `ctx.files.read(pathPattern)` — 只能读 manifest `local.paths` 声明的路径模式(如 `~/.claude/**`);宿主读取后把内容递进来。
    - `ctx.params` — 非 secret 参数 + 语言等环境信息。
- 脚本返回 `observations[]` 或结构化错误;宿主做 Zod 校验、盖 `observedAt` 章、写库。
- 超时 15 秒,同实例串行,失败退避重试(沿用现有调度参数)。

**secret 例外口子:** 个别服务商需要对密钥做客户端运算(如 HMAC 签名)时,参数可声明 `"exposeToScript": true`,显式、可审计地把该明文递进沙箱。默认一律 false。

这一层取代了现有 spec 中 `spawn(process.execPath, ELECTRON_RUN_AS_NODE)` 的子进程模型。子进程模型里插件拥有完整 Node 权限(任意网络、任意文件、能读到 stdin 里的明文 secret),安全章节再多静态扫描也只是事后补救;能力注入模型把权限收敛在源头。

### 5.3 被动观测管道(Brave 型服务商)

`observe` 能力对应三种 producer,**全部汇入 LocalAPI 的 `POST /v1/ingest`**,在数据层无差别:

1. **SDK wrapper(主力)**:用户把真实业务调用包一层,每次调用后顺手上报响应头。零额度成本、实时新鲜,用户调用越多数据越新。随产品提供 Python/Node 十行示例。
2. **主动探测(兜底)**:零真实流量时,按 manifest `observe.probe` 声明发最小请求(如 `count=1`)读响应头。定位是"给一个不离谱的兜底",不是实时。频率由 Scheduler 自适应(§6.1)。
3. **本地转发网关(可选,默认关)**:用户显式开启后,业务请求改走本地网关自动记录。它只是又一个 producer,不是正确性前提——网关挂了,数据照样有,只是新鲜度退回探测水平。

Brave 的 manifest 示意:

```json
{
    "id": "brave_search",
    "provider": "brave_search",
    "capabilities": ["observe", "session"],
    "observe": {
        "headers": [
            "X-RateLimit-Limit",
            "X-RateLimit-Remaining",
            "X-RateLimit-Reset",
            "X-RateLimit-Policy"
        ],
        "probe": {
            "endpoint": "default",
            "path": "/res/v1/web/search",
            "params": { "q": "test", "count": "1" }
        }
    }
}
```

### 5.4 SPEC 场景对位检查

| SPEC 里的存量场景                         | v2 落点                                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| Tavily / DeepSeek / GLM / MiniMax         | Tier 1 纯声明 `poll`                                                                    |
| Claude / Codex 读本地文件                 | Tier 2 脚本 + `local` 能力(声明路径模式)                                                |
| MiMo 网页登录 + Cookie                    | `session` 能力:SessionManager 捕获凭据入 Vault,`ctx.http` 自动附加,脚本不见 cookie 明文 |
| CPA 聚合连接器(1 key → 5 provider 多账号) | Tier 2 脚本 + `poll`;多账号、去重、错误隔离、聚合与所有权规则单列于 §5.5                |
| 代理(`OMNI_PLUGIN_PROXY`)                 | 宿主 NetClient 统一走 ProxyAgent,连接器无感(§6.5)                                       |
| endpoint 覆盖(`endpointOverrides`)        | 宿主解析优先级:用户 override > manifest 默认;连接器无感                                 |
| Brave(新增)                               | `observe` + 候选 `session`(dashboard 内部接口,接入前人工抓包验证)                       |

### 5.5 多账号聚合源(CPA 型)处理

CPA 是采集层最特殊的成员,值得单列。它的本质是:**一个 CPA 实例 = 一个采集渠道,背后挂着横跨多个 provider 的多个账号**(一份 `cpa_mgmt_key` 可能拉回 Claude × N + Gemini + Antigravity + Kimi)。普通连接器是"一实例 = 一账号 = 一 provider",CPA 把这三者彻底解耦。

整节的地基是一个区分:**采集是怎么进来的(by source) ≠ 用户想怎么看(by provider)**。绝大多数错误设计都来自混淆这两个维度。规则:**采集层按 source 组织,展示层按 provider 聚合,中间靠 `accountId` 缝合**。

#### 5.5.1 三层 ID 解耦

每条观测必须能独立回答三个问题(对应 §4 模型里的三个字段):

- `provider` — 谁家的额度?决定它落在 UI 哪个 provider 卡片下。
- `accountId` — 哪个账号?决定它是不是"同一个东西"。
- `sourceInstanceId` — 怎么采进来的?决定出错时去哪修、谁负责刷新。

**`accountId` 必须由聚合源返回的稳定账号标识(邮箱、账号 UUID 等)生成,绝不能用"实例 + 序号"**。否则 CPA 那侧账号顺序一变,本地的隐藏设置、自定义标签、历史观测全部错位。这是 CPA 接入最容易踩、且后果最隐蔽的坑。

#### 5.5.2 跨来源去重

三层 ID 解耦带来一个直接后果:同一个真实账号可能被多条渠道采到(直连配了 Claude `a@x`,CPA 里也带 Claude `a@x`)。当两条观测的 `(provider, accountId, metricId)` 相同,§4.1 的"`observedAt` 最新者胜"语义自动接管——去重、展示最新那条,卡片上标注"另有 N 个来源"。用户不该看到同一账号出现两次。这也是为什么去重发生在统一观测层、而非任何单个连接器内部。

#### 5.5.3 错误归属:account 级而非 source 级

SPEC 的"单账号失败不阻塞其他"必须落到观测粒度。CPA 脚本内部逐账号 try,产出一批观测、各自带状态。卡片状态因此分三层,**失败的归属决定显示方式**:

| 失败层级   | 触发                                                            | 表现                                                                          |
| ---------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| source 级  | CPA 管理密钥失效、CPA-Manager 连不上                            | 该渠道带来的**所有**账号进 stale,提示"CPA 数据源连接失败",引导去设置页修密钥  |
| account 级 | 单个账号采集失败(最常见)                                        | 只有那一个账号行显示红点 + 它自己的 stale 数据;同 provider 下其他账号照常刷新 |
| 来源移除   | 采集成功,但某账号已从 CPA 列表消失(用户在 CPA-Manager 那侧删号) | 该观测标记"来源已移除",保留有限历史后清理,不长期展示僵尸账号                  |

核心约束:**绝不能因为 Kimi 拉失败就让整个 CPA 渠道"挂掉"、连带 Claude 也不显示**。失败的归属是账号,不是渠道。

#### 5.5.4 聚合计算:用总量比,不用百分比均值

多账号 provider 卡片在概览粒度聚合当前可显示账号(已隐藏的自动排除)。两条算法约束:

- **整体使用率 = `sum(used) / sum(limit)`,绝不对各账号百分比取平均**。反例:账号甲用 90/100、账号乙用 10/10000,百分比平均 = 50%,而真实整体 ≈ (90+10)/(100+10000) ≈ 1%。百分比平均会给出严重误导的数字。
- **聚合时间(刷新时间、重置时间)同样不取均值**:同一周期内有效账号时间差 ≤ 10 分钟时显示最新时间,> 10 分钟则不显示该时间;投影预测颜色也不使用该周期的重置时间,退回当前用量。这是为了不编造一个不存在的"平均时刻"。
- 无有效 `used/limit` 数据的周期不显示伪造数值。

#### 5.5.5 所有权:CPA 账号只能隐藏,直连账号才能删除

按账号操作严格区分,根因是**账号存在性的所有权归属**:

- **CPA 来源账号**:菜单为"编辑 + 隐藏"。隐藏只写本地 `accountOverrides.hidden`,不调远端删除。因为该账号的存在性由远端 CPA-Manager 决定——本地"删"了它,下次采集又回来,纯属自欺。真要去掉,须去 CPA-Manager 操作。隐藏后从主面板消失、聚合排除、设置页可恢复。
- **直连账号**:菜单为"编辑 + 删除"。删除连本地连接器配置带对应 secret 一起清掉。因为它的存在性就是这份本地配置定义的。

#### 5.5.6 展示边界:CPA 在主面板隐身,设置页按连接展开

- **主面板**:没有"CPA"这个 provider tab。CPA 采来的账号各自并入对应 provider 卡片;用户看到的是鼓起来的 Claude / Gemini 卡片,而非一个"CPA"聚合箱。
- **设置页**:只有一个"已添加"列表,不分区。列表里的每个条目都是用户配置的一个连接(数据源)。一对一服务(N=1,绝大多数)就是普通一行,直接显示状态和用量;一对多服务(CPA,N>1)在行首带展开箭头,展开后露出底下的账号子行,不展开时与普通行无异。
- **设计理由**:账号不是独立导航区,而是可展开行内部的子项。对一对一服务,数据源与账号在 UI 上合二为一;对 CPA,账号是展开后的子项。三层 ID 解耦是数据层的事(§5.5.1 不变),不投射到 UI 导航结构——否则会逼 99% 不用 CPA 的用户去理解一个与其无关的区分,且内容重复。
- **操作层级**:操作就地放在行上,按层级而非按区决定。行本身就是数据源层级(一对一行、CPA 主行),菜单含删除、改名、刷新;CPA 展开后的账号子行只有隐藏、改名,无删除。也就是说,§5.5.5 的"CPA 账号只能隐藏、直连账号才能删除"规则不变,但实现方式从"靠两个区"改为"靠行的层级":破坏性操作只出现在"行即数据源"的层级,账号子行只做显示调整。

一句话:CPA 的全部设计都从"它是采集渠道、不是服务商"长出来——**主面板忘掉它**(按 provider 聚合、`accountId` 缝合、最新来源胜出)、**设置页把它作为可展开连接呈现**(连接层可删除/刷新,账号子行只能隐藏/改名)。

---

## 6. 宿主平台模块

### 6.1 Scheduler

- 每实例 `refreshIntervalSeconds`(60–3600)+ 全局覆盖 + 暂停开关,沿用现有语义。
- 生命周期:`startAll / rebuild(配置保存时) / suspend(休眠) / resume(唤醒) / shutdown`,沿用现有 Orchestrator 设计——这部分现有 spec 是对的,保留。
- 同实例串行;失败指数退避,有上限。
- 事件触发:打开面板、手动刷新,即时入队。
- **探测自适应策略(新增,只作用于 `observe.probe`)**:月度剩余 > 50% 时一天 1–2 次;剩余 < 10% 时加密到小时级;面板打开/手动刷新各算一次。用户可显式设为 关闭/低频/高频,把"探测耗额度"的取舍交还用户。若 ingest 管道近期有真实上报,探测自动让位(已有更新鲜的观测,不必花额度)。

### 6.2 SecretsVault(自管密钥,本版重点)

按决策**不使用**系统密钥管理器,也不使用 Electron safeStorage(其底层就是 Keychain/DPAPI/libsecret)。设计如下:

**存储:**

- `{userData}/secrets.vault` — 密文文件。每条 secret 以 AES-256-GCM 独立加密(随机 IV,GCM tag 校验完整性),key 格式沿用 `${instanceId}:${paramName}`。
- `{userData}/vault.key` — 32 字节随机主密钥,首次启动生成,文件权限 `0600`(Windows 上设仅当前用户 ACL)。
- 主密钥常驻主进程内存,不写日志、不进 IPC、不进崩溃转储路径上的任何序列化。

**接口(为日后切换留口子):**

```ts
interface VaultBackend {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    has(key: string): Promise<boolean>;
    listKeys(prefix?: string): Promise<string[]>;
}
```

文件后端是第一个实现;以后要上 safeStorage 或系统钥匙串,换实现不动调用方("以后再说"的口子就在这)。

**最小暴露规则(自管加密强度有限,靠这些补):**

- 渲染进程永远只拿 `hasSecret` 布尔,表单回显用占位符,不回传明文。
- 连接器刷新时,主进程 just-in-time 解密,按 manifest auth 模板注入到宿主发出的请求里;明文默认不进沙箱(§5.2),更不进 stdin/argv/env——现有 spec 的"stdin 传 secret"路径整体取消。
- **日志脱敏注册表**:每个解密出的 secret 值注册进 Logger 的 scrubber,任何日志输出前做值替换。**开发期同样生效**,删除现有 spec 中"开发期 raw debug 日志记录完整原始值(不脱敏)"的行为——那是把密钥写盘的现成漏洞。
- 导出/导入:配置可明文导出,密钥部分必须用户输入口令,scrypt 派生密钥后 AES-GCM 加密成 bundle;导入时口令解密。**不允许**导出文件里出现 vault 主密钥或 secret 明文。

**威胁模型(写进文档,对团队诚实):** 此方案防的是"配置目录被整体拷走/同步进云盘备份后泄露"——拿到 `secrets.vault` 没有 `vault.key` 读不出。它**不防**同一用户身份下的恶意进程:key 和密文在同一目录,本机恶意代码两个都能读。这是"不用系统密钥管理器"的固有代价,不靠话术掩盖;后续若要加固,优先级是 可选主口令(用户口令经 KDF 参与主密钥派生)> 切系统钥匙串后端。

### 6.3 SessionManager

把"网页登录态复用"做成平台能力(现有 MiMo 链路验证过,保留并通用化):

- 受控登录窗口由宿主打开,每个需登录的服务商一个独立持久化分区(`persist:<provider>-login`)。
- 通过 `webRequest` 捕获浏览器**实际发出**的目标接口请求头(尤其 Cookie),不从 cookie jar 猜拼。
- 捕获的凭据写入 SecretsVault(同样适用最小暴露规则)。
- 后台续期:按 `cookieRefreshHours`(0=关,6/12/24h)复用分区刷新凭据,减少重复登录;续期失败时该连接器观测标记 stale + 提示重新登录。

### 6.4 LocalAPI

- 仅监听 `127.0.0.1`,端口默认自动分配并展示给用户(可固定);Bearer token 由宿主生成、存 Vault。
- `POST /v1/ingest`:接收外部 producer 的观测上报(provider + headers + 时间),校验后入快照库,`source` 按 producer 标记。
- 可选网关:`/v1/<provider>/...` 转发到 manifest 声明的固定上游域名(白名单),自动记录响应头。默认关闭。
- 健康检查 `GET /v1/health`。
- 不支持任意上游 URL——绝不变成通用开放代理。

### 6.5 NetClient

- 宿主统一的 HTTP 出口(undici):全局代理配置(ProxyAgent)、endpoint override 解析、统一超时/重试、错误归一(`Result<T, HttpError>`,沿用现有 SDK 的返回风格)。
- 连接器和探测、网关、会话采集全部经它出网——代理与 override 因此对所有路径生效,不再靠环境变量逐进程注入。

### 6.6 Logger

- 模块化日志(scheduler / runtime / vault / session / local-api / ipc),7 天滚动,沿用现有运维习惯。
- scrubber 强制内联在写入路径上,不可绕过;`accountLabel` 等对外字段在采集校验层再查一次不含已注册 secret 值。

---

## 7. 消费层与 IPC 边界

UI 细节不在本文范围,只定边界契约:

- **快照读取**:`connector:list / connector:getState / connector:snapshot` 返回 latest 视图 DTO(含 `observedAt / source / stale / lastError`),按 provider 聚合所需的全部维度都在观测模型里(provider / accountId / metricId)。
- **命令**:`connector:refresh / refreshAll`、`config:get / save / saveSecrets / export / import / duplicate`、`auth:cookieLogin / refreshCookies`。
- **事件**:`event:stateChange`、`config:changed`(跨窗口同步,沿用现有广播 + 自身保存去重思路)、`event:themeChange`。
- 全部走 contextBridge 白名单;renderer 不可发任意 channel。现有 spec 的这条边界是对的,原样保留。

---

## 8. 配置与持久化

| 文件                          | 位置          | 内容                                                        |
| ----------------------------- | ------------- | ----------------------------------------------------------- |
| `config.json`                 | `{userData}/` | 应用配置,Zod 校验,`schemaVersion` + 迁移函数,保存防抖 500ms |
| `secrets.vault` + `vault.key` | `{userData}/` | §6.2                                                        |
| `usage.db`                    | `{userData}/` | SQLite:observations + latest                                |
| `connectors-cache/`           | `{userData}/` | esbuild 编译产物(按源码 SHA-256)                            |
| `logs/`                       | `{userData}/` | 7 天滚动                                                    |

- `AppConfiguration` 保留现有 spec 的字段集(语言、代理、刷新间隔、暂停、provider 排序、账号 hidden/disabled 覆盖、cookieRefreshHours 等),其中与 UI 呈现强相关的字段不在本文展开。
- `ConnectorConfiguration` 对应原 `PluginConfiguration`:`instanceId / enabled / connectorId / refreshIntervalSeconds / parameterValues(非 secret) / endpointOverrides`。`executablePath` 取消——连接器按 id 从内置目录/用户目录发现,路径不进配置。
- 导出/导入:配置 + 口令加密的密钥 bundle(§6.2)。

---

## 9. 技术栈选型与理由

| 选型                                                     | 理由                                                                                                                                                                                                                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Electron**                                             | `session` 能力(受控登录窗口、webRequest 捕获、持久化分区)要求可编程浏览器引擎,Tauri 的系统 WebView 给不了。为能力选,不为体积选。                                                                                                                               |
| **TypeScript + Zod**                                     | 观测 schema、manifest schema、配置 schema 三处都要运行时校验;现有 spec 已用,延续。                                                                                                                                                                             |
| **esbuild**                                              | 连接器脚本编译,快、单文件输出、SHA-256 缓存,沿用现有机制。                                                                                                                                                                                                     |
| **better-sqlite3**                                       | 同步 API 简化主进程数据层;WAL;单文件。取代 states/\*.json(理由见 §4.2)。                                                                                                                                                                                       |
| **undici**                                               | 统一 NetClient,ProxyAgent 原生支持,现有 spec 已用。                                                                                                                                                                                                            |
| **沙箱:`isolated-vm` 优先,`node:vm` + 冻结空全局为退路** | 这是 v2 唯一需要先 PoC 的技术点:isolated-vm 隔离强但是原生模块(三平台编译/Electron ABI 成本);node:vm 零依赖但隔离弱(逃逸面大),只能配合"脚本仅来自内置目录 + SHA-256 校验"作为过渡。PoC 结论决定第三方连接器开放节奏:隔离不达标就只开放 Tier 1 声明式给第三方。 |
| **不用 safeStorage / 系统钥匙串**                        | 按本次决策;以 VaultBackend 接口隔离,日后可切换。                                                                                                                                                                                                               |
| **electron-builder**                                     | 打包,沿用;内置连接器 SHA-256 完整性清单,沿用。                                                                                                                                                                                                                 |

---

## 10. 与现有 SPEC 的关键差异对照

| 现有 SPEC                                                      | v2                                                                                   | 理由                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| 插件 = Node 子进程,完整环境权限                                | 连接器 = manifest + 能力注入沙箱                                                     | 权限收敛在源头;静态扫描(Semgrep 等)从"主要防线"降级为"补充" |
| secret 经 stdin 传入插件进程                                   | 宿主按 auth 模板注入请求,明文默认不进脚本                                            | 最小暴露;自管加密强度有限,靠暴露面补                        |
| safeStorage 加密 secrets.json                                  | 自管 Vault(AES-256-GCM + 本地 keyfile),VaultBackend 可替换                           | 本次决策;威胁模型如实写明                                   |
| 开发期 raw 日志不脱敏                                          | scrubber 强制,开发期同样生效                                                         | 明文密钥写盘是现成漏洞,没有"开发期"豁免的理由               |
| metadata 用脚本头 80 行注释块                                  | 独立 manifest.json + schema 校验                                                     | 注释块脆、无校验、与代码耦合                                |
| states/\*.json 缓存,stale 逻辑在缓存层                         | SQLite 观测历史 + latest 视图,stale 是数据语义                                       | 多来源新鲜度比较是查询问题;为趋势留历史                     |
| 只有"插件查询"一种采集模式                                     | poll / local / session / observe 四种来源能力                                        | 覆盖 Brave 型"真值在响应头"的服务商;MiMo 模式通用化         |
| 无被动观测/探测概念                                            | ingest 管道 + 自适应探测 + 可选网关                                                  | 见 §5.3,本次新增需求的落点                                  |
| 端点/代理经环境变量注入子进程                                  | 宿主 NetClient 统一出网                                                              | 对所有路径(脚本/探测/网关/会话)一致生效                     |
| CPA 多账号:错误隔离/隐藏散在 UI 章节                           | 提为采集层一节(§5.5):三层 ID、跨来源去重、account 级错误、sum/sum 聚合、隐藏 vs 删除 | "CPA 是采集渠道不是服务商"是数据模型的核心判断,需单列       |
| 刷新间隔、调度生命周期、IPC 白名单、完整性校验、stale 展示语义 | **原样保留**                                                                         | 这些现有设计是对的,不为改而改                               |

---

## 11. 落地阶段(每阶段独立可交付)

1. **P1 地基**:观测模型 + SQLite + SecretsVault + Scheduler + Tier 1 声明式 `poll`,迁移 Tavily/DeepSeek/GLM/MiniMax 四个零代码连接器。验证数据模型与 Vault。
2. **P2 沙箱**:沙箱 PoC 定选型 → ConnectorRuntime + `ctx.http` / `ctx.files`,迁移 Claude/Codex(local)与 CPA(多步多账号)。这是风险最高的阶段,CPA 是沙箱能力的试金石。
3. **P3 会话**:SessionManager 通用化,迁移 MiMo;验证凭据捕获、续期、stale 降级链路。
4. **P4 观测**:LocalAPI + ingest + 自适应探测 + SDK wrapper 示例,上线 Brave;网关作为本阶段可选项,按需求反馈决定做不做。

---

## 12. 开放问题

1. 沙箱 PoC:isolated-vm 在三平台 + Electron ABI 下的构建/维护成本是否可接受?不可接受时,第三方连接器是否只开放 Tier 1?
2. `exposeToScript` 例外第一版要不要实现,还是遇到第一个需要客户端签名的服务商再加?
3. SQLite 观测历史保留时长与裁剪策略(默认 90 天?)。
4. LocalAPI 端口:固定默认值(便于用户写死)还是自动分配(避免冲突)+ UI 展示?
5. 可选主口令(用户口令参与主密钥派生)的排期——自管 Vault 的第一个加固方向。
6. 配置导入导出是否需要兼容现有 spec 的导出格式(若已有存量用户数据需要迁移)。
