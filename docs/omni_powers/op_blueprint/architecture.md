<!-- omni_powers: blueprint/architecture -->

# OmniUsage 架构

本文是**技术栈、目录结构、模块划分、数据流、跨模块契约的唯一真相源**。命名/编码风格见 `conventions.md`；业务不变量与术语见 `domain.md`；测试见 `test.md`。

## 1. 技术栈

| 领域           | 选型                                                                   | 说明                                                                          |
| -------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 运行时         | **Electron 42**                                                        | `session` 能力（受控登录窗、webRequest 捕获、持久化分区）要求可编程浏览器引擎 |
| 语言           | **TypeScript 5.9**                                                     | 严格模式；主/预加载/渲染/共享四区共用                                         |
| 构建           | **electron-vite 5** + **Vite 5**                                       | dev/build；`out/main` `out/preload` `out/renderer`                            |
| 打包           | **electron-builder 26**                                                | Windows/macOS/Linux；连接器目录随 `extraResource` 进 `resources/connectors`   |
| UI             | **React 19** + **Tailwind CSS 4** + lucide-react + clsx/tailwind-merge | 渲染进程                                                                      |
| 校验           | **Zod 4**                                                              | manifest / observation / config / plugin-output 四处运行时 schema             |
| 观测存储       | **better-sqlite3 12**                                                  | 同步 API，WAL 模式，单文件 `usage.db`                                         |
| HTTP           | **undici 8**                                                           | 宿主统一出口 NetClient，ProxyAgent 支持代理                                   |
| 连接器脚本编译 | **TypeScript `transpileModule`**                                       | 非 esbuild；无 SHA-256 缓存（见下"与旧 SPEC 差异"）                           |
| 测试           | Vitest 3 + Playwright + jsdom + Testing Library                        | 见 `test.md`                                                                  |
| 质量门         | eslint 9 / prettier / knip（deadcode）/ dependency-cruiser（arch）     | `pnpm check` 聚合                                                             |

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
│   │   │   ├── refresh-service.ts         # 单次刷新：锁/并发/执行/写库/映射
│   │   │   ├── runtime-store.ts / snapshot-cache.ts / hydrate-runtime-store.ts
│   │   │   └── observation-mapping.ts     # Observation → MetricRecord
│   │   ├── observation/observation-store.ts  # SQLite（见 specs/observation-store.md）
│   │   ├── config/                # config-store / secrets-store / auto-seed / types
│   │   ├── vault/                 # file-vault-backend + VaultBackend 接口
│   │   ├── session/session-manager.ts        # 登录窗 + cookie 捕获
│   │   ├── local-api/server.ts    # 127.0.0.1 ingest + health
│   │   ├── main-panel/            # 托盘弹出/悬浮窗控制 + floating-bounds
│   │   ├── popup/popup-height-controller.ts  # 动态高度纯函数
│   │   ├── auth/grok_oauth_manager.ts          # Grok device-code OAuth + token rotation
│   │   ├── network/effective_proxy.ts           # configured/detected proxy 运行时合并
│   │   ├── logging.ts / paths.ts / settings-close-action.ts
│   ├── ipc/                       # 按域拆的 IPC handler（见 specs/ipc.md）
│   └── window/window-manager.ts   # 窗口目录 + 工厂（见 specs/window-management.md）
├── preload/                       # contextBridge 白名单 + route capability 策略
├── renderer/                      # React：views/ components/ hooks/ lib/
└── shared/                        # 主/渲染共享：schemas/ types/ lib/ constants.ts
connectors/                        # 12 个内置连接器（manifest.json + connector.ts）
tests/                             # unit / integration / user_e2e / packaged_smoke
docs/design/omni-usage/            # 前端 UI 设计 demo（历史设计参考）
```

## 3. 进程与安全边界

| 边界           | 规则                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Renderer       | `contextIsolation:true` `sandbox:true` `nodeIntegration:false` `webSecurity:true`；只调 preload 白名单；只拿 `hasSecret` 布尔             |
| Connector 沙箱 | `node:vm` realm，无 `require/process/fs/fetch/timer`；只有注入的 `ctx`；禁 `import/export`；15s 超时。**注意：node:vm 非真隔离**（见 §6） |
| 主进程         | 唯一持有密钥明文、文件系统、网络、浏览器会话                                                                                              |
| IPC sender     | `assert_valid_sender` 按 URL 协议白名单校验（`file://` 或 dev renderer URL），**不依赖 NODE_ENV**                                         |
| LocalAPI       | 仅 `127.0.0.1`，Bearer token，只 ingest+health，非通用代理                                                                                |
| SSRF           | NetClient 阻断云元数据主机（169.254.169.254 / metadata.google.internal / metadata.azure.com）                                             |

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

外部 producer 可 `POST /v1/ingest`（Bearer）直接写观测，`source` 按 producer 标记。

## 5. 跨模块契约

- **观测契约**：脚本产出 `script_observation_schema`（snake_case，无 `source_instance_id`）；宿主 extend 出 `observation_schema`。字段语义见 `specs/observation-store.md`。
- **instance identity 归宿主**：脚本运行时发现 account/metric，但不知自己在哪个实例下；`source_instance_id` 只由 `refresh-service` 盖，防同 provider 多实例在下游 collapse。
- **vault 命名空间**：`keyFor(instanceId, name) = ${instanceId}:${name}`，`secrets-store` / `session-manager` / `net-client` 均经此，不内联拼接。
- **endpoint 解析优先级**：用户 `endpointOverrides` > manifest `endpoints`；`requireExplicitEndpoints` 为真时无 override 即报错（CPA 用）。
- **IPC 边界**：renderer 只能调 `window.usageboard.*` 白名单，按 route（popup/settings/tray）分权。

## 6. 与旧 SPEC 的关键差异 & 已知限制

代码现状**已偏离** `docs/archive/_pre_opinit_20260705/` 的旧 SPEC 与 v2 设计愿景，以下为"现在是什么"：

- **连接器执行**：旧 SPEC 说"子进程 + esbuild + SHA-256 缓存 + stdin 传 secret"；现状是 `node:vm` 同进程沙箱 + `typescript.transpileModule`，**无 esbuild、无编译缓存、无内置连接器 SHA-256 完整性清单**。
- **Tier 1 纯声明式未落地**：v2 设想简单 poll 连接器零代码；现状 12 个连接器**全部**带 `connector.ts`，`poll.map` 均为空，解析都在脚本里。
- **secret 默认进脚本**：v2 设想"明文默认不进沙箱"；现状连接器 secret 参数**全部** `exposeToScript:true`，明文经 `ctx.params` 进脚本。
- **无自适应探测/退避**：调度器固定间隔，无指数退避，`observe` 探测自适应未实现。
- **沙箱非真隔离**（已知安全限制）：`node:vm` 官方明示非安全边界，恶意脚本可 `(0,eval)("this")` 逃逸到主进程。缓解：禁 import/export、超时、能力受控。待办：`isolated-vm` 或子进程隔离。
- **导入配置可重定向端点**（已知安全限制）：`endpointOverrides` 可被导入的恶意配置改指公网攻击主机，`apply_auth` 会把 vault secret 发过去；`assert_safe_connector_host` 只拦云元数据主机。待办：改端点后强制重录 secret。
- **schemaVersion 摆设**：config 有 `schemaVersion` 字段但无版本分支迁移引擎，仅 load 时做零散字段修补。
