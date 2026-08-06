# OmniPanel 架构

本文是**技术栈、目录结构、模块划分、数据流、跨模块契约的唯一真相源**。命名/编码风格见 `conventions.md`；业务不变量与术语见 `domain.md`；测试见 `test.md`。

## 1. 技术栈

| 领域           | 选型                                                                   | 说明                                                                             |
| -------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 运行时         | **Electron 42**                                                        | `session` 能力（受控登录窗、webRequest 捕获、持久化分区）要求可编程浏览器引擎    |
| 语言           | **TypeScript 5.9**                                                     | 严格模式；主/预加载/渲染/共享四区共用                                            |
| 构建           | **electron-vite 5** + **Vite 5**                                       | dev/build；`out/main` `out/preload` `out/renderer`                               |
| 打包           | **electron-builder 26**                                                | Windows/macOS/Linux；连接器目录随 `extraResource` 进 `resources/connectors`      |
| UI             | **React 19** + **Tailwind CSS 4** + lucide-react + clsx/tailwind-merge | 渲染进程                                                                         |
| 校验           | **Zod 4**（v3 兼容 API）                                               | manifest / observation / config / plugin-output 四处运行时 schema                |
| 观测存储       | **better-sqlite3 12**                                                  | 同步 API，WAL 模式，单文件 `usage.db`                                            |
| HTTP           | **undici 8**                                                           | 宿主统一出口 NetClient，ProxyAgent 支持代理                                      |
| 连接器脚本编译 | **TypeScript `transpileModule`**                                       | 非 esbuild（package.json 中 esbuild 为 electron-vite 传递依赖）；无 SHA-256 缓存 |
| 测试           | Vitest 3 + Playwright + jsdom + Testing Library                        | 见 `test.md`                                                                     |
| 质量门         | eslint 9 / prettier / knip（deadcode）/ dependency-cruiser（arch）     | `pnpm check` 聚合                                                                |

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
│   │   ├── token-stats/           # collector utilityProcess + readers + store（见 specs/ai-cli-token-stats-*.md；reader 含 claude/opencode/kimi/grok，grok 仅 WSL t197）；collector 扫描状态（mtime + session facts，丢弃 records）持久化到 `data/token-stats-scan-state.json`，重启增量恢复（t114）；serde 抽到 `scan-state.ts`（t117），collector 薄 wrapper 保持测试透明；store 暴露有界 SQL 聚合（hour buckets / heatmap / window rollup），24h preset 的 KPI/donut/项目/会话轴走 rollup 而非受 LIMIT 截断的 records
│   │   ├── config/                # config-store（内存缓存 + save 唯一写入口，t195）/ secrets-store / auto-seed / types
│   │   ├── storage/               # write-json（原子写 JSON）
│   │   ├── vault/                 # file-vault-backend（内存镜像，t195）+ VaultBackend 接口
│   │   ├── connector/             # script-cache（脚本 mtime 缓存，t195）+ runtime/net-client/manifest-loader
│   │   ├── session/session-manager.ts        # 登录窗 + cookie 捕获
│   │   ├── local-api/server.ts    # 0.0.0.0 local-api，仅 /v1/ingest 需 Bearer，其余 web 路由在可信 LAN 下免认证
│   │   ├── main-panel/            # 托盘弹出/悬浮窗控制 + floating-bounds
│   │   ├── popup/popup-height-controller.ts  # 动态高度纯函数
│   │   ├── auth/grok_oauth_manager.ts          # Grok device-code OAuth + token rotation
│   │   ├── auth/kimi_oauth_manager.ts          # Kimi device-code OAuth（仿 grok；独立 client_id/设备头/无 scope）
│   │   ├── auth/oauth_helpers.ts               # Grok/Kimi OAuth 共享常量、类型与纯函数（Layer 1）
│   │   ├── network/effective_proxy.ts           # configured/detected proxy 运行时合并
│   │   ├── logging.ts / paths.ts / settings-close-action.ts
│   ├── ipc/                       # 按域拆的 IPC handler（见 specs/ipc-api.md + ipc-electron.md）
│   └── window/window-manager.ts   # 窗口目录 + 工厂（见 specs/window-management.md）
├── preload/                       # contextBridge 白名单 + route capability 策略
│   ├── index.ts                   # contextBridge 暴露 + route-based 分权
│   ├── log-throttle.ts            # preload 侧 100条/秒日志限流
│   └── route_api.ts               # route 能力查询辅助
├── renderer/                      # React：views/ components/ hooks/ lib/ styles/
│   ├── views/settings-view/       #   t122 拆分：sections/ + lib.ts
│   └── views/popup-view/          #   t180 拆分：子组件（TitleBar/EmptyState/...）+ lib.ts
└── shared/                        # 主/渲染共享：schemas/ types/ lib/ constants.ts
connectors/                        # 16 个内置连接器（manifest.json + connector.ts）
tests/                             # unit / integration / e2e(specs/packaged) / smoke
```

## 3. 进程与安全边界

| 边界           | 规则                                                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renderer       | `contextIsolation:true` `sandbox:true` `nodeIntegration:false` `webSecurity:true`；只调 preload 白名单；日常 `hasSecret`；设置窗可 `getSecrets` 回填明文 |
| Connector 沙箱 | `node:vm` realm，无 `require/process/fs/fetch/timer`；只有注入的 `ctx`；禁 `import/export`；15s 超时。**注意：node:vm 非真隔离**（见 §6）                |
| 主进程         | 唯一持有密钥明文、文件系统、网络、浏览器会话                                                                                                             |
| IPC sender     | `assert_valid_sender` 按 URL 协议白名单校验（`file://` 或 dev renderer URL），**不依赖 NODE_ENV**                                                        |
| LocalAPI       | 绑 `0.0.0.0`；仅 `/v1/ingest` 需 Bearer；其余 web 路由在可信 LAN 下免认证（见 `specs/web-panel.md`）                                                     |
| SSRF           | NetClient 阻断云元数据主机（169.254.169.254 / metadata.google.internal / metadata.azure.com）                                                            |

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
- **source 枚举**：`claude_code` / `opencode` / `kimi_code` / `grok`（权威定义在 `src/shared/types/token-stats.ts`）；`grok` 仅 WSL 采集（t197，数据位置与事件口径见 `domain.md` §3.2）。
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
- **批量内容搜索与轻量摘要（t239）**：`SessionHistorySubscriptionService` 提供 `searchContent`（候选 loc 集合 + 关键词 → 命中 loc key 集合）与 `summaries`（候选 loc 集合 → loc key → 首条 user 消息前 80 字符）；`searchContent` 复用提取缓存、限制并发解析数（默认 3）并支持 `AbortSignal` 协作中断，`summaries` 未缓存时调用各端 `extract_*_first_user` 轻量扫描（JSONL 从头按行、opencode 按 rowid 取 text part）避免全量提取。对应 IPC 通道 `SESSION_HISTORY_SEARCH_CONTENT` / `SESSION_HISTORY_SUMMARIES` 由 IPC 层 resolve 后批量调用，未 resolve 的 loc 被跳过；renderer `SessionLibrary` 以 300ms 防抖 + `AbortController` 取消旧查询，摘要按可见会话批量获取并合批更新。
- 工作台兜底轮询降级（t235）：renderer `WorkspaceView` 兜底全量 `query` 间隔从 5s 拉长至 30s，保留作为订阅推送丢失时的拉齐手段；活跃会话新消息仍由 watcher 2s 轮询 / `fs.watch` 推送在秒级上屏。
- 全程只读（硬约束）：服务层与提取器不开写句柄；注销 / 窗口关闭按订阅方释放 watcher / 轮询句柄。
- 历史窗口 singleton `HistoryWindowController`（对齐 `create_agent_window_controller`）：`SESSION_HISTORY_OPEN` 幂等——已开则 show+focus+定位，未开则创建并经 URL `route_query` 携带初始定位参数（renderer 启动读），`did-finish-load` 补发兜底创建窗口期丢失的定位。
- 会话源文件定位 `session-locator`：`(source, env, session_id)` → 源文件 / db 路径；WSL 用户名优先取 `tokenStats.wslUser` 显式配置，空串自动探测 `\\wsl.localhost\<distro>\home` 第一目录（对齐 collector）。

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

