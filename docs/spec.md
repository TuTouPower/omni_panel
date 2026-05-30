# OmniUsage 项目规范

> 以下是对标项目。
> https://github.com/qixing-jk/all-api-hub
> https://github.com/juliantanx/aiusage
> https://github.com/mm7894215/TokenTracker
> https://github.com/marsmay/UsageBoard
> https://github.com/steipete/codexbar

## 对标项目以后做

## 1. 项目概述

多平台 AI 服务用量监控桌面应用（Electron），对标 macOS 原生版 UsageBoard。

**目标**：集中展示 Claude、Codex、DeepSeek、智谱 GLM、MiniMax、Tavily 等 AI 服务的用量数据。

**技术栈**：Electron + TypeScript + Vite + React + Vitest + Playwright + Zod + ESLint + Prettier

**打包**：Electron Forge（Windows / macOS / Linux）

---

## 2. 架构

```
┌─────────────────────────────────────────────────────────┐
│                    Main Process                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ ConfigStore   │  │ SecretsStore │  │ CacheStore   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │           SchedulerOrchestrator                   │  │
│  │  ┌────────────────────────────────────────────┐  │  │
│  │  │         PluginScheduler (per plugin)        │  │  │
│  │  └────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ RefreshService│  │ PluginRunner │  │ OutputParser │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────┐  ┌──────────────┐                    │
│  │ PluginIPC     │  │ ConfigIPC    │  SystemIPC / LogIPC│
│  └──────────────┘  └──────────────┘                    │
└─────────────────────┬───────────────────────────────────┘
                      │ contextBridge (preload)
┌─────────────────────┴───────────────────────────────────┐
│                   Renderer Process                       │
│  ┌──────────────┐  ┌──────────────┐                     │
│  │  PopupView    │  │ SettingsView │                     │
│  │  └ PluginCard │  │ └ SettingsForm│                    │
│  └──────────────┘  └──────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

### 2.1 安全边界

- renderer 禁止直接访问 `fs`、`child_process`、`ipcRenderer`
- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`
- preload 通过 `contextBridge` 暴露白名单 API（`window.usageboard.*`）
- secret 参数不进入日志、错误消息、测试快照
- renderer 只能调用 IPC 白名单方法，不能发任意 channel

---

## 3. 插件系统

### 3.1 插件文件

- **源文件**：TypeScript（`.ts`），UTF-8 编码，存于 `resources/plugins/`（开发）或 `process.resourcesPath/plugins/`（打包后）
- **编译产物**：`compiler.ts` 用 esbuild 将插件 + SDK 编译为单文件 JavaScript，缓存于 user data 目录（按 source SHA-256 失效）
- **执行方式**：宿主用 Electron 内置 Node 执行编译后的 JS，`spawn(process.execPath, [pluginJs, ...args], { env: { ELECTRON_RUN_AS_NODE: "1" } })`
- `_` 开头的文件名跳过（如 `_common.ts`）

### 3.2 元数据注释块

插件脚本头部用注释块声明元数据，宿主只解析前 **80 行**。

```
# UsageBoardPlugin:
# {
#   "name": "Claude",
#   "name@zh-Hans": "Claude",
#   "parameters": [
#     { "name": "api_key", "label": "API Key", "type": "secret", "required": true }
#   ]
# }
# /UsageBoardPlugin
```

**解析规则**：

- `UsageBoardPlugin:` 为开始标记（前缀匹配，忽略行首空白）
- `/UsageBoardPlugin` 为结束标记
- 每行去除 `# ` 前缀后拼接，做 JSON 解析
- 缺少标记或 JSON 无效 → 返回 `null`，不阻塞启动
- 多语言 key：`name@zh-Hans`、`label@en` 等

**参数类型**：`string` | `secret` | `integer` | `boolean` | `choice` | `directory` | `file`

### 3.3 参数传递

```
<electron-node> <plugin.js> --usageboard-param KEY1=value1 --usageboard-param KEY2=value2 --usageboard-param USAGEBOARD_LANGUAGE=zh-Hans
```

- 仅传非空参数值
- `USAGEBOARD_LANGUAGE` 由宿主注入，值为 `zh-Hans` 或 `en`
- 参数值均为字符串

### 3.4 插件 stdout 输出

