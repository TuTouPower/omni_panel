# OmniPanel 架构

本文是**技术栈、目录结构、模块划分、数据流、跨模块契约的唯一真相源**。命名/编码风格见 `conventions.md`；业务不变量与术语见 `domain.md`；测试见 `test.md`。

## 1. 技术栈

|领域|选型|说明|
|---|---|---|
|运行时|**Electron 42**|`session` 能力（受控登录窗、webRequest 捕获、持久化分区）要求可编程浏览器引擎|
|语言|**TypeScript 5.9**|严格模式；主/预加载/渲染/共享四区共用|
|构建|**electron-vite 5** + **Vite 5**|dev/build；`out/main` `out/preload` `out/renderer`|
|打包|**electron-builder 26**|Windows/macOS/Linux；连接器目录随 `extraResource` 进 `resources/connectors`|
|UI|**React 19** + **Tailwind CSS 4** + lucide-react + clsx/tailwind-merge|渲染进程|
|校验|**Zod 4**（v3 兼容 API）|manifest / observation / config / plugin-output 四处运行时 schema|
|观测存储|**better-sqlite3 12**|同步 API，WAL 模式，单文件 `usage.db`|
|HTTP|**undici 8**|宿主统一出口 NetClient，ProxyAgent 支持代理|
|连接器脚本编译|**TypeScript `transpileModule`**|非 esbuild（package.json 中 esbuild 为 electron-vite 传递依赖）；无 SHA-256 缓存|
|测试|Vitest 3 + Playwright + jsdom + Testing Library|见 `test.md`|
|质量门|eslint 9 / prettier / knip（deadcode）/ dependency-cruiser（arch）|`pnpm check` 聚合|

## 2. 目录结构

```
src/
├── main/                          # 主进程（唯一持有密钥/文件/网络/会话）
│   ├── index.ts                   # 应用引导：窗口/托盘/IPC 注册/生命周期
│   ├── core/
│   │   ├── connector/             # 连接器运行时（见 specs/connector-runtime.md）
│   │   │   ├── runtime.ts         #   node:vm 沙箱 + transpileModule 编译
│   │   │   ├── manifest-loader.ts #   discover + zod 校验 manifest
│   │   │   ├── net-client.ts      #   undici HTTP 出口 + ctx 构造 + auth 注入
│   │   │   ├── host-io.ts         #   ConnectorContext 契约
│   │   │   ├── tier1-poll-executor.ts  # 声明式 poll 执行
│   │   │   └── probe-executor.ts  #   observe.probe 执行
│   │   ├── scheduler/             # 调度（见 specs/scheduler.md）
│   │   │   ├── connector-scheduler.ts     # per-instance setTimeout 引擎
│   │   │   ├── scheduler-orchestrator.ts  # startAll/rebuild/suspend/resume/shutdown
│   │   │   ├── refresh-service.ts         # 单次刷新：锁/并发/执行/写库/映射；脚本读取走 script-cache（mtime 缓存 readFile+transpile，t195）
│   │   │   ├── runtime-store.ts / snapshot-cache.ts / hydrate-runtime-store.ts
│   │   │   ├── observation-mapping.ts     # Observation → MetricRecord
│   │   │   ├── endpoint-resolver.ts       # 子进程 env 路径解析
│   │   │   └── types.ts                   # 调度器内部类型定义
│   │   ├── observation/observation-store.ts  # SQLite（见 specs/observation-store.md）
│   │   ├── token-stats/           # collector utilityProcess + readers + store（见 specs/ai-cli-token-stats-*.md；reader 含 claude/opencode/kimi/grok，grok 双源：Windows WSL UNC + Linux/mac 本机平台源，t426/t437）；env 枚举 `win|wsl|linux|mac`（t437 废除 t308 的 `local`，按数据所在平台标注），路径解析收敛到平台感知层 `paths.ts`（`(host, env, cfg) -> path|null`，host 由 process.platform 映射，homedir 只服务 linux/mac 源、win_home 只服务 win 源）；源清单声明式（SourceDef.hosts 按 host 过滤，t309），每轮采集产出源级状态 `{source,env,status:ok|unavailable|failed,lastError?}` 经 `TokenStatsUpdate.sources_status` 同步到主进程与面板（t309）；collector 扫描状态（mtime + session facts，丢弃 records）持久化到 `data/token-stats-scan-state.json`，重启增量恢复（t114）；serde 抽到 `scan-state.ts`（t117），collector 薄 wrapper 保持测试透明；store 暴露有界 SQL 聚合（hour buckets / heatmap / window rollup），24h preset 的 KPI/donut/项目/会话轴走 rollup 而非受 LIMIT 截断的 records；手动刷新（t434）经 `manager.force_collect()` 重发 config 消息触发一轮 collect 并以 `poll_interval_ms` 重置自动采集计时；linux 宿主经 `win-home-discovery.ts` 自动发现 `/mnt/c/Users/<u>` 作 `win_home_wsl` 采 Windows 侧五源为 env=win（t438，与 Windows 宿主采 wsl 对称；发现失败 win 源 unavailable，失败结果按轮负缓存重探自愈）
│   │   ├── config/                # config-store（内存缓存 + save 唯一写入口，t195）/ secrets-store / auto-seed / types
│   │   ├── dev-panel/             # t481：只读 Git discovery/log 聚合与单飞扫描状态
│   │   ├── storage/               # write-json（原子写 JSON）
│   │   ├── vault/                 # file-vault-backend（内存镜像，t195）+ VaultBackend 接口
│   │   ├── connector/             # script-cache（脚本 mtime 缓存，t195）+ runtime/net-client/manifest-loader
│   │   ├── session/session-manager.ts        # 登录窗 + cookie/Bearer/refresh token 捕获
│   │   ├── local-api/server.ts    # 0.0.0.0 local-api，仅 /v1/ingest 需 Bearer，其余 web 路由在可信 LAN 下免认证
│   │   ├── cli/                   # CLI 模式（t275）：argv 解析 + --config 导入 + cli.json 实例发现
│   │   ├── main-panel/            # 托盘弹出/悬浮窗控制 + floating-bounds
│   │   ├── popup/popup-height-controller.ts  # 动态高度纯函数
│   │   ├── auth/device_code_oauth_manager.ts # 参数化 device-code OAuth manager（t339：grok/kimi 共享实现，配置收敛 DeviceCodeOAuthConfig）
│   │   ├── auth/grok_oauth_manager.ts          # Grok 薄包装：端点/client_id/scope + 纯 Content-Type 头
│   │   ├── auth/grok_bot_oauth_manager.ts      # t507：Grok Bot PKCE 网页登录 + Refresh Token 换票
│   │   ├── auth/kimi_oauth_manager.ts          # Kimi 薄包装：端点/client_id + 异步设备头（含 device-id resolver）
│   │   ├── auth/kimi_web_token_refresher.ts    # t492：kimi 网页会话 Bearer 续期（auth.kimi.com RefreshToken，refresh→access）
│   │   ├── auth/oauth_helpers.ts               # OAuth 共享常量、类型与纯函数（Layer 1）
│   │   ├── network/effective_proxy.ts           # configured/detected proxy 运行时合并
│   │   ├── logging.ts / paths.ts / settings-close-action.ts
│   ├── ipc/                       # 按域拆的 IPC handler（见 specs/ipc-api.md + ipc-electron.md）
│   └── window/window-manager.ts   # 窗口目录 + 工厂（见 specs/window-management.md）
├── preload/                       # contextBridge 白名单 + route capability 策略
│   ├── index.ts                   # contextBridge 暴露 + route-based 分权
│   ├── api_factory.ts             # 数据驱动能力矩阵装配工厂 (t511)
│   ├── config_filter.ts           # Popup 窗口配置白名单过滤 (t511)
│   ├── log-throttle.ts            # preload 侧 100条/秒日志限流
│   └── route_api.ts               # route 能力查询辅助与各域分流器 (t511)
├── renderer/                      # React：views/ components/ hooks/ lib/ styles/
│   ├── views/settings-view/       #   t122 拆分：sections/ + lib.ts
│   └── views/popup-view/          #   t180 拆分：子组件（TitleBar/EmptyState/...）+ lib.ts
└── shared/                        # 主/渲染共享：schemas/ types/ lib/ constants.ts
connectors/                        # 20 个内置连接器（manifest.json + connector.ts）
tests/                             # unit / integration / e2e(specs/packaged) / smoke
```

