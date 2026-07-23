# 已修复的已知问题（归档）

> 从 docs/bugs.md 归档。原条目保留完整描述供追溯。

## 设置页删除账号后重启复现

- 报告时间：2026-07-22。
- 现象：在设置页删除账号后，当前运行期间账号消失；关闭并重新打开应用后，已删除账号重新出现。
- 根因：删除仅 filter config.plugins，无 tombstone；auto_seed_connectors 重新 seed。
- 修复（t038，done）：removedConnectorIds tombstone。

## Grok 采集正常但主面板显示暂无账号

- 报告时间：2026-07-22。
- 现象：Grok 采集成功但主面板"暂无账号"。
- 根因：零有效 usage 字段时 connector 静默 return []，ready+空清空。
- 修复（t039，done）：report_failed_account + 零观测不写 ready+空。

## Kimi 多账号失败账号未在主面板展示

- 报告时间：2026-07-22。
- 现象：失败账号完全消失（无 MetricRecord）。
- 根因：账号列表从 snapshot.items 构建，失败无 observation。
- 修复（t040，done）：failed 零 items 合成占位行。

## 网页端数据不实时刷新

- 报告时间：2026-07-22。
- 现象：web 端用量面板首次加载后冻结。
- 根因：onStateChange 为 no-op，无 SSE。
- 修复（t042，done）：GET /v1/events SSE + EventSource。

## e2e badge 展开按钮 timeout（过时）

- 现象：account_error_badge.spec.ts timeout。
- 状态：spec 文件已不存在（过时移除）。