**成功**：

```json
{
    "schemaVersion": 1,
    "updatedAt": "2026-05-24T12:00:00Z",
    "items": [
        {
            "id": "string",
            "name": "string",
            "used": 50.0,
            "limit": 100.0,
            "displayStyle": "percent",
            "resetAt": "2026-06-01T00:00:00Z",
            "status": "normal",
            "color": "blue"
        }
    ],
    "badge": "optional",
    "chart": { "kind": "...", "period": "...", "bucketUnit": "hour", "buckets": [...] }
}
```

**错误**：

```json
{ "error": "请在插件设置中配置 API Key" }
```

**字段说明**：

| 字段           | 类型    | 说明                                                   |
| -------------- | ------- | ------------------------------------------------------ |
| `id`           | string  | 唯一标识（推荐包含插件名+指标名）                      |
| `name`         | string  | 显示名称                                               |
| `used`         | number  | 已用量                                                 |
| `limit`        | number  | 总额度                                                 |
| `displayStyle` | string  | `percent` 或 `ratio`                                   |
| `resetAt`      | string? | 额度重置时间（ISO 8601，可为 null）                    |
| `status`       | string  | `normal` / `warning` / `critical` / `unknown`          |
| `color`        | string? | `blue` / `green` / `yellow` / `orange` / `red`（可选） |

### 3.5 执行规则

| exit code | 处理                                                       |
| --------- | ---------------------------------------------------------- |
| 0         | 解析 stdout JSON                                           |
| 非零      | 错误。优先用 stderr 内容，stderr 为空则通用 exit code 消息 |

- **timeout**：15 秒，超时后 kill 子进程，返回 failed snapshot
- **stderr**：exit 0 时仅调试用；exit 非零时作为错误消息 fallback
- 安全：参数值在日志中脱敏为 `***`

### 3.6 内置插件

| 插件     | 脚本                       | 需要 API Key | 说明                                                            |
| -------- | -------------------------- | ------------ | --------------------------------------------------------------- |
| Claude   | `claude-usage-plugin.ts`   | 否（读本地） | 读取 `~/.claude` 用量文件                                       |
| Codex    | `codex-usage-plugin.ts`    | 否（读本地） | 读取 `~/.codex` 用量文件                                        |
| DeepSeek | `deepseek-usage-plugin.ts` | 是           | 调用 DeepSeek API                                               |
| 智谱     | `glm-usage-plugin.ts`      | 是           | 调用智谱 GLM API                                                |
| MiniMax  | `minimax-usage-plugin.ts`  | 是           | 调用 MiniMax API                                                |
| Tavily   | `tavily-usage-plugin.ts`   | 是           | 调用 Tavily API                                                 |
| CPA      | `cpa-usage-plugin.ts`      | 是           | 通过 CPA-Manager 获取 Claude/Codex/Gemini/Antigravity/Kimi 额度 |

---

## 4. 配置与存储

### 4.1 文件路径

| 文件           | 位置                      | 说明                |
| -------------- | ------------------------- | ------------------- |
| `config.json`  | `{userData}/config.json`  | 应用配置            |
| `secrets.json` | `{userData}/secrets.json` | 加密密钥存储        |
| `states/`      | `{userData}/states/`      | 插件缓存状态        |
| `logs/`        | `{userData}/logs/`        | 日志文件（7天滚动） |

`{userData}` 为 `app.getPath('userData')`，即：

- Windows: `%APPDATA%/OmniUsage`
- macOS: `~/Library/Application Support/OmniUsage`
- Linux: `~/.config/OmniUsage`

### 4.2 AppConfiguration schema

```typescript
{
    schemaVersion: 1,
    language: "zh-Hans" | "en",
    overviewDisplayMode: "grouped" | "tabs",
    launchAtLogin: boolean,
    plugins: PluginConfiguration[],
    proxy?: { url: string, noProxy?: string[] }  // HTTP 代理，通过 OMNI_PLUGIN_PROXY 注入子进程
}
```

### 4.3 PluginConfiguration schema