### 设计 token 层（t268）

仓库根 `DESIGN.md` 是设计真相源；`src/renderer/styles/globals.css` 是唯一全局样式入口，只保留 token 层、基础规则、必要 `@keyframes` 与 `@utility`：`@theme` 导出区（由 `scripts/designmd.ts` 生成，drift check 门禁）、accent 单变量派生语义层（`--accent-*`/`--color-*` 翻转）、自带字体 `@font-face`、基础样式（`*` 盒模型、`html/body` 字体与底色、tray 窗口 `html[data-window="tray"]` 尺寸规则）、菜单/抽屉动画 `@keyframes`、复合模式 `@utility`（glass-menu/shimmer/metric-num/transition-feedback）。设计决策见 decisions 014。全部窗口（t270-274）已迁移完成，legacy 变量兼容桥已清除，无残留业务手写选择器。

### 组件层（t269）

`src/renderer/components/ui/` 是统一 ui 组件库，覆盖 DESIGN.md「Components」节形态全集（Button/Card/Input/Textarea/Select/SecretInput/Checkbox/Switch/Segmented/Menu/Dialog/Progress/Badge/StatusDot/Kpi/Skeleton/PanelTitleBar/ListRow）。组件只消费语义 token（`--color-*` 等 @theme 变量 + 工具类），不写 `dark:` 变体、不散落字面量。复合模式沉淀为 `@utility`：`glass-menu`（毛玻璃）、`shimmer`（骨架屏）、`metric-num`（KPI 等宽数字）、`transition-feedback`（120ms 交互过渡）。全部窗口已迁移到组件层与 Tailwind utility，无保留的手写组件类。

## 3. 进程与安全边界

CLI 模式（`--cli serve`，t275）是同一 Electron 进程的启动分支：跳过全部窗口/托盘创建，仅起 configStore/vault/observationStore/scheduler/refreshService/local-api 服务，stdout 打印面板 URL 并把实例发现信息（端口、URL、pid）写入 `<dataRoot>/cli.json` 供瘦客户端读取。`--config <path>` 在启动时把文件内容覆盖写入规范 config.json（走 `.bak` 原子写与 zod 校验），明文 secret 转存 vault，落盘配置只保留非 secret 参数。CLI 启动失败（含导入失败）向 stderr 写可读错误后非零退出，不弹 GUI 对话框。

CLI 控制子命令（t276）是同一二进制的瘦客户端形态（`--cli open|refresh-all|pause|resume|restart|quit|autostart`）：跳过单实例锁（否则与 serve 同 userData 时自锁无法连接），whenReady 早期读 `<dataRoot>/cli.json`（或 `--port` 覆盖）经 local-api 控制端点作用于运行中实例后 `app.exit`。控制端点组 `/v1/control/*`（POST，免认证）复用 main 侧 refreshService/orchestrator/app 能力，与 tray 纯 main 动作同一状态面；`restart` 用 `app.relaunch()` 保持原 argv（含 `--cli serve --port --user-data-dir`）重启。

|边界|规则|
|---|---|
|Renderer|`contextIsolation:true` `sandbox:true` `nodeIntegration:false` `webSecurity:true`；只调 preload 白名单；日常 `hasSecret`；设置窗可 `getSecrets` 回填明文|
|Connector 隔离与完整性 (t515)|独立子进程/utilityProcess 隔离执行，崩溃、OOM、死循环不拖垮主进程；内置连接器加载前逐一比对 SHA-256 完整性清单，篡改即拒绝并告警；默认禁止加载未受信的用户外部目录连接器；参数与结果经结构化 IPC 传输|
|主进程|唯一持有密钥明文、文件系统、网络、浏览器会话|
|IPC sender|`assert_valid_sender` 按 URL 协议白名单校验（`file://` 或 dev renderer URL），**不依赖 NODE_ENV**|
|LocalAPI（R7 信任模型）|绑 `0.0.0.0:18263`；定位于可信 LAN（局域网）环境，除 `/v1/ingest` 需 Bearer 外，其余 Web 面板与控制路由免认证直连（见 `specs/web-panel.md`）|
|Vault 存储模型（R8 声明）|自管 AES-256-GCM Vault，主密钥 `vault.key` 与密文同目录存放。安全边界依赖 OS 文件级权限保护（`chmod 0600`/ACL），不使用系统钥匙串|
|会话 Cookie（R10 声明）|网页登录连接器会话 Cookie 采用明文持久化（`enableCookieEncryption: false`），规避各系统钥匙串交互弹窗与登录态失效，信任同机用户文件隔离|
|SSRF|NetClient 阻断云元数据主机（169.254.169.254 / metadata.google.internal / metadata.azure.com）|

