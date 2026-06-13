# V2 架构重构设计文档

> 日期：2026-06-13
> 状态：设计定稿
> 输入：`docs/omniusage-architecture-v2.md` 的完整架构方案
> 约束：clean break，无迁移脚本；isolated-vm 沙箱；完整 LocalAPI；TDD 开发

---

## 1. 总体策略

**地基优先（Bottom-up）**，内部顺序：

1. SQLite 观测模型 + 类型定义
2. SecretsVault（自管密钥）
3. Manifest schema + Connector Runtime（isolated-vm 沙箱）
4. LocalAPI（完整 ingest + 网关 + 健康检查）
5. Scheduler 改造 + SessionManager
6. IPC 边界 + UI 消费层
7. 清理旧代码（plugin 子进程、safeStorage、JSON 缓存）

每步 TDD：先写测试，再实现。

---

## 2. 数据模型

### 2.1 Observation 类型

```ts
// src/shared/types/observation.ts

interface Observation {
    provider: string; // "claude" | "brave_search" | ...
    sourceInstanceId: string; // 连接器实例 ID
    accountId: string; // 稳定账号 ID（邮箱/UUID，非序号）
    accountLabel: string; // 显示名，不含 secret
    metricId: string; // 连接器名+指标名
    name: string; // 指标显示名
    window: "second" | "day" | "month" | "total";
    used: number | null;
    limit: number | null;
    displayStyle: "percent" | "ratio";
    resetAt: number | null; // epoch ms
    status: "normal" | "warning" | "critical" | "unknown";
    observedAt: number; // epoch ms，宿主盖章
    source: "poll" | "local" | "session" | "wrapper" | "probe" | "gateway";
    stale: boolean;
    lastError: string | null;
}
```

### 2.2 SQLite Schema（`usage.db`）

```sql
CREATE TABLE observations (
    id INTEGER PRIMARY KEY,
    provider TEXT NOT NULL,
    source_instance_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    account_label TEXT NOT NULL,
    metric_id TEXT NOT NULL,
    name TEXT NOT NULL,
    window TEXT NOT NULL,
    used REAL,
    "limit" REAL,
    display_style TEXT NOT NULL,
    reset_at INTEGER,
    status TEXT NOT NULL,
    observed_at INTEGER NOT NULL,
    source TEXT NOT NULL,
    stale INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
);

CREATE UNIQUE INDEX idx_latest
    ON observations(provider, account_id, metric_id, source_instance_id);
```

- `better-sqlite3`，同步 API，WAL 模式
- 多来源存储：同一 `(provider, account_id, metric_id)` 可能被多个 `source_instance_id` 采集到，各自保留一条观测行
- **latest 语义由查询层实现**：取同一 `(provider, account_id, metric_id)` 下 `observed_at` 最新的那条作为当前值
- 采集失败不覆盖、不删除，保留最近成功观测，标记 `stale`
- `observedAt` 由宿主盖章，不信任脚本自报
- 历史裁剪：定期清理 90 天前的非 latest 观测（默认值，可配置）

### 2.3 聚合规则

- 多账号 provider 卡片：`sum(used) / sum(limit)`，不用百分比均值
- 同一 `(provider, accountId, metricId)` 多来源时，`observedAt` 最新者胜出
- 聚合时间：同一周期内有效账号时间差 ≤ 10 分钟显示最新时间，> 10 分钟不显示

---

## 3. SecretsVault（自管密钥）

### 3.1 存储

```
{userData}/
  vault.key        # 32字节随机主密钥，首次启动生成，文件权限 0600
  secrets.vault    # JSON，每条 secret 以 AES-256-GCM 独立加密
```

每条 secret 格式：`{ iv: 12字节, tag: 16字节, ciphertext: base64 }`

key 格式：`${instanceId}:${paramName}`

### 3.2 接口

```ts
interface VaultBackend {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    has(key: string): Promise<boolean>;
    listKeys(prefix?: string): Promise<string[]>;
}
```

第一个实现是 `FileVaultBackend`，以后换 safeStorage 只需换实现，不动调用方。

### 3.3 最小暴露规则

