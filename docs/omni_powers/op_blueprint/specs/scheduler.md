<!-- omni_powers: blueprint/specs/scheduler -->

# 调度器（scheduler）

四个协作模块，各司其职。术语见 `domain.md`；运行时执行见 `connector-runtime.md`。

## 模块职责

### connector-scheduler.ts — 低层定时引擎

- 接口：`start(instanceId, intervalSeconds, {immediate?})` / `stop` / `stopAll` / `refreshNow` / `isRunning`。**无** suspend/resume/rebuild。
- 每实例 `setTimeout` 递归自调度，间隔 `max(intervalSeconds, MIN_REFRESH_INTERVAL_SECONDS=5) * 1000`。
- `start` 先 `stop`（幂等重启），除非 `immediate:false` 否则立即刷一次。
- **启动交错**：`immediate:true` 且已有其他实例运行（`timers.size > 0`）时，首次刷新加 `0 ~ STAGGER_MAX_MS(3000ms)` 随机抖动。防止多实例同时对同 host 发起 TLS 握手触发服务端限流（如 10 个 OpenCode Go → `opencode.ai`）。首个实例无抖动，立即启动。
- fire-and-forget：`void refresh(id).catch(...)`——挂死的连接器不阻塞定时循环。
- **无退避、无自适应探测**，固定间隔。

### scheduler-orchestrator.ts — 全集生命周期

- 接口：`startAll` / `rebuild` / `reconcile` / `suspend(reason)` / `resume(reason)` / `shutdown`；暂停原因是 `user | system`。
- 有效调度计划仅含 `enabled && !manualRefreshOnly` 实例，使用 `resolve_refresh_interval` 解析最终间隔，并按 `instanceId` 排序。
- `startAll` 以 `immediate:true` 应用计划；`rebuild` = `stopAll()` + 以 `immediate:false` 应用计划。
- `reconcile(previous, next)` 只比较有效调度计划；备注、endpoint、secret、参数及插件数组顺序等非调度变化不重建，实例启停、增删或有效间隔变化才重建。
- 暂停原因使用集合管理：任一原因仍存在时禁止启动 scheduler；system resume 不解除 user pause，user resume 不解除 system suspend。
- `suspend(reason)` = 记录原因 + `stopAll()` + 递增 `generation`；仅 system suspend 安装 **4 小时安全网定时器**，且安全网只解除 system 原因。
- `resume(reason)` 移除对应原因；全部原因解除后异步重载最新 config，仅当 `generation` 未变时 `startAll`（防陈旧 resume 抢跑新 suspend）。
- 暂停期间计划变化只延迟应用，不恢复周期调度；真正恢复时以最新 config 建立计划。
- `shutdown` = 递增 generation + 清 system 安全网 + `stopAll()`。
- `manualRefreshOnly` 连接器永不自动调度。

### refresh-service.ts — 单次刷新

- 接口：`refresh(instanceId, {force?})` / `refreshAll()`。
- **单实例锁**：内存 `Map<instanceId, lockedAt>`；锁定且未超 `LOCK_TIMEOUT_MS=5min` 则跳过（即使 `force` 也查锁）；陈旧锁 warn 后强清。
- **并发上限**：`refreshAll` 经 `with_concurrency(limit=5)`。
- 流程：载 config → 按 instanceId 找 config → 按 executablePath 找 definition → 置 `loading`（带 prior lastSuccess）→ 执行最多 3 次采集尝试（每次含 `execute_connector`、逐条 `ObservationStore.insert`、映射）→ 任一次成功即置 `ready`；三次均失败才置 `failed`（保留 prior lastSuccess 和最后一次错误）。相邻尝试固定等待 1s。
- **连接级错误重试**：首次尝试出现连接级错误（`ECONNRESET`/`EPROTO`/`ETIMEDOUT`/`socket hang up`/`UND_ERR_SOCKET`/`UND_ERR_CONNECT`/`tls`/`ssl`）→ 后续重试 `force_fresh_connection=true`，NetClient 向 undici 传 `{reset:true}` 跳过连接池强制新建 TCP+TLS 连接。**需连续两次连接错误才升级**（首次可能是瞬时抖动，不应立即放弃连接池复用）。非连接级错误重置连续计数。
- 事件触发再登录：session 连接器首次出现 auth 错误（消息含 401/unauthorized/token/credential/auth）且有 `sessionLogin` dep → 每轮刷新最多触发一次登录；保存成功后额外等待 2s，再进入剩余采集尝试。登录失败不提前终止通用三次尝试。

## 运行时状态存储

- **runtime-store.ts**：内存 `Map<instanceId, ConnectorSnapshotState>`，`state` = `idle | loading{lastSuccess?} | ready{items:MetricRecord[], updatedAt, badge?, chart?} | failed{error, lastSuccess?}`。`subscribe` 扇出监听；`getAll` 返回拷贝。防抖 500ms 落 `snapshot-cache`。
- **snapshot-cache.ts**：runtime 状态序列化为 JSON 数组，原子写。`idle` 跳过；`loading`/`failed` 存 `lastSuccess` 使重启仍显示上次好数据。
- **hydrate-runtime-store.ts**：启动只从 ObservationStore 恢复 `manualRefreshOnly` 连接器；自动刷新连接器故意不恢复（下次调度自会重填，非 bug）。

## 边界

- `resolve_refresh_interval`：`refreshIntervalSeconds` 哨兵 `0` → 跟随 `globalRefreshIntervalSeconds` → `DEFAULT_FALLBACK_REFRESH_SECONDS=300`。
- 启动交错 `STAGGER_MAX_MS=3000` 仅作用于 `immediate:true` 的首次刷新；后续周期调度无额外抖动（各实例间隔天然错开）。
- 托盘 refresh-all 经 `refreshService.refreshAll()` 复用 5 并发闸门（不逐个 `refresh`）。
- 暂停/恢复经托盘 `TRAY_TOGGLE_PAUSE` → orchestrator `suspend/resume`。
- `endpoint-resolver.ts` 是独立子进程 env 路径（`OMNI_PLUGIN_ENDPOINTS`/`OMNI_PLUGIN_PROXY`），**refresh-service 不用它**（override 直接经 `create_connector_context` 传）。