## 4. 数据流（单向：采集 → 观测 → 消费）

```
connector.ts (main())
  └─ 返回 ScriptObservation[]（不含 source_instance_id）
       │  宿主 refresh-service.execute_connector
       ▼  盖 source_instance_id（= connector_config.instanceId，host authority）
ObservationStore.insert()  ── SQLite observations 追加表（保留历史）
       │  observation_to_metric_record（drop 非白名单 provider）
       ▼
runtime-store（内存 ConnectorSnapshotState: idle/loading/ready/failed）
       │  ├─ snapshot-cache 防抖 500ms 落 JSON（重启快恢复）
       │  └─ EVENT_STATE_CHANGE 广播到所有窗口
       ▼
renderer：build_provider_usage_groups 按 provider 聚合、accountId 缝合 → UI
```

### 4.1 TokenStats 查询协调

TokenStatsView 在 renderer 内维护查询协调器，不改变现有 token-stats IPC 返回结构。所有影响统计结果的筛选与图表选项组成稳定 query key；查询结果在 renderer 内按 query key 缓存，缓存只保存已转换为面板状态的数据，不写入磁盘。

- fresh 缓存命中时直接应用旧结果，不清空当前图表，不进入全屏加载状态。
- 同一 query key 的在途请求共享同一个 Promise，避免重复触发 SQLite/IPC 查询。
- query key 切换使用 request id 控制可见性，过期请求只能完成自身等待方，不能覆盖最新选项结果。
- collector 广播更新时递增缓存 generation 并把已有条目标记 stale；当前查询保留旧结果，随后静默 revalidate。generation 之前完成的请求不重新写入 fresh 缓存。
- 缓存采用有界 LRU；淘汰只影响复用，不影响统计正确性，缺失条目重新走现有查询路径。
- 配置别名是独立状态流：首次打开读取一次，`CONFIG_CHANGED` 广播只更新别名 state，不因统计选项切换重复读取配置。

#### 4.1.1 查询缓存 key 边界与展示派生（t200）

dashboard query key 只编码「数据」身份，展示维度属 renderer 本地状态：

- **key 含**：agent / platform / range_start / range_end / query_mode / `gran` / alias_fingerprint。`gran` 决定返回桶粒度（s011：day 级 sessions distinct 无法由 hour 桶正确求和），保留在 key 中；gran 切换重新请求。
- **key 不含**：`metric` / `xaxis`（同一范围 + 筛选 + gran 下切换复用同一缓存，renderer 本地派生）；`session_offset`（会话翻页走独立 `get_dashboard_sessions` 通道，不重算 summary/chart/heatmap，也不重拉 dashboard）。
- **展示派生数据流**：dashboard DTO 的 `chart_data = { axis, metric_buckets, session_buckets, rollup }` 是 metric/xaxis 无关的聚合源；renderer 经 `prepareBarDataFromDashboardChartData`（time 轴用 metric/session buckets + server axis，project/session 轴用 bounded rollup）本地派生 Bar 数据，与改前服务器预派生等价（oracle 测试锚定）。别名解析在派生层完成（dir/model resolver），chart_data 保留 raw key。
- **数据版本失效**：collector 更新（data_version 前进）→ `mark_stale` + 重置会话翻页到首页（含 custom-range 路径）→ revalidate；陈旧翻页会话页不落地。

外部 producer 可 `POST /v1/ingest`（Bearer）直接写观测，`source` 按 producer 标记。
web 浏览器经 LocalAPI `GET /v1/events`（SSE）订阅 runtimeStore 状态变更，与桌面端 IPC `EVENT_STATE_CHANGE` 同源；`usageboard-web` 转给 `use_plugins`，用量面板实时刷新。

### 4.2 TokenStats 聚合层与数据版本（t192）

dashboard 查询工作量与 per-message records 总量解耦的持久化聚合层：

```
collector utilityProcess（逐批 token_stats_update）
  └─ manager on_update
       ├─ store.upsert_records(records)  事务内：records REPLACE + 被触碰 session 的
       │                                 hour_rollup 会话级重建 + data_version +1
       └─ IPC TOKEN_STATS_UPDATED(data_version)
             └─ renderer：data_version ≤ 已见版本 → 复用缓存；更新 → mark_stale + revalidate
```

- **真相源**：`token_stats_records`（per-message 事实表，不删除不压缩）。
- **source 枚举**：`claude_code` / `opencode` / `kimi_code` / `grok`（权威定义在 `src/shared/types/token-stats.ts`）；`grok` 双源采集（t426：Windows 经 WSL UNC 的 `grok_wsl`，Linux/mac 本机 `~/.grok` 的 `grok_linux`/`grok_mac`；t197 起仅 WSL 的表述已被 t426 取代，数据位置与事件口径见 `domain.md` §3.2）。
- **派生层**：`token_stats_hour_rollup`（per source/env/session_id/本地整点小时/model/directory/agent 聚合）。会话级增量：upsert 批次内对每个被触碰 session DELETE + 从 records 全量重建；`directory` 可空（NULL 唯一键在 SQLite 互异，行级 UPSERT 会叠重复行，故不用）。
- **回填**：manager.start 后 `setImmediate` 后台全量回填并置 `hour_rollup_ready`；就绪前 dashboard 走 records 路径，就绪后切聚合路径（窗口拆「完整小时段聚合表 + 边界部分小时 records」UNION ALL，外层精确重组）。中断可重跑，幂等收敛。
- **data version**：单行单调计数，仅 records 批次事务内推进；dashboard DTO 与更新事件携带同一版本，renderer 据此判断缓存过期，不依赖本地时钟。

#### 4.2.1 dashboard 单次窗口读取与 freshness（t201）

dashboard 查询在 worker/主进程只读连接内把窗口物化一次，各展示区域从临时表派生（p027/p028/p031）：