route `history` 渲染根组件为 `SessionShell`（单壳双页签，见 `specs/session-shell.md`），工作台页签为 `WorkspaceView`（t224 槽位模型，见 `specs/workspace.md`）。固定 52px 顶栏 = 品牌 + 居中「工作台/会话库」页签 + 用量/代理面板跳转 + 明暗主题切换；两页签常驻挂载，CSS `data-active` 显隐切换，状态不丢。

- **槽位模型**：8 槽纯函数 store（`src/renderer/lib/workspace/slots.ts`），组件内「state + 同步 ref」双维护（t211 同款批处理 stale 坑）。打开入口（onFocus/URL loc/picker/recent）统一走 `open_session` 装入；同 loc 查重防双槽、槽满 toast 拒绝、`confirm_recent` 替换前退订旧槽防 watcher 泄漏。
- **布局**：`effective_columns(layout, width)` 按 `MIN_COLUMN_WIDTH=375` 降档，`cols = min(effective_columns, 占用数)` 写 `.slot-grid --cols`；工具条三区（左最近/清空，中布局切换器，右复制/计数）。
- **设计系统**：demo 语义色 token（canvas/panel/raised/inset、subtle/strong 边框、primary/secondary/muted 文本、lime 强调、danger）作用域限定 `.session-shell`，暗色默认，`html[data-theme="light"] .session-shell` 覆盖浅色；内部桥接旧 token 名（`--win-bg/--text/--card-bg/--accent/--bg-hover/--border` 等）让会话历史样式直接继承 demo 视觉；agent 识别色 `--agent-{claude,grok,opencode,kimi,codex,cursor,aider}` 明暗两套。字体走系统等价回退，零新增资产。
- **主题独立**：`useSessionShellTheme` 与全局 `theme.ts` 解耦——session 窗口默认暗色、持久化 `localStorage omni_session_theme`、切换设 `html[data-theme]`，不写全局 `config.theme`；`useLayoutEffect` 同步应用避免 preload 首帧闪烁。
- **会话库视图（t227）**：「会话库」页签由 `SessionLibrary`（`src/renderer/components/session-library/`）渲染：搜索（默认元信息 +「包含消息内容」开关并集正文搜索，序号守卫防迟到覆盖）、agent 多选、四排序、网格/列表、加载更多分页、预览抽屉（前 5 条）、SelectionDock 批量打开（复用摘选 store 与槽位模型）。筛选/排序为纯函数 `lib/session-library/filter.ts`；勾选身份用 `source|env|id` 主键；首条用户消息摘要与内容搜索经 `sessionHistory.query` 读源文件消息（只读）。
- **会话库查询路径（t227）**：main 侧 `query_sessions` 扩展 `sources[]`（source IN）、`start_at`/`end_at`（活动时间交集 `ended_at>=start_at AND started_at<=end_at`）、`order_by`+`direction`（白名单固定 SQL 片段防注入）；renderer 会话库默认拉全量后前端过滤，扩展参数供后端能力对齐。
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
- **config-store 损坏处理（t111）**：主文件 schema 失败、空文件/仅空白字符、IO 错误等非 ENOENT 情况均不 fallback 到 `DEFAULT_CONFIGURATION`；ENOENT 时仅当配置目录不存在才返回 defaults 并允许 auto_seed，目录存在但 `config.json` 缺失视为异常抛错。`writeFileAtomic` 采用 tmp → `fsync` → `close` → `rename` 顺序，避免进程强杀后产生 null padding。
- **IPC 边界**：renderer 只能调 `window.usageboard.*` 白名单，按 route（usage/setting/tray/agent）分权。
- **会话历史 IPC 通道组（t210，决策 15）**：`SESSION_HISTORY_OPEN`（打开/聚焦历史窗口 + 定位）、`SUBSCRIBE`/`UNSUBSCRIBE`（watcher 生命周期）、`QUERY`（全量/分页）、`RECENT`（最近会话，按 ended_at 降序）、推送 `MESSAGES_UPDATED` / `FOCUS`。preload 按 route 分权（t212 三档）：`history` / `agent` 暴露全量真实 IPC；`usage`（托盘 popup / 用量面板）仅暴露 `open`（打开/聚焦窗口，订阅查询保持 noop）；其余 route 用 noop 栈。OPEN handler 在 `main/index.ts` 单点注册（fire-and-forget，无 IpcResult 包装）。
- **用量窗口宽度**：usage 窗口仅有 472px 最小宽度；floating 持久化宽度最多为所在 display 的 `workArea.width`，popup 不设固定最大宽度。

