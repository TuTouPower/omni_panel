# Round 7: Scheduler / Runtime Store 实现

> 日期：2026-05-24
> 依赖：Round 6（config/cache/paths）
> 产出：runtime-store + plugin-scheduler + refresh-service + 全部测试通过

---

## 目标

实现刷新调度、运行时状态机和缓存命中逻辑。将 parser、runner、config、cache 串联为完整的插件刷新流程。不涉及 UI、IPC。

---

## 交付物

### 1. scheduler/runtime-store.ts

```typescript
export type PluginSnapshotState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | {
      readonly status: "ready";
      readonly items: readonly UsageItem[];
      readonly updatedAt: Date;
      readonly badge?: string;
      readonly chart?: PluginChart;
    }
  | {
      readonly status: "failed";
      readonly error: string;
      readonly lastSuccess?: PluginCachedState;
    };

export interface RuntimeStoreListener {
  onStateChange(instanceId: string, state: PluginSnapshotState): void;
}

export interface RuntimeStore {
  getSnapshot(instanceId: string): PluginSnapshotState;
  updateState(instanceId: string, state: PluginSnapshotState): void;
  getAll(): ReadonlyMap<string, PluginSnapshotState>;
  subscribe(listener: RuntimeStoreListener): () => void;
  removeInstance(instanceId: string): void;
}
```

实现逻辑：
- 内部用 `Map<string, PluginSnapshotState>` 存储
- `getSnapshot`：不存在返回 `{ status: "idle" }`
- `updateState`：更新 map，通知所有 listener
- `subscribe`：返回 unsubscribe 函数
- `removeInstance`：从 map 中删除

状态转换规则：

```
idle → loading（开始刷新）
loading → ready（刷新成功）
loading → failed（刷新失败）
ready → loading（再次刷新）
failed → loading（重试）
ready → idle（手动重置）
failed → idle（手动重置）
```

`failed` 状态的 `lastSuccess`：
- 如果之前有 `ready` 状态，从 cache-store 加载上次成功数据
- 如果从未成功过，`lastSuccess` 为 undefined

### 2. scheduler/plugin-scheduler.ts

```typescript
export interface SchedulerDependencies {
  refreshService: PluginRefreshService;
  configStore: AppConfigStore;
}

export interface PluginScheduler {
  start(instanceId: string, intervalSeconds: number): void;
  stop(instanceId: string): void;
  stopAll(): void;
  refreshNow(instanceId: string): void;
  isRunning(instanceId: string): boolean;
}
```

实现逻辑：
- 内部用 `Map<string, { timer: NodeJS.Timeout; interval: number }>` 管理
- `start`：
  1. 如果已在运行，先 stop
  2. `interval = max(intervalSeconds, 5)`（最小 5 秒）
  3. 创建 `setInterval`，每次触发 `refreshService.refresh(instanceId)`
  4. 立即执行一次首次刷新
- `stop`：`clearInterval`，从 map 中移除
- `stopAll`：遍历 stop 所有
- `refreshNow`：
  1. 立即触发 `refreshService.refresh(instanceId, { force: true })`
  2. 不重建 timer（timer 继续按原间隔运行）
- `isRunning`：检查 map 中是否存在

防并发：
- refresh-service 内部处理并发锁
- scheduler 只负责触发，不负责并发控制

### 3. scheduler/refresh-service.ts

```typescript
export interface RefreshServiceDependencies {
  runner: typeof executePlugin;
  outputParser: typeof parsePluginOutput;
  commandBuilder: typeof buildPluginCommand;
  cacheStore: CacheStore;
  runtimeStore: RuntimeStore;
  configStore: AppConfigStore;
  secretsStore: SecretsStore;
}

export interface PluginRefreshService {
  refresh(instanceId: string, options?: { force?: boolean }): Promise<void>;
  refreshAll(): Promise<void>;
}
```

实现逻辑（refresh）：

```
1. 获取锁：如果 instanceId 正在 refresh，忽略（返回）
2. 从 configStore 加载配置，找到对应 PluginConfiguration
3. 从 cacheStore 加载缓存
4. 缓存检查：
   - 有缓存 && 未过期 && !force → 更新 runtimeStore 为缓存数据，返回
5. runtimeStore → { status: "loading" }
6. 检查 required 参数：
   - 从 metadata.parameters 获取 required: true 的参数
   - 检查 parameterValues 中是否有非空值
   - 缺少 → runtimeStore → { status: "failed", error: "Missing required parameters" }，返回
7. buildPluginCommand(executablePath, parameterValues, language)
8. executePlugin(command, { timeoutMs: 15000 })
9. 处理结果：
   a. exitCode === 0:
      - parsePluginOutput(stdout)
      - 成功 → cacheStore.save() → runtimeStore → { status: "ready", ... }
      - 解析失败 → runtimeStore → { status: "failed", error: parseErrorMessage }
   b. exitCode !== 0:
      - error = stderr || `Process exited with code ${exitCode}`
      - runtimeStore → { status: "failed", error }
10. 失败时：
    - 尝试从 cacheStore 加载上次成功数据
    - 设置 lastSuccess（如果有）
11. 释放锁
```

缓存过期判断：

