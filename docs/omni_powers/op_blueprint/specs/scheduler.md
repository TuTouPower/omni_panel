<!-- omni_powers: blueprint/specs/scheduler -->

# 调度器（scheduler）

四个协作模块，各司其职。术语见 `domain.md`；运行时执行见 `connector-runtime.md`。

## 模块职责

### connector-scheduler.ts — 低层定时引擎

- 接口：`start(instanceId, intervalSeconds, {immediate?})` / `stop` / `stopAll` / `refreshNow` / `isRunning`。**无** suspend/resume/rebuild。
- 每实例 `setTimeout` 递归自调度，间隔 `max(intervalSeconds, MIN_REFRESH_INTERVAL_SECONDS=5) * 1000`。
- `start` 先 `stop`（幂等重启），除非 `immediate:false` 否则立即刷一次。
- fire-and-forget：`void refresh(id).catch(...)`——挂死的连接器不阻塞定时循环。
- **无退避、无自适应探测**，固定间隔。

### scheduler-orchestrator.ts — 全集生命周期

- 接口：`startAll` / `rebuild` / `suspend` / `resume` / `shutdown`。
- 单一共享循环 `applyEnabled(config, immediate)`：仅对 `enabled && !manualRefreshOnly` 的连接器解析间隔并 `scheduler.start`。
- `startAll` = `applyEnabled(immediate:true)`；`rebuild` = `stopAll()` + `applyEnabled(immediate:false)`。
- `suspend` = `stopAll()` + 递增 `generation` + 装 **4 小时安全网定时器**（自动 resume）。
- `resume` = 清安全网 + 异步重载 config，仅当 `generation` 未变时 `startAll`（防陈旧 resume 抢跑新 suspend）。
- `shutdown` = 递增 generation + 清定时器 + `stopAll()`。
- `manualRefreshOnly` 连接器永不自动调度。

### refresh-service.ts — 单次刷新

- 接口：`refresh(instanceId, {force?})` / `refreshAll()`。
- **单实例锁**：内存 `Map<instanceId, lockedAt>`；锁定且未超 `LOCK_TIMEOUT_MS=5min` 则跳过（即使 `force` 也查锁）；陈旧锁 warn 后强清。
- **并发上限**：`refreshAll` 经 `with_concurrency(limit=5)`。
- 流程：载 config → 按 instanceId 找 config → 按 executablePath 找 definition → 置 `loading`（带 prior lastSuccess）→ 执行最多 3 次采集尝试（每次含 `execute_connector`、逐条 `ObservationStore.insert`、映射）→ 任一次成功即置 `ready`；三次均失败才置 `failed`（保留 prior lastSuccess 和最后一次错误）。相邻尝试固定等待 1s。
- 事件触发再登录：session 连接器首次出现 auth 错误（消息含 401/unauthorized/token/credential/auth）且有 `sessionLogin` dep → 每轮刷新最多触发一次登录；保存成功后额外等待 2s，再进入剩余采集尝试。登录失败不提前终止通用三次尝试。

## 运行时状态存储

- **runtime-store.ts**：内存 `Map<instanceId, ConnectorSnapshotState>`，`state` = `idle | loading{lastSuccess?} | ready{items:MetricRecord[], updatedAt, badge?, chart?} | failed{error, lastSuccess?}`。`subscribe` 扇出监听；`getAll` 返回拷贝。防抖 500ms 落 `snapshot-cache`。
- **snapshot-cache.ts**：runtime 状态序列化为 JSON 数组，原子写。`idle` 跳过；`loading`/`failed` 存 `lastSuccess` 使重启仍显示上次好数据。
- **hydrate-runtime-store.ts**：启动只从 ObservationStore 恢复 `manualRefreshOnly` 连接器；自动刷新连接器故意不恢复（下次调度自会重填，非 bug）。

## 边界

- `resolve_refresh_interval`：`refreshIntervalSeconds` 哨兵 `0` → 跟随 `globalRefreshIntervalSeconds` → `DEFAULT_FALLBACK_REFRESH_SECONDS=300`。
- 暂停/恢复经托盘 `TRAY_TOGGLE_PAUSE` → orchestrator `suspend/resume`。
- `endpoint-resolver.ts` 是独立子进程 env 路径（`OMNI_PLUGIN_ENDPOINTS`/`OMNI_PLUGIN_PROXY`），**refresh-service 不用它**（override 直接经 `create_connector_context` 传）。