- `CREATE TEMP TABLE window_rows` 一次物化当前窗口（rollup 就绪 = hour_rollup 中段 UNION ALL records 边界带；未就绪 = 整窗 records），metric_buckets / session_buckets / heatmap / rollup 区域均 `SELECT FROM window_rows`。previous 窗口独立二次物化（只喂 summary delta）。
- per-session 元数据（title/directory/started_at/ended_at + 聚合 calls/tokens）用单一 `session_meta` 窗口级 latest-per-group 查询取齐，替代改前每 session N 个相关子查询。
- records/rollup 双轨统一为单一 window source，两就绪态共享同一区域派生代码，修一处不两处。
- **freshness.stale**：查询开始/结束各读一次 `data_version`，`stale = end_version > start_version`（聚合期间有已提交新批次）；返回 `data_version` 用结束版本，renderer 按既有 AC4 语义 mark_stale + revalidate。

### 4.3 用量面板窗口生命周期（t194）

popup 与 floating 模式关闭都改为隐藏（hide）而非销毁（close），消除每次重开重建渲染进程的冷启动：

```
open_or_toggle / hide → win.hide()         （保留渲染进程与已加载数据）
open_or_focus（重开）   → show_panel()
                          ├─ popup：position_popup() 重新锚定托盘后 show/focus
                          └─ floating：保留用户拖放位置，直接 show/focus
模式切换 / 退出流程     → close()            （AC4：仍按关闭重建语义）
```

### 4.4 会话历史订阅 / watcher 服务（t210，t219 推送按订阅方窗口路由）

会话历史窗口（t211）只对**被打开的会话**高频刷新，其余维持 token-stats 10 分钟轮询。主进程 `SessionHistorySubscriptionService` 维护订阅表 `(source, env, session_id)` → 单个源文件监听器 + 订阅方列表：

- 监听策略（决策 5）：win 本地 claude_code JSONL 用 `fs.watch`；WSL 9P 路径（claude_code/kimi/grok）与 opencode SQLite db 退化为 2s mtime 轮询。`fs.watch` 不可用（文件未出现等）自动退化轮询。
- 订阅即做一次全量提取建立增量游标；watcher 触发 → t209 增量提取 → `SESSION_HISTORY_MESSAGES_UPDATED` 推送增量（只含新增）。
- **多订阅方路由（t219）**：订阅表每个 loc 持 `subscribers: Map<subscriber_id, on_update>`；同会话多窗口各自独立收推送。IPC SUBSCRIBE 以 `event.sender`（发起窗口 webContents id）为订阅方身份，推送只发回该窗口；订阅方窗口销毁（`webContents.destroyed`）即注销该订阅。未绑定窗口的订阅用缺省 id，路由由调用方 `on_update` 决定（fallback）。
- 主动查询 `SESSION_HISTORY_QUERY` 全量提取 + 内存切片分页（决策 17 后端部分）：分页游标编码「已返回页最早消息在追加型数组中的绝对下标」（append-only 前缀跨追加稳定，空/重复消息 id 不跳段）。
- **提取缓存（t235）**：`SessionHistorySubscriptionService` 以 `(source, env, session_id)` 为 key 缓存全量提取结果，失效信号为源文件 `mtime_ms + size`；`subscribe` 初始提取、`query`、分页均优先命中缓存，避免同一文件被反复全量解析。`handle_change` 增量推送后把新消息合并入缓存。缓存随订阅生命周期存在，不跨会话串数据。
- **定位缓存（t235）**：`session-locator` 以 `(source, env, session_id)` 缓存 `resolve_session_file` 结果，同样按源文件 `mtime_ms + size` 失效；重复定位不重复目录扫描，文件删除后失效并返回 not found。
- **持久定位索引（t254，t310）**：`session-locator` 的解析结果持久化到 `<dataRoot>/session-path-index.json`（`session-path-index.ts`），跨重启命中免整目录递归扫描；命中校验 `mtime_ms + size` + `paths_key` 签名（t310 起含 host/homedir/win_home/wsl_distro/wsl_user 五段，t438 起含 effective win_home_wsl——发现结果变化旧条目即失效，防跨配置命中旧路径；`SESSION_INDEX_VERSION=2`，t310 env win→local 重构时整体丢弃重建）。失效回退扫描并修正索引；写盘失败仅记日志跳过（回退扫描）。WSL 用户名探测结果进程内缓存 + 随索引跨重启缓存，探测失败（空串）不写负缓存下次重探测自愈。
- **批量内容搜索与轻量摘要（t239）**：`SessionHistorySubscriptionService` 提供 `searchContent`（候选 loc 集合 + 关键词 → 命中 loc key 集合）与 `summaries`（候选 loc 集合 → loc key → user 消息前 80 字符，`options.mode`：`"first"` 首条（默认）/ `"last"` 末条，IPC/HTTP/preload/web 全链路透传）；`searchContent` 复用提取缓存、限制并发解析数（默认 3）并支持 `AbortSignal` 协作中断，`summaries` 未缓存时调用各端 `extract_*_first_user` 轻量扫描（`first`：JSONL 从头按行、opencode 按 rowid 取 text part；`last`：JSONL 经 `read_tail` 限量读末尾 64KB 后从尾部按行扫描，opencode 按 rowid DESC、antigravity 按 idx DESC 限量查询）避免全量提取；已缓存路径直接按 mode 取首条/末条 user。对应 IPC 通道 `SESSION_HISTORY_SEARCH_CONTENT` / `SESSION_HISTORY_SUMMARIES` 由 IPC 层 resolve 后批量调用，未 resolve 的 loc 被跳过；renderer `SessionLibrary` 以 300ms 防抖 + `AbortController` 取消旧查询，摘要按可见会话批量获取并合批更新。
- **会话首屏主进程非阻塞（t256）**：`summaries` 每个任务读前 `await setImmediate` 让出事件循环，首屏批量摘要的同步 fs 不再阻塞主进程（缓存读写仍同步原子，Node 单线程无竞态）；collector 回填（`manager.ts` `apply_batches`）按批 ≤2000 条处理、批次间 `setImmediate` 让出供面板查询响应，循环边界取 sessions/daily/records 三数组最大长度防丢数据，全部完成后触发 `on_update`。
- 工作台兜底轮询降级（t235）：renderer `WorkspaceView` 兜底全量 `query` 间隔从 5s 拉长至 30s，保留作为订阅推送丢失时的拉齐手段；活跃会话新消息仍由 watcher 2s 轮询 / `fs.watch` 推送在秒级上屏。
- 全程只读（硬约束）：服务层与提取器不开写句柄；注销 / 窗口关闭按订阅方释放 watcher / 轮询句柄。
- 历史窗口 singleton `HistoryWindowController`（对齐 `create_agent_window_controller`）：`SESSION_HISTORY_OPEN` 幂等——已开则 show+focus+定位，未开则创建并经 URL `route_query` 携带初始定位参数（renderer 启动读），`did-finish-load` 补发兜底创建窗口期丢失的定位。
- 会话源文件定位 `session-locator`：`(source, env, session_id)` → 源文件 / db 路径；路径解析共用 token-stats 平台感知层 `paths.ts`（t310，env 对齐 `win|wsl|linux|mac`（t437），host 由调用方注入 `host_from_platform(process.platform)` + homedir）；WSL 用户名优先取 `tokenStats.wslUser` 显式配置，空串自动探测 `\\wsl.localhost\<distro>\home` 第一目录（对齐 collector）；linux 宿主 win 源经 `win_home_wsl` resolve 时惰性发现（t438，"" 显式禁用，失败负缓存 60s 节流防批量 resolve 反复 spawn powershell.exe）。