```typescript
{
    instanceId: string,      // UUID，可选（auto-seed 自动生成）
    stateId: string,         // UUID
    name: string,            // 显示名
    enabled: boolean,
    executablePath: string,  // 插件脚本完整路径
    refreshIntervalSeconds: number,  // 60–3600 秒（1–60 分钟）
    parameterValues: Record<string, string>,
    endpointOverrides: Record<string, string>  // 覆盖插件 metadata 中的 endpoints 默认 URL
}
```

### 4.4 密钥存储

- API Key 通过 Settings 表单输入，存入 `secrets.json`（Electron safeStorage 加密）
- 存储 key 格式：`${instanceId}:${paramName}`
- 插件执行前由 `RefreshService` 从 `secretsStore` 读取并注入 `parameterValues` 副本
- `secretParamKeys` 映射：从插件 metadata 的 `parameters` 中 `type === "secret"` 构建
- config 保存时防抖 500ms，避免频繁写盘

---

## 5. 调度与刷新

### 5.1 生命周期

```
app.whenReady()
  → discoverPlugins(bundledDir) + discoverPlugins(userDir)
  → compilePlugin(...) (esbuild → cached JS per source SHA-256)
  → auto-seed: 为新发现的插件创建默认 PluginConfiguration
  → createRefreshService(...)
  → createPluginScheduler(...)
  → createSchedulerOrchestrator(...)
  → orchestrator.startAll(config)
```

### 5.2 SchedulerOrchestrator

- `startAll(config)` — 启动所有 enabled plugins 的定时调度
- `rebuild(config)` — stopAll + restart enabled（config save 时调用）
- `suspend()` — stopAll（系统休眠时）
- `resume()` — cancel safety net + reload config + restart enabled（唤醒时）
- `shutdown()` — cancel safety net + stopAll（退出时）

### 5.3 RefreshService 单次刷新流程

```
refresh(instanceId)
  → 从 configStore 查找 PluginConfiguration
  → 从 secretsStore 读取 secret 参数并注入 parameterValues 副本
  → commandBuilder(executablePath, parameterValues, language, nodePath) → 构建命令
  → resolveRuntimeEnv(metadataEndpoints, pluginConfig, appConfig) → OMNI_PLUGIN_ENDPOINTS + OMNI_PLUGIN_PROXY
  → executePlugin(command + env, timeout=15s) → spawn Node 子进程（ELECTRON_RUN_AS_NODE=1）
  → parsePluginOutputOrError(stdout)
  → 写入 runtimeStore（ready / failed）
  → 写入 cacheStore（成功时）
  → 通过 eventIpc 广播状态变更给 renderer
```

### 5.4 缓存策略

- 成功结果写入 `states/{stateId}.json`
- 下次刷新如果失败，保留上次成功的数据（stale data）
- failed 状态的 PluginCard 展示 stale 数据 + 错误信息

---

## 6. UI

### 6.1 系统托盘

- **左键点击**：toggle Popup 窗口（用量面板）
- **右键点击**：弹出上下文菜单
    - **设置**：打开 Settings 窗口（独立窗口）
    - **退出**：退出应用
- E2E 模式（`E2E=1`）跳过 Tray，自动打开 Popup

### 6.2 窗口配置

| 窗口     | 路由        | 尺寸    | frame | 特殊行为                 |
| -------- | ----------- | ------- | ----- | ------------------------ |
| Popup    | `#popup`    | 360×480 | 无    | 点击托盘时定位到图标下方 |
| Settings | `#settings` | 640×520 | 有    |                          |

### 6.3 PopupView

- 标题 "OmniUsage"
- 智能空状态：无插件 / 缺 key
- "设置"按钮 → 跳转 `#settings`
- "刷新"按钮 → 触发所有 enabled 插件刷新
- PluginCard 列表（支持多 item 进度条）

### 6.4 PluginCard

- `idle` / `loading`：显示 Skeleton 占位
- `ready`：显示插件名 + 使用量进度条 + 百分比 + 相对时间（"刚刚" / "X 分钟前"，每秒更新）
- `failed`：显示错误信息 + stale 数据（如有）+ 相对时间
- 颜色阈值：>=75% 黄色，>=90% 红色

### 6.5 SettingsView

- 侧栏：插件列表（按 displayName，同名去重加序号）
- 选中后显示参数表单（由 PluginMetadata 自动生成）
- 参数类型映射：`secret` → password input，`choice` → select，`boolean` → checkbox
- 刷新间隔输入框（number，1–60 分钟）
- 保存按钮（带 "已保存" 反馈）
- 复制按钮（duplicate）

