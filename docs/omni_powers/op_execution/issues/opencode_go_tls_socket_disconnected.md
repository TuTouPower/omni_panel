# OpenCode Go 采集失败：TLS socket disconnected（并发握手风暴）

**日期**: 2026-07-17
**状态**: 待修复（根因已定位）
**Provider**: `opencode_go`
**错误串**: `Client network socket disconnected before secure TLS connection was established`

## 现象

总览页 OpenCode Go 卡片频繁显示「采集失败」，9 账号场景高发。前次 commit `903653d`（账号间定时首刷 jitter + 连接错误后 reset 重试）已修一次，未根治，仍经常复发。

## 根因

错误本质：**新建 TLS 连接、握手未完成即被对端 RST**。指向服务端（opencode.ai CDN/边缘）对**同一出口 IP 短时间内过多新握手**的连接级限流。本地存在四层并发放大，`903653d` 只覆盖了其中一层。

| #   | 放大层                            | 位置                                                                           | 说明                                                                                                                                                                  |
| --- | --------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 无全局连接池上限                  | `src/main/core/connector/net-client.ts`（无 `setGlobalDispatcher`）            | undici 默认 Agent 每 origin `connections` 无上限，每请求各自新建 TLS 连接不复用                                                                                       |
| 2   | 单账号 bundle 扇出无节流          | `connectors/opencode_go/connector.ts:209-213`                                  | N（十几~数十）个 JS bundle 裸 `Promise.all` 一次性并发打向 `opencode.ai`。**最大真凶**，jitter 管不到                                                                 |
| 3   | 手动刷新绕过 jitter               | `PopupView.tsx:370`、`src/main/index.ts:611-621`、`refresh-service.ts:400-409` | provider「重试」/顶部刷新/托盘 refresh-all 直接调 `refreshService.refresh`/`refreshAll`，不经 `connector-scheduler`。provider 级重试连 refreshAll 的 5 并发闸门都绕过 |
| 4   | 首刷恒不 reset + 重试全账号 reset | `refresh-service.ts:241-347`                                                   | 首刷风暴时机（最易 RST）恒 `reset:false`；一旦触发重试，整账号 2+N 请求**全部** `reset:true` 强制新握手，治标手段自我放大                                             |

**并发量级**：单账号一次 refresh = `/auth`(1) + workspace/go(2 并发) + bundle(N 并发) + server(1)，瞬时对同一 origin 发起 2+N 个握手。× 9 账号几乎同时触发 → 远超「9」。

**修正一处误判**：`is_connection_error`（`refresh-service.ts:65-77`）**不漏匹配**该错误串——串含 "secure **TLS** connection"，`lower.includes("tls")` 命中，重试正常触发。问题在并发放大，不在匹配。

## 关键代码地图

- 连接器脚本：`connectors/opencode_go/connector.ts`（扇出 `:203-213`，`extract_assets` `:40-48`）
- manifest：`connectors/opencode_go/manifest.json`（endpoint `default: https://opencode.ai`）
- 网络层：`src/main/core/connector/net-client.ts`（undici `request`+`ProxyAgent` `:4`；dispatcher `:200`；默认超时 15s `:201`；reset 注入 `:241`/`:356`）
- 刷新主逻辑：`src/main/core/scheduler/refresh-service.ts`（重试循环 `:245` max=3；连接错误检测 `:65-77`；reset 升级 `:341-347`；`with_concurrency` `:382-398` 私有闭包）
- 定时首刷 jitter：`src/main/core/scheduler/connector-scheduler.ts`（`STAGGER_MAX_MS=3000` `:4`；`has_peers` `:34`）
- 手动刷新链：`PopupView.tsx:358-393`（provider 重试）/ `:342-356`（刷新全部）；IPC `connector-ipc.ts:149-176`；托盘 `index.ts:611-621`
- 常量：`src/shared/constants.ts:2`（`MIN_REFRESH_INTERVAL_SECONDS=5`）

## 修复方案（全面加固）

### Fix 1 —— host 层全局连接池上限 + keepAlive 复用（根治）

**文件**：`net-client.ts`、`src/main/index.ts`、`src/shared/constants.ts`

- 建全局 undici `Agent`，设 `connections`（每 origin 上限，建议 **6**）+ `keepAliveTimeout` 让连接复用而非每次新握手。
- 主进程启动早期（早于任何 refresh）`setGlobalDispatcher(global_agent)` 一次。
- 有 proxy 时 `ProxyAgent` 同样传 `connections` 上限，保持一致。
- 常量入 `src/shared/constants.ts`。