```typescript
function isCacheExpired(cached: PluginCachedState, intervalSeconds: number): boolean {
  const interval = Math.max(intervalSeconds, 5);
  const elapsed = (Date.now() - new Date(cached.updatedAt).getTime()) / 1000;
  return elapsed > interval;
}
```

`refreshAll`：
- 从 configStore 获取所有 enabled 的插件
- 对每个执行 `refresh`（不要求全部完成，独立处理错误）
- 并发策略：全部并发（`Promise.allSettled`），每个插件独立错误隔离

---

## 测试计划

### tests/integration/scheduler/runtime-store.test.ts

| 测试用例 | 预期 |
|---------|------|
| 初始状态为 idle | getSnapshot 返回 { status: "idle" } |
| idle → loading → ready 转换 | 状态正确更新 |
| idle → loading → failed 转换 | 状态正确更新，error 有值 |
| failed 保留 lastSuccess | 先 ready 再 failed，lastSuccess 有值 |
| subscribe 收到通知 | updateState 后 listener 被调用 |
| unsubscribe 停止通知 | 取消后不再收到通知 |
| getAll 返回所有状态 | 包含所有已更新的 instanceId |

### tests/integration/scheduler/plugin-scheduler.test.ts

| 测试用例 | 预期 |
|---------|------|
| start 后立即触发一次 | refresh 被调用 1 次 |
| interval 触发 | 等待 interval 后 refresh 被再次调用 |
| stop 停止触发 | stop 后不再调用 |
| refreshNow 立即触发 | force=true 的 refresh 被调用 |
| 最小间隔 5 秒 | intervalSeconds=2 时实际间隔为 5 |
| stopAll 停止所有 | 所有 timer 被清除 |

使用 fake timer（`vi.useFakeTimers()`）避免真实等待。

### tests/integration/scheduler/refresh-service.test.ts

| 测试用例 | 预期 |
|---------|------|
| cache hit 跳过执行 | 有未过期缓存时 runner 不被调用 |
| cache miss 执行插件 | 无缓存时 runner 被调用 |
| 成功更新 cache + runtime | runner 成功后 cache-store.save 被调用，runtimeStore 为 ready |
| 失败保留旧 cache | runner 失败且有旧缓存时，runtimeStore.lastSuccess 有值 |
| force 跳过 cache | force=true 时即使有缓存也执行 |
| timeout 处理 | PluginTimeoutError → runtimeStore 为 failed |
| required 参数为空 | 不执行，runtimeStore 为 failed |
| 防并发 | 同时调用两次 refresh，runner 只被调用一次 |
| refreshAll 遍历所有 | 所有 enabled 插件的 refresh 被调用 |

mock 策略：
- runner、configStore、cacheStore、secretsStore 全部 mock
- runtimeStore 用真实实现（纯内存）
- 使用 `vi.fn()` 和 `vi.useFakeTimers()`

---

## 精确行为约束

| 场景 | 行为 |
|------|------|
| 插件从未成功过 + 失败 | lastSuccess 为 undefined |
| 插件曾成功 + 失败 | lastSuccess 包含上次成功数据 |
| cache 未过期 | 跳过执行，直接用缓存更新 runtime |
| cache 已过期 | 执行插件 |
| 同一 instanceId 并发 refresh | 忽略第二次请求 |
| disabled 插件 | refreshAll 跳过，不刷新 |
| refresh interval < 5s | 实际使用 5s |
| refresh interval 未设置 | 使用默认 300s |

---

## 不实现

- sleep/wake 系统活动感知：本轮只定义 `SystemEventBus` 接口（`onSleep`/`onWake`），不实现 Electron `powerMonitor` 绑定。接口放 `scheduler/types.ts`，实现留 Round 8+。
- UI / IPC
- 插件发现
- 多实例 UI

---

## 验收标准

- [ ] `pnpm test` 全部通过
- [ ] `pnpm check` 全绿
- [ ] 明确状态机：idle / loading / ready / failed
- [ ] 同一插件并发 refresh 被拒绝
- [ ] cache hit 跳过执行
- [ ] 失败保留旧 cache（lastSuccess）
- [ ] 区分手动刷新（force）和自动刷新
- [ ] 使用 fake timer，不靠真实 sleep
- [ ] min interval 5s 强制执行
- [ ] refreshAll 使用 `Promise.allSettled`，独立错误隔离
- [ ] SystemEventBus 接口已定义但不实现

## 文件清单

### 新增文件

```
tests/integration/scheduler/runtime-store.test.ts
tests/integration/scheduler/plugin-scheduler.test.ts
tests/integration/scheduler/refresh-service.test.ts
```

### 修改文件

```
src/main/core/scheduler/runtime-store.ts（实现）
src/main/core/scheduler/plugin-scheduler.ts（实现）
src/main/core/scheduler/refresh-service.ts（实现）
src/main/core/scheduler/types.ts（SystemEventBus 接口）
```

### 不允许修改

```
src/shared/schemas/*（Round 4 已冻结）
src/main/core/plugin/*（Round 4-5 已完成）
src/main/core/config/*（Round 6 已完成）
src/main/core/cache/*（Round 6 已完成）
src/main/core/paths.ts（Round 6 已完成）
fixtures/*
docs/*
```

---

## 下一轮建议

Round 8：实现 IPC / preload（将 main process 能力安全暴露给 renderer）