### 6.6 路由

- 基于 `window.location.hash`：`#popup`、`#settings`
- `useRoute()` hook 监听 `hashchange` 事件

---

## 7. IPC 接口

### 7.1 plugin:list

返回 `PluginInfo[]`，每个包含：

```typescript
{
    instanceId: string,
    displayName: string,  // 去重后的显示名
    snapshot: PluginSnapshot,  // idle | loading | ready | failed
    parameters: PluginParameterMetadata[]
}
```

### 7.2 plugin:refresh

触发指定实例手动刷新。

### 7.3 config:get / config:save

- `config:get` 返回当前配置
- `config:save` 接收完整 AppConfiguration，schema 校验后写入（防抖 500ms）

### 7.4 config:saveSecrets

写入单个 secret（`{ instanceId, paramName, value }`）

### 7.5 event:stateChange

Main → Renderer 广播，当插件状态变更时推送 `instanceId + snapshot`。

### 7.6 log:level / log:entries

日志级别控制和日志读取。

---

## 8. 安全模型

| 层级     | 措施                                                         |
| -------- | ------------------------------------------------------------ |
| Electron | contextIsolation + sandbox + nodeIntegration=false           |
| IPC      | contextBridge 白名单，不允许任意 channel                     |
| 密钥     | Electron safeStorage 加密存储，不进日志/错误/测试            |
| 日志     | secret 参数值脱敏为 `***`                                    |
| Git      | secrets.json 在 .gitignore，pre-commit gitleaks 扫描         |
| SAST     | Semgrep 自定义规则（no nodeIntegration、no eval、no remote） |
| 依赖     | dependency-cruiser 禁止 renderer import Node API             |

---

## 9. 测试策略

### 9.1 分层

| 层级       | 目录                 | 框架       | 职责                                        |
| ---------- | -------------------- | ---------- | ------------------------------------------- |
| 单元测试   | `tests/unit/`        | Vitest     | 纯函数、schema 校验、parser                 |
| 集成测试   | `tests/integration/` | Vitest     | 主进程模块（config/cache/scheduler/runner） |
| 烟雾测试   | `tests/smoke/`       | Vitest     | Renderer 组件（mock IPC，jsdom）            |
| 端到端测试 | `tests/user_e2e/`    | Playwright | 真实 Electron 实例，模拟用户操作            |
| 打包 smoke | 手动                 | —          | 验证打包产物可启动、渲染正常、托盘出现      |

### 9.2 运行命令

```bash
pnpm check          # typecheck + lint + format + deadcode + arch
pnpm test           # unit + integration + smoke
pnpm test:e2e       # Playwright + Electron
pnpm package        # 打包并启动
```

### 9.3 代码质量门禁

| 工具                | 用途                           |
| ------------------- | ------------------------------ |
| TypeScript          | `strict: true` + 额外严格选项  |
| ESLint              | type-aware，`--max-warnings=0` |
| Prettier            | 格式化检查                     |
| Knip                | 未使用文件/依赖检测            |
| dependency-cruiser  | 循环依赖、层级约束             |
| Husky + lint-staged | pre-commit: lint + format      |

---

## 10. 平台差异

### 10.1 插件运行时

无外部依赖。Electron 内置 Node 即为插件运行时（`process.execPath` + `ELECTRON_RUN_AS_NODE=1`），三平台一致，用户不需要安装任何额外运行时。

### 10.2 数据目录

| 平台    | 路径                                      |
| ------- | ----------------------------------------- |
| Windows | `%APPDATA%/OmniUsage`                     |
| macOS   | `~/Library/Application Support/OmniUsage` |
| Linux   | `~/.config/OmniUsage`                     |

### 10.3 插件路径

| 环境   | 路径                             |
| ------ | -------------------------------- |
| 开发   | `<project>/resources/plugins/`   |
| 打包后 | `process.resourcesPath/plugins/` |

### 10.4 已知限制

- 系统托盘图标为占位（需替换实际图标）
- 打包格式：Electron Forge（Windows Squirrel / macOS ZIP / Linux DEB+RPM）