## 6. 与旧 SPEC 的关键差异 & 已知限制

代码现状**已偏离** `docs/archive/_pre_opinit_20260705/` 的旧 SPEC 与 v2 设计愿景，以下为"现在是什么"：

- **连接器执行**：旧 SPEC 说"子进程 + esbuild + SHA-256 缓存 + stdin 传 secret"；现状是 `node:vm` 同进程沙箱 + `typescript.transpileModule`，**无 esbuild、无编译缓存、无内置连接器 SHA-256 完整性清单**。
- **Tier 1 纯声明式未落地**：v2 设想简单 poll 连接器零代码；现状 16 个连接器**全部**带 `connector.ts`，`poll.map` 均为空，解析都在脚本里。
- **secret 默认进脚本**：v2 设想"明文默认不进沙箱"；现状连接器 secret 参数**全部** `exposeToScript:true`，明文经 `ctx.params` 进脚本。
- **无自适应探测/退避**：调度器固定间隔，无指数退避，`observe` 探测自适应未实现。
- **沙箱非真隔离**（已知安全限制）：`node:vm` 官方明示非安全边界，恶意脚本可 `(0,eval)("this")` 逃逸到主进程。缓解：禁 import/export、超时、能力受控。待办：`isolated-vm` 或子进程隔离。
- **导入配置可重定向端点**（已知安全限制）：`endpointOverrides` 可被导入的恶意配置改指公网攻击主机，`apply_auth` 会把 vault secret 发过去；`assert_safe_connector_host` 只拦云元数据主机。待办：改端点后强制重录 secret。
- **schemaVersion 摆设**：config 有 `schemaVersion` 字段但无版本分支迁移引擎，仅 load 时做零散字段修补。