- 渲染进程只拿 `hasSecret` 布尔，表单回显用占位符
- 连接器刷新时，主进程 just-in-time 解密，明文默认不进沙箱
- 日志 scrubber：每个解密的 secret 注册进 Logger，开发期同样生效
- 删除 `runner.ts:10-12` 的 `should_log_raw_debug()` 豁免
- 导出/导入：配置明文导出，密钥部分用户输入口令，scrypt + AES-GCM 加密

### 3.4 威胁模型

> 防的是"配置目录被整体拷走/同步进云盘备份后泄露"。不防同一用户身份下的恶意进程：key 和密文在同一目录，本机恶意代码两个都能读。后续加固方向：可选主口令（用户口令经 KDF 参与主密钥派生）。

---

## 4. Manifest Schema + Connector Runtime

### 4.1 Manifest（`manifest.json`）

取代现有 `metadata-parser.ts` 的 80 行注释块解析。Zod schema 校验，不合法的连接器直接跳过。

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

### 4.2 能力类型

| 能力      | 数据在哪           | 宿主代办的 I/O                            |
| --------- | ------------------ | ----------------------------------------- |
| `poll`    | 服务商官方用量 API | 按声明发 HTTP                             |
| `local`   | 本机文件           | 按声明路径模式读文件                      |
| `session` | 网页后台登录态     | 受控登录窗口 + 凭据捕获 + 附加凭据发 HTTP |
| `observe` | 响应头             | LocalAPI 收上报 + 按声明探测              |

### 4.3 Connector Runtime（isolated-vm 沙箱）

```ts
interface ConnectorContext {
    http: {
        getJson(endpointKey: string, path: string, opts?: HttpOpts): Promise<unknown>;
        postJson(
            endpointKey: string,
            path: string,
            body: unknown,
            opts?: HttpOpts,
        ): Promise<unknown>;
    };
    files: {
        read(pathPattern: string): Promise<string>;
    };
    params: Record<string, string>;
}

type ConnectorFunction = (ctx: ConnectorContext) => Promise<Observation[]>;
```

约束：

- 脚本经 esbuild 编译（SHA-256 缓存），在 isolated-vm 中执行
- 沙箱内没有 `require`、`process`、`fs`、`fetch`
- 一切 I/O 通过 `ctx` 注入，由宿主按 manifest 约束代办
- 超时 15 秒，同实例串行
- `exposeToScript` 例外口子暂不实现

### 4.4 Tier 划分

- **Tier 1**：纯声明，零代码。DeepSeek/GLM/MiniMax/Tavily 只需 manifest
- **Tier 2**：manifest + 脚本。Claude/Codex（文件解析）、CPA（多步多账号）、Antigravity（URL 回退）

### 4.5 CPA 多账号特殊处理

- `accountId` 必须由聚合源返回的稳定账号标识生成，绝不用"实例 + 序号"
- 跨来源去重：同一 `(provider, accountId, metricId)` 的多条观测，`observedAt` 最新者胜
- 错误归属到 account 级，不是 source 级：单账号失败不阻塞其他
- CPA 账号只能隐藏（写 `accountOverrides.hidden`），直连账号才能删除

---

## 5. LocalAPI

监听 `127.0.0.1`，Bearer token 鉴权，token 存 Vault。

### 5.1 端点

| 方法   | 路径              | 用途                                                                         |
| ------ | ----------------- | ---------------------------------------------------------------------------- |
| `GET`  | `/v1/health`      | 健康检查，返回 `{ status: "ok", uptime }`                                    |
| `POST` | `/v1/ingest`      | 外部 producer 上报观测，body 为 Observation 子集，Zod 校验后入 SQLite        |
| `*`    | `/v1/:provider/*` | 可选网关，转发到 manifest 声明的上游域名（白名单），自动记录响应头。默认关闭 |

### 5.2 安全约束

- 仅 `127.0.0.1`，绝不绑定 `0.0.0.0`
- Bearer token 由宿主生成，长度 32 字节 hex
- 上游域名白名单来自 manifest `endpoints`，绝不做通用开放代理
- ingest 请求体 Zod 校验，非法数据直接拒绝

### 5.3 实现

用 Node 原生 `http.createServer`，轻量级，不引新框架。

---

## 6. Scheduler + SessionManager + Logger

