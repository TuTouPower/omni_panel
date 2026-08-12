# d034 源状态可见性数据流与 UI 挂载点

- 来源：s026 source_status_ui spike（t309）
- 结论：collector 源状态可随 `TokenStatsUpdate` 上抛；面板 status 区（新鲜度旁）是源状态标记的挂载点，`ok` 不显示额外标记、`unavailable`/`failed` 显示原因文本。
- 证据：`collector.ts` `forward_log` 经 postMessage 转发 warn/error（72-89 行）；`token-stats-ipc.ts` TOKEN_STATS_STATUS 返回 `{running,last_updated}`（146-153）；`TokenStatsView.tsx` 新鲜度 `updatedAgo`（260-263）+ status 区（656 附近）；`TokenStatsUpdate` 增 `sources_status` 数组为兼容新增。
- 影响：t309 实现源级状态（ok/unavailable/failed + lastError）在面板的可见展示；状态流链路 collector→manager→store→IPC→renderer。
- 现状：有效
