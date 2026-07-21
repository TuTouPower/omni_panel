# ai-cli-token-stats-desktop

> 验证方式：Desktop。拆自 ai-cli-token-stats（t037）。

本地 AI CLI Token 统计的桌面进程层：主进程通过 `utilityProcess.fork` 拉起采集子进程、管理生命周期与自动重启熔断、把子进程产出写入 `token_stats_*` 表、暴露渲染端 IPC handler 与 LocalAPI 端点、注册独立窗口与托盘菜单入口。不含数据模型 / reader / 聚合（见 `-api`），不含 React 组件（见 `-ui`）。

## 1. 子进程架构

### 1.1 进程模型

```
Electron 主进程
  │  app.whenReady() 时 fork
  │
  ├── token-stats 子进程 (Electron utilityProcess.fork)
  │     │
  │     ├─ 启动时立即执行一次采集
  │     ├─ setInterval(10 分钟) 定时采集
  │     │
  │     ├─ 每次采集：
  │     │   ├─ 读 costs.jsonl（增量 offset）
  │     │   ├─ 遍历 session JSONL（增量 mtime）
  │     │   ├─ 查询 opencode.db（增量 time_updated）
  │     │   ├─ 聚合为 { sessions, daily, records }
  │     │   └─ parentPort.postMessage({ type: "token_stats_update", ... })
  │     │
  │     └─ parentPort.on("message") 接收配置更新
  │
  └─ 收到 IPC → 写入 token_stats_* 表 → 广播事件到渲染端
```

采集逻辑（reader、聚合、TokenStatsUpdate payload）见 `-api`。

### 1.2 为什么用 `utilityProcess.fork` 而非 `child_process.fork`

打包后应用将 `runAsNode` fuse 设为 false，禁用 `ELECTRON_RUN_AS_NODE`，`child_process.fork` 会静默失败。`utilityProcess` 是 Electron 官方子进程 API，不受 fuse 影响（见 `src/main/core/token-stats/manager.ts:60-66`）。

### 1.3 子进程优势

- Electron 主进程保持轻量，IO 密集操作不阻塞 UI
- utilityProcess 提供 Node.js 运行时，直接用 `better-sqlite3`
- 进程隔离：子进程崩溃不影响主进程（manager 内置 30s 自动重启 + 快速崩溃熔断，连续 5 次 5 分钟内退出则停止重启）
- 生命周期清晰：app 启动 fork，退出 kill

只读保证（不 import 写入工具、SQLite readonly 打开）见 `-api` §4。

## 2. 主进程 IPC 与消息约束

### 2.1 子进程 → 主进程

子进程完成采集后通过 `parentPort.postMessage` 发送 `TokenStatsUpdate`（类型定义见 `-api` §6.5）。主进程收到后按 `-api` §6.1 分层策略写入 `token_stats_*` 表，然后广播 `TOKEN_STATS_UPDATED` 事件到渲染端。

### 2.2 消息大小上限

sessions ≤ 10,000，daily ≤ 50,000，records ≤ 200,000（见 `src/main/core/token-stats/collector.ts:18`）。任一超出 warn 日志截断并停止本轮采集，避免 `postMessage` JSON 序列化阻塞事件循环。

### 2.3 渲染端 IPC handler

`src/main/ipc/token-stats-ipc.ts` 新建：渲染端 IPC handler，对应 `TOKEN_STATS_*` channels（buckets / sessions / records / status / updated / open）。`src/shared/types/ipc.ts` 扩展 channel 常量；`src/preload/index.ts` 暴露 `tokenStats` API 给渲染端。

LocalAPI HTTP 端点契约（`/v1/buckets` / `/v1/sessions` / `/v1/records` / `/v1/status`）见 `-api` §7；本地实现由 `token-stats-ipc.ts` 与 LocalAPI 桥接承担。

## 3. 窗口与入口

### 3.1 入口

类似 settings 窗，独立窗口：

- 从托盘菜单打开（新增「代理面板」菜单项）
- 从 PopupView 顶部按钮打开（新增图标按钮）
- 窗口配置：`WINDOW_CONFIGS` 新增 `tokenStats` 条目（`src/main/window/window-manager.ts` 扩展）

### 3.2 自动重启 + 熔断

- manager 内置 30s 自动重启。
- 快速崩溃熔断：连续 5 次 5 分钟内退出则停止重启。

## 4. 涉及文件清单（桌面进程层）

| 文件                                   | 改动                                            | Task |
| -------------------------------------- | ----------------------------------------------- | ---- |
| `src/main/core/token-stats/manager.ts` | 新建：主进程侧 utilityProcess.fork / IPC / 写表 | 4.3  |
| `src/main/index.ts`                    | 扩展：启动 token-stats manager                  | 4.3  |
| `src/shared/types/ipc.ts`              | 扩展：TOKEN_STATS IPC channels                  | 5.1  |
| `src/main/ipc/token-stats-ipc.ts`      | 新建：渲染端 IPC handler                        | 5.1  |
| `src/preload/index.ts`                 | 扩展：暴露 tokenStats API                       | 5.1  |
| `src/main/window/window-manager.ts`    | 扩展：新增 tokenStats 窗口配置                  | 5.2  |

`collector.ts`（子进程入口与聚合）见 `-api`；`TokenStatsView.tsx` 与组件见 `-ui`。

## 5. 明确不做（本版，桌面进程层）

- **不做** 文件 watcher（仅 10 分钟定时）
- **不做** 实时流式监控
- **不做** `child_process.fork`（fuse 禁用，用 `utilityProcess.fork`）

## 6. 成功标准（Desktop 验证）

| #   | 标准                                                | 验证方式 |
| --- | --------------------------------------------------- | -------- |
| 4   | 子进程 10 分钟自动采集，主进程收到数据并写入 SQLite | 日志验证 |
| 9   | 子进程崩溃后主进程自动重启子进程，不丢数据          | 手工模拟 |
| 10  | 全量测试 `pnpm test` 通过                           | CI       |

#10 跨层（含 `-api` / `-ui`），由 CI 整体保证；门禁入口归本层。

## 7. 实施顺序（桌面进程层）

| Task | Commit 前缀                                 | 内容                                                                                                                                | 前置     |
| ---- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 4.3  | `feat(token-stats): add manager`            | `src/main/core/token-stats/manager.ts` — 主进程侧：fork、接收 IPC、写入 token-stats-store、广播事件。`index.ts` 启动 init。集成测试 | 1.2, 4.2 |
| 5.1  | `feat(token-stats): add IPC and preload`    | `ipc.ts` 新增 `TOKEN_STATS_*` channels。`token-stats-ipc.ts` handler。`preload/index.ts` 暴露 API                                   | 4.3      |
| 5.2  | `feat(token-stats): add token stats window` | `window-manager.ts` 新增 `tokenStats` 配置。托盘菜单新增入口。路由注册                                                              | 5.1      |

前置 1.1 / 1.2 / 4.1 / 4.2 见 `-api`；后置 5.3–5.5 见 `-ui`。

### 依赖总览（全链路）

```
(api: 1.1 → 1.2) ─────────────→ 4.3 → 5.1 → 5.2 → (ui: 5.3 → 5.4 → 5.5)
                                    ↑
(api: 2.1 → 2.2, 3.1/3.2 → 4.1 → 4.2 → 6.1)
```