### 6.1 Scheduler 改造

现有 `scheduler-orchestrator.ts` 的生命周期（startAll/rebuild/suspend/resume/shutdown）保留，核心变化：

- 调度目标从"插件子进程"改为"连接器实例"
- 每实例 `refreshIntervalSeconds`（60–3600）+ 全局覆盖 + 暂停开关
- 失败指数退避，有上限（沿用）
- 新增探测自适应策略：月度剩余 > 50% 时一天 1–2 次；剩余 < 10% 时加密到小时级
- 事件触发：打开面板、手动刷新，即时入队

### 6.2 SessionManager

受控登录窗口，通用化现有 MiMo 链路：

- 每个需登录的服务商一个独立持久化分区（`persist:<provider>-login`）
- 通过 `webRequest` 捕获浏览器实际发出的请求头（尤其 Cookie）
- 捕获的凭据写入 SecretsVault
- 后台续期：按 `cookieRefreshHours`（0=关/6/12/24h）复用分区刷新

### 6.3 Logger

- 模块化日志（scheduler/runtime/vault/session/local-api/ipc）
- 7 天滚动
- scrubber 强制内联，不可绕过

---

## 7. IPC 边界 + UI 消费层

### 7.1 IPC 命令（contextBridge 白名单）

| 命令                      | 方向          | 用途                 |
| ------------------------- | ------------- | -------------------- |
| `snapshot:list`           | renderer→main | 获取 latest 视图 DTO |
| `snapshot:get`            | renderer→main | 单个观测详情         |
| `connector:refresh`       | renderer→main | 刷新单个连接器       |
| `refreshAll`              | renderer→main | 全量刷新             |
| `config:get / save`       | renderer→main | 配置读写             |
| `config:export / import`  | renderer→main | 配置导出导入         |
| `secret:save`             | renderer→main | 单向写，无读明文     |
| `session:login / refresh` | renderer→main | 触发登录/续期        |
| `probe:setPolicy`         | renderer→main | 探测频率策略         |
| `snapshot:changed`        | main→renderer | 快照更新推送         |
| `config:changed`          | main→renderer | 配置变更推送         |

### 7.2 UI 变化要点

- 每个 provider 卡片展示 `observedAt + source`，用户能看到数据新鲜度
- stale 数据用视觉标记（不是隐藏），带 `lastError` 提示
- CPA 账号在主面板按 provider 聚合，无"CPA"tab
- 设置页双视角：数据源视角（按 source 排查）+ 账号视角（按 provider 管理）
- 多账号聚合用 `sum(used)/sum(limit)`，不用百分比均值

---

## 8. 配置与持久化

| 文件                          | 位置          | 内容                                                           |
| ----------------------------- | ------------- | -------------------------------------------------------------- |
| `config.json`                 | `{userData}/` | 应用配置，Zod 校验，`schemaVersion` + 迁移函数，保存防抖 500ms |
| `secrets.vault` + `vault.key` | `{userData}/` | 自管密钥                                                       |
| `usage.db`                    | `{userData}/` | SQLite：observations + latest                                  |
| `connectors-cache/`           | `{userData}/` | esbuild 编译产物（SHA-256）                                    |
| `logs/`                       | `{userData}/` | 7 天滚动                                                       |

- `AppConfiguration` 保留现有字段集，`plugins` 改为 `connectors`
- `ConnectorConfiguration`：`instanceId / enabled / connectorId / refreshIntervalSeconds / parameterValues(非 secret) / endpointOverrides`
- `executablePath` 取消，连接器按 id 从内置目录/用户目录发现

---

## 9. 目录结构规划

```
src/
  main/
    core/
      vault/           # 新增：VaultBackend + FileVaultBackend
      observation/     # 新增：SQLite store + types
      connector/       # 新增：替代现有 plugin/，含 runtime + manifest
      local-api/       # 新增：LocalAPI server
      session/         # 新增：SessionManager
      scheduler/       # 改造：目标从 plugin 改为 connector
      cache/           # 删除：被 SQLite 替代
      plugin/          # 删除：被 connector 替代
      config/          # 改造：secrets-store → vault
    ipc/               # 改造：命令集对齐新架构
  shared/
    types/
      observation.ts   # 新增
      config.ts        # 改造
    schemas/
      manifest.ts      # 新增：manifest Zod schema
      observation.ts   # 新增：observation Zod schema
      plugin-output.ts # 删除：被 observation 替代
      plugin-metadata.ts # 删除：被 manifest 替代
  plugins/
    sdk/               # 删除：被 connector SDK 替代
  connectors/          # 新增：内置连接器目录
    tavily/
      manifest.json
    deepseek/
      manifest.json
    ...
```