### 4.5 会话历史窗口（t211；t224 起为槽位模型）

route `history` 单窗口。t224 把工作台改为 8 槽位模型（`WorkspaceView`，见 `specs/workspace.md`），下述 t211 决策为被取代前 6 栏平铺的能力来源：消息渲染/推送/分页/选择/复制语义仍生效，宿主迁至 `WorkspaceView` 的 `HistoryColumn`。

- **打开与定位**：明细表（t212）/ onFocus 事件经 `SESSION_HISTORY_OPEN` 打开窗口；renderer 读 URL `loc` query 或收 `SESSION_HISTORY_FOCUS` 定位。t224 起定位装入工作台槽位（`open_session`：已开聚焦、槽满 toast 拒绝）。

- **打开入口与面板间导航（t212）**：会话历史窗口可从明细表单击行 / 勾选批量「打开历史」、popup TitleBar「会话历史」、代理面板 header「到会话历史」打开；窗口内「用量面板」/「代理面板」返回跳转。纯跳转入口（无具体会话）调 `sessionHistory.open("", "", "")`，主进程 `open_or_focus(undefined)` 只开/聚焦空窗；明细表批量打开传 `identity_key`（`source|env|session_id`）。**批量冷启动补发**：创建窗口期连续 OPEN 的定位由 controller 的 `pending_locs` 缓冲（`webContents.send` 在 loadURL 途中被丢弃），`did-finish-load` 后按序统一补发并按 key 去重。

- **超 6 处理（决策 4）**：打开第 7 个弹模态框列出现有 6 个会话（agent + 标题 + 打开时间），用户至少关 1 个才入栏，可取消。容量检查用同步 `opened_count_ref`（React 19 批处理下 render-fresh ref 在批量 open 循环内会 stale，超 6 直接挂载）。

- **消息选择（决策 8，t226 起为摘选系统）**：选择 store 跨页签共享（`specs/workspace.md`「摘选系统」），Shift 连选/Space 选中 hover 消息、底部托盘三格式复制、顶栏计数徽标；旧 `build_copy_markdown` 单一 Markdown 复制已删。

- **消息渲染（决策 11）**：纯文本 + `<pre>` 保留换行缩进，零新依赖；时间戳显示到分钟、悬停完整时间。

- **空态（决策 12）**：源文件缺失栏显示「该会话的原始记录文件不存在或已删除」，不阻断其他栏。

- **分页（决策 17）**：初始最近 200 条，向上滚动加载更早（游标分页 + 并发锁 + 前置 scrollTop 锚定），新增消息追加尾部不打断滚动位置。

- **实时刷新（决策 5/6）**：栏打开 subscribe、栏关/清空/窗口卸载 unsubscribe；`SESSION_HISTORY_MESSAGES_UPDATED` 推送按 loc 合并去重追加；5s 兜底 interval 对 ready 栏 query 尾部合并（函数式 setState，避免与推送交错竞态）。

- **降级与恢复**：renderer `useNowTick` 监听 `document.visibilityState`，隐藏期间前台计时器暂停推进，`visibilitychange` 回可见时立即刷新；不破坏后台仍需的订阅。隐藏窗口占用的渲染进程保留（Windows 实测 work set 内存保留、无 CPU 增量，见 s010）。

- **边界**：`apply_config_change` 模式切换仍 `close_for_mode_switch` → 重建；配置变更、电源恢复、托盘打开等既有路径行为不变。

### 4.6 会话窗口外壳与工作台（t223/t224）

route `history`/`session` 渲染根组件为 `SessionShell`（见 `specs/session-shell.md`）。P6：默认会话库 + 同屏查看；顶栏无工作台/会话库页签；外部 open/focus 进入同屏。

