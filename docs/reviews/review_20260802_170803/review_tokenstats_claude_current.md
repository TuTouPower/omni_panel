# tokenstats 审阅报告

- 本路模型标识：Claude current（具体模型 ID 未知）
- 基线：`fd910318fab9cdc0e025bdbdf02db51d0c0cc4a7`
- 审阅范围：`src/renderer/lib/token-stats/query-cache.ts`、`src/renderer/views/TokenStatsView.tsx` 及对应测试文件
- 仅做只读 diff 审阅，未运行构建或测试。

## 高优先级

### 1. 初始配置读取可能覆盖较新的配置广播

- 状态：CONFIRMED
- 严重度：中高
- 位置：`D:\Dev\Code\omni_usage_t190\src\renderer\views\TokenStatsView.tsx:442-447`
- Summary：配置初始化请求只用 `active` 判断组件是否卸载，没有版本号或“配置广播已到达”标记。
- 输入状态 → 坏结果：组件挂载后 `config.get()` 长时间 pending；期间收到包含新别名的 `onConfigChange` 并显示新别名；随后旧的 `config.get()` 响应返回且组件仍挂载 → `.then` 调用 `apply_config_aliases(config)`，旧别名覆盖新别名。
- 影响：图表项目/模型别名回退到旧配置，直到下一次配置广播或重新打开页面。新增测试“does not let an older config read overwrite a newer config event”按当前实现会失败。
- 建议：为初始读取维护递增版本/请求序号；配置事件到达时使初始读取失效，或比较读取开始时的配置版本后再应用。

## 中低优先级

### 2. `getStatus()` 拒绝会产生未处理 Promise rejection

- 状态：CONFIRMED
- 严重度：中
- 位置：`D:\Dev\Code\omni_usage_t190\src\renderer\views\TokenStatsView.tsx:407-410`
- Summary：状态请求从 `loadData` 的 `await` 链移出后，以 `void load_status().then(...)` 启动，但没有 rejection handler；外层 `try/catch` 无法捕获异步回调中的拒绝。
- 输入状态 → 坏结果：数据查询全部成功，随后 `tokenStats.getStatus()` 因 IPC/网络错误 reject → 页面日志不记录该错误，并触发全局未处理 Promise rejection；`status` 不更新。
- 影响：开发环境测试可能因 unhandled rejection 失败，生产环境产生未处理错误噪音；与原先 Promise.all 失败统一进入日志的行为不一致。
- 建议：为该链补 `.catch(...)`，按当前请求序号记录错误；或直接在 `try` 内 `await load_status()`，再按请求序号提交状态。

### 3. 新鲜缓存命中不会执行后台校验，不符合声明的 stale-while-revalidate 行为

- 状态：CONFIRMED
- 严重度：中
- 位置：`D:\Dev\Code\omni_usage_t190\src\renderer\lib\token-stats\query-cache.ts:86-90`、`D:\Dev\Code\omni_usage_t190\src\renderer\views\TokenStatsView.tsx:328-337`
- Summary：缓存条目 `stale === false` 时直接返回缓存结果；`loadData` 没有另起校验请求。只有收到 `onUpdated` 后显式 `mark_stale()` 才会重新查询。
- 输入状态 → 坏结果：查询组合 A 已缓存；底层数据在 collector 更新通知丢失、未触发通知，或其他窗口写入后发生变化；用户切换到 B 再切回 A → `peek`/`load` 命中新鲜标记的旧条目，底层 IPC 不再调用，旧统计持续显示。
- 影响：缓存结果依赖更新事件可靠到达，无法提供“命中后立即展示、后台静默校验”的完整 SWR 语义；更新通知缺失时旧数据可长期保留。
- 建议：区分“立即展示缓存”和“后台 revalidate”：命中后保留旧状态并启动同 key 的刷新请求；或明确将 `stale` 作为唯一刷新触发条件，并补充契约说明与事件丢失处理。

## 不确定项

无。