---

## 10. 与现有代码的关键差异

| 现有                                    | v2                                 | 影响文件                                              |
| --------------------------------------- | ---------------------------------- | ----------------------------------------------------- |
| `runner.ts`（spawn 子进程）             | `runtime.ts`（isolated-vm 沙箱）   | `src/main/core/plugin/` → `src/main/core/connector/`  |
| `safe-storage-crypto.ts`                | `FileVaultBackend`                 | `src/main/core/config/` → `src/main/core/vault/`      |
| `cache-store.ts`（JSON）                | `observation-store.ts`（SQLite）   | `src/main/core/cache/` → `src/main/core/observation/` |
| `metadata-parser.ts`（80 行注释块）     | `manifest-loader.ts`（JSON + Zod） | `src/main/core/plugin/` → `src/main/core/connector/`  |
| `command-builder.ts`（构建 spawn 参数） | `host-io.ts`（能力注入 ctx）       | 同上                                                  |
| `output-parser.ts`（解析 stdout）       | 无（返回结构化数据）               | 删除                                                  |
| `plugin-scheduler.ts`                   | `connector-scheduler.ts`           | `src/main/core/scheduler/`                            |
| `should_log_raw_debug()`                | 删除，scrubber 强制                | `runner.ts:10-12`                                     |
| `ELECTRON_RUN_AS_NODE` 子进程           | isolated-vm 沙箱                   | `runner.ts:101`                                       |

---

## 11. 实施阶段

按地基优先顺序，每阶段独立可测试：

### P1：地基

- Observation 类型 + SQLite schema + Zod 校验
- SecretsVault（FileVaultBackend）
- 测试：Vault 加解密、SQLite 读写、observation upsert 语义

### P2：连接器 Runtime

- Manifest schema + loader
- Connector Runtime（isolated-vm 沙箱）
- Tier 1 声明式 poll 执行器
- 迁移 Tavily（最简单的 Tier 1）
- 测试：manifest 校验、沙箱隔离、HTTP 能力注入

### P3：Scheduler 改造

- 调度目标改为连接器实例
- 探测自适应策略
- 迁移 DeepSeek/GLM/MiniMax（Tier 1）
- 测试：调度生命周期、退避策略、自适应频率

### P4：LocalAPI

- `http.createServer` + Bearer token
- `/v1/health` + `/v1/ingest` + 可选网关
- SDK wrapper 示例
- 测试：token 校验、ingest 入库、网关白名单

### P5：SessionManager + Tier 2

- SessionManager（受控登录窗口 + 凭据捕获）
- Tier 2 脚本连接器：Claude（local）、CPA（poll 多账号）
- 测试：凭据捕获、续期、CPA 多账号聚合

### P6：UI 改造

- IPC 命令集对齐
- Provider 卡片展示 `observedAt + source`
- stale 视觉标记
- 设置页双视角（数据源 + 账号）
- 测试：IPC 命令、UI 渲染、stale 标记

### P7：清理

- 删除旧代码：plugin/、cache/、sdk/
- 删除 `ELECTRON_RUN_AS_NODE` 相关
- 删除 `should_log_raw_debug()`
- 验证：完整打包 smoke 测试

---

## 12. 开放问题（继承自 v2 文档）

1. isolated-vm 在三平台 + Electron ABI 下的构建/维护成本是否可接受？
2. `exposeToScript` 例外第一版暂不实现，遇到第一个需要客户端签名的服务商再加
3. SQLite 观测历史保留时长与裁剪策略（默认 90 天？）
4. LocalAPI 端口：固定默认值还是自动分配？
5. 可选主口令的排期
6. 配置导入导出兼容性（clean break 场景下不适用）