- **槽位模型**：8 槽纯函数 store（`src/renderer/lib/workspace/slots.ts`），组件内「state + 同步 ref」双维护（t211 同款批处理 stale 坑）。打开入口（onFocus/URL loc/picker/recent）统一走 `open_session` 装入；同 loc 查重防双槽、槽满 toast 拒绝、`confirm_recent` 替换前退订旧槽防 watcher 泄漏。
- **布局**：`effective_columns(layout, width)` 按 `MIN_COLUMN_WIDTH=375` 降档，`cols = min(effective_columns, 占用数)` 写 `.slot-grid --cols`；工具条保留「最近会话」「清空」「视图」，会话排布通过「视图」菜单选择。
- **设计系统**：demo 语义色 token（canvas/panel/raised/inset、subtle/strong 边框、primary/secondary/muted 文本、lime 强调、danger）作用域限定 `.session-shell`，暗色默认，`html[data-theme="light"] .session-shell` 覆盖浅色；内部桥接旧 token 名（`--win-bg/--text/--card-bg/--accent/--bg-hover/--border` 等）让会话历史样式直接继承 demo 视觉；agent 识别色 `--agent-{claude,grok,opencode,kimi,codex,cursor,aider}` 明暗两套。字体走系统等价回退，零新增资产。
- **主题跟随全局**：`SessionShell` 调用共享 `useTheme()`，通过 `config.get` 与 `onThemeChange` 使用全局主题；首帧由 preload 的 `ou_theme` 参数设置。会话窗口不再维护 `omni_session_theme` 独立存储，也不提供独立主题切换按钮。
- **会话库视图（t227，t248，t439）**：「会话库」页签由 `SessionLibrary`（`src/renderer/components/session-library/`）渲染：左侧边栏（`library-sidebar`，对齐 demo 顺序）顶部统计（`library-count` 当前 / 总量 条会话；统计加载中/失败分别标注加载中/总量未知）+ 网格/列表切换 → 排序分段（字段 时间/Token/轮次/标题 + 独立升降，点同字段切换方向，`order_by` 白名单含 `title` → `unicode_lower(COALESCE(title, ''))`）→ 搜索（图标输入 + 清除 X +「包含消息内容」开关并集正文搜索，后端候选筛选分页、序号守卫防迟到覆盖）→ 标题独立筛选 +「添加目录」chips（`DirectoryChipsFilter`：回车添加、去重、末级名 + X 移除，走 `directories[]` 精确匹配 OR；分页与正文搜索透传，计入重置条件；`filter_sessions` 客户端同口径补过滤）→ 时间预设分段 + 日历弹层（自定义生效后为主色胶囊：区间 + 重选 + 清除）→ agent logo 行多选（纯 logo 方块，未选中半透明、选中 accent 色边，无数量角标/「全部」按钮）→ Token 数/轮次数轴区间（双滑杆：灰底轨道 + 区间主色填充段，常显区间值、上限端带「+」，拖到端点回传 undefined；上限取 `session_stats.max_tokens/max_calls`，300ms 防抖提交后端参数；内容搜索命中集走 `filter_sessions` 客户端补过滤）→「同屏最近 2/4/6/8」内联行（按 ended_at desc 拉取后 clear→逐个 open→切工作台，替换语义）→ 底部「N 个条件生效」+ 重置（0 条件禁用）；网格按内容区宽度自适应，一行最多 5 列（最小列宽 280px，窄于单列时允许收缩）；卡片对齐 demo 三行结构：行1 徽标 + 时间区间 + 悬停勾选框（已选常显），行2 目录末级名 · tokens · N 轮 · IdChip（点击复制完整 session id，短显 8 位），行3 末条 user 摘要（`summaries` mode=last），无标题行、无续接命令复制；主区为网格/列表、加载更多分页、预览抽屉（前 5 条）、SelectionBar（已选 n 条 / 全选结果 / 清空 / 同屏查看 →）进入 `CompareView`；单独打开与同屏最近亦进入同屏查看（P6，不再装工作台槽位）。筛选/排序为纯函数 `lib/session-library/filter.ts`；勾选身份用 `source|env|id` 主键；首条用户消息摘要与内容搜索经 session-history 批量接口读源文件消息（只读）。
- **会话库查询路径（t227，t248）**：main 侧 `query_session_stats` 独立聚合全量会话数、Agent 数、tokens、最大总 tokens / 最大轮次（`max_tokens`/`max_calls`，会话库数轴筛选的上限）与 source 计数；`query_sessions` 按 `sources[]`/`search`/`directory`（子串）/`directories[]`（精确匹配 OR，IPC/HTTP 共用校验：≤32 个非空串、每项 ≤1024 字符，非法 `INVALID_DIRECTORIES`（HTTP 400；空查询项仍忽略））/`start_at`/`end_at`/`min_tokens`/`max_tokens`/`min_calls`/`max_calls`（tokens/轮次区间，含边界）/`order_by`/`direction` 做白名单 SQL 过滤与分页，renderer 只持有当前已加载页；IPC 侧校验区间边界为非负整数，非法返回 `INVALID_RANGE`。内容搜索合并后端元信息命中与正文命中，摘要只请求当前可见会话。
- **会话面板 e2e 与 web 桥（t228）**：web e2e 覆盖会话面板关键路径（`tests/e2e/web/session_panel.spec.ts`），数据来自 `scripts/e2e/session_fixture.mjs` 合成会话+消息（经 `tests/e2e/fixtures/synthetic.json` 与 mock server `/v1/sessions`、`/v1/sessionHistory?id=`）。web 桥 `sessionHistory`（`src/web/usageboard-web.ts`）实桥：`query` 读 mock 消息、`open` 直接分发给 `onFocus` 订阅者（对齐 Electron open_or_focus 广播，使 web 下打开会话能装工作台槽位）、`recent` 由 `/v1/sessions` 派生。旧实现残留（6 栏视图 / 栏满弹窗 / 旧单一 Markdown 复制）已无源码。

## 5. 跨模块契约

