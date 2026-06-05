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

**目标**：集中展示 Claude、OpenAI Codex、Gemini、Antigravity、Kimi、智谱 GLM、MiniMax、DeepSeek、Tavily 等 AI 服务的用量数据。

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
│  │  └ ProviderCard │  │ └ SettingsForm│                    │
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
    "success": true,
    "schemaVersion": 2,
    "updatedAt": "2026-05-24T12:00:00Z",
    "items": [
        {
            "id": "string",
            "provider": "claude",
            "source": "cpa",
            "sourceInstanceId": "string",
            "accountId": "string",
            "accountLabel": "string",
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
{
    "success": false,
    "error": { "code": "missing_config", "message": "请在插件设置中配置 API Key" }
}
```

**字段说明**：

| 字段               | 类型    | 说明                                                   |
| ------------------ | ------- | ------------------------------------------------------ |
| `provider`         | string  | 归属 provider，用于主 UI 聚合                          |
| `source`           | string  | 数据来源插件 / connector                               |
| `sourceInstanceId` | string  | 来源实例 ID                                            |
| `accountId`        | string  | 账号稳定 ID                                            |
| `accountLabel`     | string  | 账号显示名，不得包含 secret                            |
| `id`               | string  | 唯一标识（推荐包含插件名+指标名）                      |
| `name`             | string  | 显示名称                                               |
| `used`             | number? | 已用量；可为 null 表示从未使用，UI 渲染为空用量条      |
| `limit`            | number  | 总额度                                                 |
| `displayStyle`     | string  | `percent` 或 `ratio`                                   |
| `resetAt`          | string? | 额度重置时间（ISO 8601，可为 null）                    |
| `status`           | string  | `normal` / `warning` / `critical` / `unknown`          |
| `color`            | string? | `blue` / `green` / `yellow` / `orange` / `red`（可选） |

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

启动后日志第一行会写入实际日志文件路径：`Logging initialized: .../logs/app-YYYY-MM-DD.log`。
刷新排查优先看 `refresh-service`、`runner`、`compiler`、`ipc:*` 模块；secret-like 字段统一脱敏为 `***`。

### 4.2 AppConfiguration schema

```typescript
{
    schemaVersion: 1,
    language: "zh-Hans" | "en",
    launchAtLogin: boolean,
    plugins: PluginConfiguration[],
    proxy?: { url: string, noProxy?: string[] }  // HTTP 代理，通过 OMNI_PLUGIN_PROXY 注入子进程
}
```

旧配置中的 `overviewDisplayMode` 会在 load/save 迁移时移除。

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
- failed 状态的 provider card 展示 stale 数据 + 错误信息

---

## 6. UI

### 6.1 系统托盘

- **左键点击**：打开 / 聚焦主面板。主面板实际使用 Popup 还是 Floating Window，由窗口模式配置决定。
- **右键点击**：打开自绘托盘菜单窗口，不打开主面板。
    - 菜单项：打开主面板、立即刷新全部、暂停 / 恢复自动刷新、开机自启、设置、检查更新、退出 OmniUsage。
    - **设置**：打开或聚焦独立 Settings 窗口。
    - **退出**：退出应用。
    - 菜单窗口宽高由菜单内容决定；菜单项变多或变少时窗口尺寸跟随内容变化。
    - 不给托盘菜单设置额外固定高度，不用内部滚动条承载正常菜单内容。
    - 不复用 Popup / Floating Window 的高度策略；只有屏幕可用区域放不下完整菜单时，才做边界修正。
- E2E 模式（`E2E=1`）跳过 Tray，自动打开主面板；`E2E_WITH_TRAY=1` 时保留真实 Tray。

### 6.2 窗口配置

| 窗口     | 路由        | 尺寸                                 | frame | 特殊行为                                                                   |
| -------- | ----------- | ------------------------------------ | ----- | -------------------------------------------------------------------------- |
| Popup    | `#popup`    | 460 × (初始 480，按内容动态调整)     | 无    | 点击托盘时定位到图标下方，内容填满窗口高度，高度自动跟随内容（详见 §6.7）  |
| Settings | `#settings` | 820 × 660                            | 有    | 独立 BrowserWindow，与 Popup 互不阻塞；通过 IPC `settings:open` 打开或聚焦 |
| TrayMenu | `#tray`     | 按菜单内容测量，随菜单内容变化而变化 | 无    | 右键托盘菜单；不使用主面板高度策略，不为正常菜单内容显示滚动条             |

### 6.3 PopupView

- 主用量 UI 按 provider 展示，不按插件 / connector 展示。
- provider 页聚合来自多个 source 的同类账号数据。
- CPA 仅是聚合 connector，只出现在 Settings / 数据源配置中；主 UI 不显示 CPA provider tab。禁用的 provider 卡片在主面板不显示（仅在设置中可见）。
- CPA 采集的 Claude / Codex / Gemini / Antigravity / Kimi 账号合并到对应 provider 页面。
- 标题 "OmniUsage"
- 智能空状态：无插件 / 缺 key
- "设置"按钮 → 打开独立 Settings 窗口（`window.usageboard.settings.open()`）
- "刷新"按钮 → 触发所有 enabled 插件刷新
- ProviderCard 列表（支持多账号、多 item 进度条）

### 6.4 ProviderCard

- `idle` / `loading`：显示 Skeleton 占位
- `ready`：显示 provider 名 + 账号分组 + 使用量进度条 + 百分比/分数值 + 相对时间（"刚刚" / "X 分钟前"，每秒更新）
- `failed`：显示错误信息 + stale 数据（如有）+ 相对时间
- **用量条颜色**：按卡片内位置索引使用 8 色冷色调色板循环分配（`idx % 8`），纯色填充，不按指标类型或 warning/critical 阈值变色。
- **数值显示**：`displayStyle: "percent"` 显示百分比；`displayStyle: "ratio"` 显示 `used/limit`，reset 列留空；数字列居中对齐。
- **空用量条**：`used == null` 时进度条宽度为 0，不显示数字和 reset 时间。
- **总览页就地展开**：总览 tab 下的 ProviderCard 支持 chevron 展开/折叠，展开后显示该 provider 的账号列表，折叠/展开驱动高度自适应。
- **多账号 L2 segmented control**：多账号 provider 展开后显示 `概览` / `N账号` 切换。默认"概览"视图按额度周期独立聚合当前可显示账号：只纳入有效 `used/limit` 数据，优先用 `sum(used) / sum(limit)` 计算整体使用率；无有效数据的周期不显示伪造数值。点击"N账号"切换到账号明细视图（`.acct-detail`），显示状态点、账号名、脱敏 key、更新时间、进度条。单账号 provider 不显示 L2 控件。
- **概览时间显示**：多账号概览的采集刷新时间和额度重置时间都不取均值；同一周期内有效账号时间差不超过 10 分钟时显示最新时间，超过 10 分钟则不显示该时间。
- **卡片菜单**：编辑 / 启用或关闭 / 删除，相对卡片右上角定位，毛玻璃背景（`backdrop-filter: blur(28px) saturate(170%)`）。
- **禁用状态**：`disabled` class 灰化卡片，显示"监控已关闭，不再刷新用量" + "启用"操作。
- **账号级操作**：provider 展开后，每个账号行有独立菜单（编辑 / 隐藏或删除）。操作按来源区分：
    - **CPA 来源账号**：菜单显示"编辑"+"隐藏"。隐藏只写入本地 `accountOverrides.hidden`，不调用远端删除；隐藏后从主面板消失，可在设置页恢复。
    - **直接添加账号**：菜单显示"编辑"+"删除"。删除会移除本地插件配置及对应 secret。
    - 账号操作只影响目标账号，不影响同 provider 下其他账号。
    - 概览聚合自动排除已隐藏的账号。
    - 编辑打开设置窗口（后续可扩展为定位到具体账号）。
- **Tab 导航**：总览 tab `.pinned` + `.tabs-pin-divider` 分隔线 + `.tabs-fade.right` 渐隐 + `.tabs-chevron` 箭头。各 provider 使用品牌 SVG 图标。

### 6.5 SettingsView

- 独立 BrowserWindow（820×660，原生 frame），通过 IPC `settings:open` 打开，与 Popup 互不阻塞
- 左侧导航（176px）：常规、账号、数据源（CPA 才显示）、外观、通知、数据与隐私、关于
- 数据源页：CPA Manager 卡片列表 + 详情页（复用 CpaConnectorSettings）
- 添加账号：服务选择 picker（常用服务网格 + CPA Manager 高级入口）
- CPA 来源账号显示"来自 CPA Manager" badge，操作为"隐藏"（非删除）
- CPA connector 配置只在 Settings / 数据源页展示，包含 CPA-Manager URL、管理密钥、provider 采集开关
- 选中后显示参数表单（由 PluginMetadata 自动生成）
- 参数类型映射：`secret` → password input，`choice` → select，`boolean` → checkbox
- 刷新间隔输入框（number，1–60 分钟）
- 保存按钮（带 "已保存" 反馈）
- 复制按钮（duplicate）
- **持久化设置**：开机自启、启动后最小化、刷新间隔、暂停自动刷新、窗口置顶、强调色、主题（浅色/深色/系统）均保存到 config store，重启后恢复

### 6.6 路由

- Popup 基于 `window.location.hash`：`#popup`（默认）
- Settings 窗口使用独立 BrowserWindow，通过 IPC `settings:open` 打开
- `useRoute()` hook 监听 `hashchange` 事件

### 6.7 Popup 动态高度（Phase 20）

Popup 窗口的高度跟随渲染内容自动调整，避免出现底部空白或滚动条以外的留白。

- **测量**：渲染层在 `.window` 容器上挂一对离屏 `.popup-mirror`（一份展开、一份全部折叠），通过 `ResizeObserver` 上报两个值：
    - `content_height`：当前可见状态下的真实高度。
    - `collapsed_min_height`：若所有可折叠卡片都折叠后的最小高度。
- **IPC**：渲染进程通过 `popup:reportContentHeight` 频道发送 `PopupContentHeightReport`（`window.usageboard.popup.report_content_height`）。该频道是单向的 popup 专用通道，**不属于插件协议**，不会写入 `plugin-contract.md`。
- **主进程裁剪**：`src/main/core/popup/popup-height-controller.ts` 把目标高度限制在 `[collapsed_min_height, floor(workArea.height * 0.75)]`，并对差值 ≤ 1px 的上报做去抖。
- **窗口锚定**：调整高度时保持宽度（460）不变。平台策略如下：
    - **macOS**：窗口不可由用户拖动（titlebar 无 `-webkit-app-region: drag`），每次 resize 从托盘图标重新计算锚点位置，保持 popover 贴住图标。
    - **Windows**：可拖动浮动窗口。用户移动后，后续 resize 只改高度不改顶部位置，不会重新吸回托盘。未移动时，首次打开由 tray click handler 完成定位，后续 resize 同样保留 `current.y`，避免顶部下跳。
    - **Linux**：按 Windows 浮动窗口处理。tray bounds 可用时初始贴近托盘；不可靠时使用当前鼠标所在 display 的 work area 右下角兜底。窗口可拖动，高度变化不重置用户位置。
- **重置语义**：`reset()` 在 popup 重新打开后被调用，使下一次上报必定触发一次 `setBounds`。

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

| 层级       | 目录                    | 框架             | 职责                                                             |
| ---------- | ----------------------- | ---------------- | ---------------------------------------------------------------- |
| 单元测试   | `tests/unit/`           | Vitest           | 纯函数、schema 校验、parser                                      |
| 集成测试   | `tests/integration/`    | Vitest           | 主进程模块（config/cache/scheduler/runner）                      |
| 烟雾测试   | `tests/smoke/`          | Vitest           | Renderer 组件（mock IPC，jsdom）                                 |
| 端到端测试 | `tests/user_e2e/`       | Playwright       | 真实 Electron 实例，模拟用户操作                                 |
| 打包 smoke | `tests/packaged_smoke/` | Playwright + CDP | 验证打包产物可启动、渲染正常、内置插件可发现；托盘显示需人工验收 |

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
