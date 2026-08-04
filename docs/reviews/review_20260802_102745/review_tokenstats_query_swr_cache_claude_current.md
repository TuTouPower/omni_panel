# tokenstats_query_swr_cache 生产代码审阅

审阅范围：`src/renderer/lib/token-stats/query-cache.ts`、`src/renderer/views/TokenStatsView.tsx` 及关联生产调用链。仅报告 reuse 造成可观测 correctness 分叉。

## 发现

### 1. 初始化配置读取的旧响应可覆盖 `CONFIG_CHANGED` 广播中的新别名

- **file**：`src/renderer/views/TokenStatsView.tsx`
- **line**：410-425
- **summary**：新增配置别名同步逻辑重复现有配置协调流，但只用卸载标志 `active`，没有校验 `config.get()` 响应是否仍是最新配置；旧的初始化读取可能覆盖已经应用的新广播。
- **failure_scenario**：TokenStatsView 挂载后，`config.get()` 发出但尚未返回；设置窗口保存新 `dirAliases`/`modelAliases`，主进程通过 `CONFIG_CHANGED` 广播新配置，回调先应用新别名；随后挂载时发出的旧 `config.get()` 响应返回，`.then` 中再次 `apply_config_aliases(config)`，图表和 SessionTable 回退到旧别名，直到下一次配置广播。
- **evidence**：`TokenStatsView.tsx:410-415` 对初始化读取只判断 `active`；`TokenStatsView.tsx:423-425` 直接应用广播配置，二者没有共享的版本号、请求序号或当前配置 ref。主进程 `src/main/index.ts:372-375` 在配置保存后发送 `CONFIG_CHANGED`，因此该交错顺序可发生。现有 `src/renderer/hooks/use-config.ts:62-75` 已有独立配置协调/当前值校验路径；新代码绕开该协调器并重复维护别名同步。
- **confidence**：高
- **priority**：P1

未发现其他高置信 reuse correctness 问题。