- **观测契约**：脚本产出 `script_observation_schema`（snake_case，无 `source_instance_id`）；宿主 extend 出 `observation_schema`。字段语义见 `specs/observation-store.md`。
- **instance identity 归宿主**：脚本运行时发现 account/metric，但不知自己在哪个实例下；`source_instance_id` 只由 `refresh-service` 盖，防同 provider 多实例在下游 collapse。
- **重新登录按 instanceId 路由（t158）**：401/认证错误触发的「重新登录」入口（overview banner + 每行）必须把 `instanceId` 透传到 `settings.open({ instanceId })`——多账号场景下不能用 `activeProviders.includes(provider)` 模糊匹配第一个 connector，否则会打开错账号。`AccountError.sourceInstanceId` / `ProviderError.instanceIds` 字段须贯穿到 renderer 链路。
- **采集失败区分凭证失效（t172）**：账号行「重新登录」按钮只对凭证失效类错误显示（`is_auth_error` 唯一口径在 `src/shared/lib/auth-error.ts`，renderer 与 refresh-service 共用）；OAuth(poll) 连接器（`auth.method = oauth_device`）采集因 auth 错误失败时，`refresh-service` 经 `oauth_refresh` deps 对该实例即时 `refresh_now` 一次，成功则重试采集（补一次尝试预算），失败则维持现有 stale 标记；每轮至多一次即时刷新，与定时自动刷新并发安全。
- **vault 命名空间**：`keyFor(instanceId, name) = ${instanceId}:${name}`，`secrets-store` / `session-manager` / `net-client` 均经此，不内联拼接。
- **endpoint 解析优先级**：用户 `endpointOverrides` > manifest `endpoints`；`requireExplicitEndpoints` 为真时无 override 即报错（CPA 用）。
- **认证方式描述符**：manifest 可显式声明 `auth` 块（`method` + `secret_name` + 可选 `extra_fields`/`login_url`/`require_endpoint`）作为认证方式的唯一真相；渲染层通过 `src/renderer/lib/auth-flow-registry.ts` 的 `resolve_auth_method` 读取 descriptor，未声明时按 connector `source` 回退到 `session`/`local_cli`/`apikey`，不再硬编码厂商映射（t107/t108）。
- **manifest catalog（t121）**：`connector:catalog` IPC 从已发现 manifest 出目录，**不读 `config.plugins` / `removedConnectorIds` / 密钥**；添加账号对话框优先按 catalog 解析 auth（`find_vendor` 两阶段：先 `manifest_id` 精确，再 `supported_providers`），保证墓碑内或无实例的 vendor 仍能渲染正确表单。详见 `specs/add-account-catalog.md`。
- **添加账号落盘（t121）**：`config:createInstance` IPC 按 `manifest_id` 直接建实例（形状同 `auto_seed_connectors`：follow-global refresh、`manualDefault` → `manualRefreshOnly`、非 secret 默认参数），同时从 `removedConnectorIds` 仅清目标 id；`savePluginSettings` 合并而非替换 `parameterValues`，保留 manifest 默认参数。
- **厂商子表单实现**：grok 与 kimi 的添加账号表单由 `OAuthDeviceForm` 实现 device-code 登录流程，表单按 `vendor` prop（"grok" | "kimi"）选用对应 `useGrokDeviceLogin` / `useKimiDeviceLogin` hook；opencode_go 的添加账号表单由 `WebLoginForm` 实现网页登录流程（t109/t112）。device-code 登录在 temp instance id 下完成；real instance 的 OAuth 三键持久化成功后才清理 temp namespace，清理异常必须传回调用方而不能标记添加成功。完整密钥白名单与流程见 `specs/connector-auth.md`（t159）。
- **web 认证链路（t278/t282）**：local-api 提供 grok/kimi OAuth 六端点（login_start / login_poll / status / logout / refresh）与 cookie 登录触发/状态组（`/v1/auth/cookieLogin`、`/v1/auth/cookieLogin/status`）；web bridge（`src/web/usageboard-web.ts`）与 preload 同步暴露，设置页 device-code 在页面内展示 URL+码并轮询。cookie 登录（**有 instance_id 的编辑路径**）为立即触发 + `cookieLoginStatus` 轮询，共享实现 `src/renderer/lib/cookie_login_poll.ts`（250ms 间隔 / 120s 超时 / 中文冲突与超时文案），由 `SettingsForm` 与 `WebLoginSection` 共用。cookie 捕获复用 session-manager 隔离 partition 的可见 BrowserWindow（CLI/桌面同代码路径），捕获成功后密钥落 vault、web 编辑路径重读 secrets 并刷新 connector；无 display 时在创建窗口前返回可读错误，设置页提供手动粘贴 Cookie 回退（与自动捕获共用 secrets 保存链路）。**t337 捕获后有效性探测**：session-manager 调宿主注入 `verify_cookie(cookie, login_url)`（fetch login_url，3xx 且 `Location` 为 `/workspace/<id>` 判定有效，10s 超时，对齐 opencode_go connector /auth 判定），失败返回 `saved:false, reason:"invalid_cookie"` 不落库，UI 显示「登录态无效」；web 编辑路径经 `startCookieLogin` 按 reason 区分文案。\*\*web 添加账号（无 instance_id）\*\*不能走 vault 状态端点（尚无配置实例）：仍用阻塞式 `session.login` 匿名捕获，UI 展示「登录期间请勿刷新；中断后手动粘贴 Cookie」降级指引 + 手动粘贴恢复；冲突/超时错误经 `format_cookie_login_error` 统一为中文。桌面版 cookie 登录仍走 `session.login`（含匿名返回 cookie、实例写 vault）。认证全流程日志脱敏（cookie/token 不落日志，开发期同样生效）。已知降级：web/headless 下无静默 cookie 续期，过期需重新登录或重新粘贴。
- **web 实时推送（t279/t414）**：SSE 通道（`GET /v1/events`）承载 runtimeStore state、`config`、`theme` 与会话历史 `messagesUpdated`。**t414：每 web 页一条 EventSource**（`?connectionId=`，UUID），多会话经同一连接登记；不再每会话开专属流（旧 `?subscriberId=` 仍兼容）。bridge 在连接 `open`/重连后对仍打开的会话 POST `/v1/sessionHistory/subscribe`（body 含 `connection_id` + `subscriber_id`，同 id 幂等只换 on_update），服务端把 watcher 增量只推给持有该订阅的连接；`unsubscribe` 不关共享流；连接关闭时 cleanup 清该连接上全部会话订阅（映射/client 双身份校验，防重连竞态误删）。注册/重挂失败由 renderer 5s 轮询兜底。日志导出：`GET /v1/logs/export` 流式输出当前活跃日志段（`<userData>/logs/app-<date>.log`，chunked 无 Content-Length），`Content-Disposition` 触发浏览器下载，web bridge `logs.export` 与桌面保存对话框语义对齐。
- **config-store 损坏处理（t111）**：主文件 schema 失败、空文件/仅空白字符、IO 错误等非 ENOENT 情况均不 fallback 到 `DEFAULT_CONFIGURATION`；ENOENT 时仅当配置目录不存在才返回 defaults 并允许 auto_seed，目录存在但 `config.json` 缺失视为异常抛错。`writeFileAtomic` 采用 tmp → `fsync` → `close` → `rename` 顺序，避免进程强杀后产生 null padding。
- **IPC 边界**：renderer 只能调 `window.usageboard.*` 白名单，按 route（usage/setting/tray/agent）分权。
- **开发面板通路（t481/t482）**：桌面 `devPanel:*` IPC 与 Web `/v1/devPanel/*` 都调用主进程能力；Git 扫描由 `DevPanelScanManager` 统一执行，模型路由由 `DevPanelModelRoutingManager` 统一读外部 YAML、访问 New API、写渠道映射和自检。Git 命令经无 shell `execFile` 只读执行；模型路由凭证仅在宿主持有，响应不含 `session`。模型路由保存先写宿主本地 `models`/`model_mapping`/`priority` 快照，再串行写渠道，首次失败后停止并返回 success/failed/skipped 分类；桌面 IPC 与 Web LocalAPI/bridge 保持同权限与二次确认语义。
- **会话历史 IPC 通道组（t210，决策 15）**：`SESSION_HISTORY_OPEN`（打开/聚焦历史窗口 + 定位）、`SUBSCRIBE`/`UNSUBSCRIBE`（watcher 生命周期）、`QUERY`（全量/分页）、`RECENT`（最近会话，按 ended_at 降序）、推送 `MESSAGES_UPDATED` / `FOCUS`。preload 按 route 分权（t212 三档）：`history` / `agent` 暴露全量真实 IPC；`usage`（托盘 popup / 用量面板）仅暴露 `open`（打开/聚焦窗口，订阅查询保持 noop）；其余 route 用 noop 栈。OPEN handler 在 `main/index.ts` 单点注册（fire-and-forget，无 IpcResult 包装）。
- **用量窗口宽度**：usage 窗口仅有 472px 最小宽度；floating 持久化宽度最多为所在 display 的 `workArea.width`，popup 不设固定最大宽度。