> 连接复用后单账号 2+N 请求复用 ≤6 条已建 TLS 连接，握手从「每请求一次」降到「每 origin 几次」，直接消除风暴。

### Fix 2 —— 连接器 bundle 扇出节流

**文件**：`connectors/opencode_go/connector.ts:209-213`

- 裸 `Promise.all` → 有上限并发闸门（建议 4~6）。脚本沙箱拿不到 host `with_concurrency`，内联一个 ~12 行 `map_with_limit(items, limit, fn)`（`Promise.race` 闸门），脚本自包含。
- 跨两页 `extract_assets` 结果去重（`Set`）。

### Fix 3 —— 手动刷新路径统一走节流

**文件**：`refresh-service.ts`、`PopupView.tsx:370`、`index.ts:611`

- provider 级重试（`PopupView.tsx:358-393` 的 `Promise.all`）→ 串行或经 host 侧 `refreshMany(ids)` IPC，内部 `with_concurrency` + 账号间小 jitter。
- 托盘 refresh-all（`index.ts:611-621`）→ 改调 `refreshService.refreshAll()` 复用 5 并发闸门。
- `refreshAll` 5 并发保留，批内账号间加 jitter（复用 `STAGGER_MAX_MS` 语义）。

### Fix 4 —— reset 升级策略与连接复用对齐

**文件**：`refresh-service.ts:241-347`

- 默认 `reset:false` 让请求复用连接池（正确方向）；仅在**连续两次**连接错误后才升级 `reset:true`（当前第一次连接错误即全账号 reset，与复用冲突）。
- 确认 undici 全局 Agent 对 `reset:true` 请求仍受 `connections` 上限约束（reset 跳过 keepAlive 复用但应走 Agent 连接数闸门）；若不受约束，给 reset 请求也套并发上限。实现时用 context7 查 undici Agent + reset 交互行为为准。

## 涉及文件清单

| 文件                                         | 改动                                                             |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `src/shared/constants.ts`                    | 新增连接池/节流常量                                              |
| `src/main/core/connector/net-client.ts`      | 全局 Agent 定义+导出；proxy 分支加 connections                   |
| `src/main/index.ts`                          | 启动早期 `setGlobalDispatcher`；托盘 refresh-all 改调 refreshAll |
| `connectors/opencode_go/connector.ts`        | bundle 扇出节流 + 跨页去重                                       |
| `src/main/core/scheduler/refresh-service.ts` | refreshAll 批内 jitter；reset 升级策略；（可选）导出 refreshMany |
| `src/renderer/views/PopupView.tsx`           | provider 级重试改走节流路径                                      |
| `src/main/ipc/connector-ipc.ts`              | （若加 refreshMany）新增 IPC handler                             |

> `connectors/opencode_go/` 与打包产物 `artifacts/win-unpacked/resources/connectors/opencode_go/` 是两份；改源，打包重新拷贝，不手动动 artifacts。

## 回归测试

当前 refresh-service、connector-scheduler、连接池均无专属单测，需新增：

1. `tests/integration/connector/net-client.test.ts`（补）：全局 Agent 生效后对同 origin M 并发请求实际建连数 ≤ `connections`（本地 HTTP server 计 socket）。
2. `tests/unit/connector/opencode_go.test.ts`（补）：mock 大量 asset_paths，断言 bundle 请求并发峰值 ≤ 节流上限。
3. `tests/unit/scheduler/refresh-service.test.ts`（新建）：refreshAll 批内 jitter；reset 升级（首次不 reset、连续错误才 reset）。
4. `tests/unit/scheduler/connector-scheduler.test.ts`（新建）：jitter 仅 `has_peers` 时施加，回归锁定。

命令：`pnpm test`。

## 端到端验证（产物级）

1. `pnpm build && pnpm package` 打真实产物 `artifacts/win-unpacked/OmniUsage.exe`。
2. 启动产物，9 账号连续多轮定时刷新 + 手动「重试」+ 顶部「刷新全部」+ 托盘 refresh-all，**不再出现 TLS socket disconnected**。
3. 主进程 net-client debug 日志确认单 origin 连接数压在上限内、bundle 请求分批。
4. 断网/限速下手动触发，确认重试与 stale 显示仍正常（不回归 invariant 2）。

## 文档同步

- `docs/omni_powers/op_blueprint/specs/scheduler.md` — 更新「启动交错/连接级重试」，补手动刷新节流 + reset 升级。
- `docs/omni_powers/op_blueprint/specs/connector-runtime.md` — 补「全局连接池上限 / keepAlive 复用」「连接器脚本扇出节流约定」。
