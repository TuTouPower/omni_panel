# Altitude correctness review

- target: `D:/Dev/Code/omni_usage_t190`
- scope: `src/renderer/lib/token-stats/query-cache.ts`, `src/renderer/views/TokenStatsView.tsx`, related config/collector/preload data flow
- mode: read-only

## Findings

### 1. 缓存 miss 仍切到全屏加载，违反非阻塞回退

- file: `D:/Dev/Code/omni_usage_t190/src/renderer/views/TokenStatsView.tsx:295-300,701-705`
- summary: `query_cache.peek()` 未命中时，非 silent `loadData()` 调用 `setLoading(true)`；render 以 `loading` 优先，直接隐藏当前已展示数据并显示全屏“加载中...”。这把 SWR 的“缓存缺失时保留当前内容并以非阻塞状态加载”落在错误 UI 层次。
- failure_scenario: 用户从已完成的 A 组合切换到未缓存的 B 组合（例如 agent/platform/range/metric/xaxis/gr 任一变化）。B 查询慢或 IPC 暂时阻塞时，A 的图表、KPI、Session 全部消失，出现全屏 loading；若 B 查询失败，则停留在空/加载态，而不是保留可用的 A 结果。
- evidence: `loadData` 只有 `cached` 分支执行 `apply_query_data(cached.data)`；miss 分支只 `setLoading(true)`。JSX 第 701 行先判断 `loading`，因此旧 state 不可见。spec 明确要求缓存缺失保留当前内容并显示非阻塞加载。
- priority: important

### 2. 配置初始化快照可能覆盖较新的 CONFIG_CHANGED 别名

- file: `D:/Dev/Code/omni_usage_t190/src/renderer/views/TokenStatsView.tsx:410-425`
- summary: 初始化 `config.get()` 与 `onConfigChange` 订阅并行。事件先应用新 aliases 后，旧的 `config.get()` Promise resolve 仍只检查 `active`，会再次 `apply_config_aliases`，没有序列/版本保护。
- failure_scenario: TokenStatsView 首次打开时配置 IPC 读取较慢；另一窗口保存 dir/model aliases，主进程广播新 config；统计窗口先显示新别名，随后旧初始化快照返回并回退到旧别名。后续无 CONFIG_CHANGED 时，BarChart/SessionTable 长期显示旧名称，形成 config→renderer 数据流回退。
- evidence: `onConfigChange` 注册在 `config.get()` 调用之后但同一 effect 内；`.then` 分支只判断 `active`，未记录订阅期间是否收到更新或比较配置版本。主进程 `CONFIG_CHANGED` 广播为跨窗口事件，初始化返回值没有版本字段可自动合并。
- priority: important

## Excluded

- `D:/Dev/Code/omni_usage_t190/docs/tasks/t190_tokenstats_query_swr_cache/review_test.md` 中已有测试覆盖缺口未重复列出。
- 未确认其它高置信 collector/query-cache correctness 缺陷。