### 5.1 Web 配置操作与事件桥

Web 配置实例管理、导入导出和实时同步的行为契约见 [`docs/specs/web_config_parity.md`](../specs/web_config_parity.md)。技术边界如下：

- LocalAPI 配置端点组为 `/v1/config`、`/v1/config/duplicate`、`/v1/config/createInstance`、`/v1/config/export`、`/v1/config/import`；Web bridge 只通过这些 HTTP 端点访问配置。
- `/v1/config/export` 默认返回剥离 secret 的 `AppConfiguration`；含密钥变体只在 `includeSecrets=true` 时从 vault 注入导出响应，服务端不保存导出副本。
- `/v1/events` 的默认 `message` 事件承载 runtime 状态；命名 `config` 事件承载非 secret `AppConfiguration`，命名 `theme` 事件承载 `isDark` 布尔值。主进程保存配置或主题变化时发布对应事件。
- Web import 在写入前拒绝未知 connector executable path 和非空 `endpointOverrides`；配置持久化仍经 config-store，secret 持久化仍经 vault。

## 6. 与旧 SPEC 的关键差异 & 已知限制

代码现状**已偏离** `docs/archive/_pre_opinit_20260705/` 的旧 SPEC 与 v2 设计愿景，以下为"现在是什么"：

- **连接器执行**：旧 SPEC 说"子进程 + esbuild + SHA-256 缓存 + stdin 传 secret"；现状是 `node:vm` 同进程沙箱 + `typescript.transpileModule`，**无 esbuild、无编译缓存、无内置连接器 SHA-256 完整性清单**。
- **Tier 1 纯声明式未落地**：v2 设想简单 poll 连接器零代码；现状 20 个连接器**全部**带 `connector.ts`，`poll.map` 均为空，解析都在脚本里。
- **secret 默认进脚本**：v2 设想"明文默认不进沙箱"；现状连接器 secret 参数**全部** `exposeToScript:true`，明文经 `ctx.params` 进脚本。
- **无自适应探测/退避**：调度器固定间隔，无指数退避，`observe` 探测自适应未实现。
- **连接器子进程隔离与完整性保护（t515）**：已升级为独立子进程/utilityProcess 隔离执行，并通过 SHA-256 完整性清单核验内置连接器，消除了旧 `node:vm` 原型链逃逸风险。
- **安全威胁模型与设计取舍声明（R7, R8, R10）**：
  - **LocalAPI LAN 信任模型（R7）**：LocalAPI 默认监听 `0.0.0.0:18263`，定位为家庭/办公可信内网服务，除 `/v1/ingest` 需 Bearer 外，其余端点免认证直连，避免在内网引入复杂鉴权。
  - **Vault 存储模型（R8）**：自管 AES-256-GCM Vault，主密钥 `vault.key` 与密文文件同级存储在应用数据目录，安全边界明确依托操作系统文件级访问权限控制（POSIX `chmod 0600`，Windows 严密 ACL 继承），不使用 OS Keyring。
  - **会话 Cookie 明文存储（R10）**：关闭打包 Chromium Cookie 钥匙串加密（`enableCookieEncryption: false`），以保障跨平台与无窗口 CLI 下会话长效保持，不被钥匙串权限弹窗阻断。
- **导入配置可重定向端点**（已知安全限制）：`endpointOverrides` 可被导入的恶意配置改指公网攻击主机，`apply_auth` 会把 vault secret 发过去；`assert_safe_connector_host` 只拦云元数据主机。待办：改端点后强制重录 secret。
- **系统代理与外链安全策略（t510）**：默认采纳系统代理（含 SOCKS5 与 PAC 支持），设置中支持用户手动关闭系统代理（`proxy.useSystemProxy === false`）；窗口内所有外部 http/https 导航通过 `will-navigate` 拦截并委托系统默认浏览器打开，杜绝外部网页在应用窗口内加载。
- **配置迁移（t510）**：`schemaVersion` 递增至 2，启动时自动清理存量未配置的交互式登录空实例。
- **Preload 路由矩阵与分权（t511）**：Preload API 采用工厂驱动（`create_preload_api`），消除了三栈复制与大 switch 分支；Grok Bot OAuth 高阶能力仅限 setting 窗口，低权窗口全部注入 rejected 存根；Popup 窗口的 `config.save` 施加白名单保护（`filter_popup_config_save`），越权篡改核心敏感配置被安全忽略并恢复现值。
- **Grok Bot 认证生命周期与 Token 轮换（t512）**：verifier 仅保留在主进程内存（`pending_verifiers`），不流经渲染层与 IPC；并发轮询通过 `active_cancels` 互斥隔离消除孤儿；`refresh_now` 实现基于 instance_id 的 Promise 去重与自动网络重试；Vault 写入具备原子补偿回滚；连接器 401 明确抛错联动调度器即时换票；支持后台定时自动刷新（`schedule_refresh`）与 Refresh Token 轮换持久化，失败触发 `on_token_expired` 告警。
