# p200 observation-store prune() 无生产调用方、cacheMaxMb 无消费者，observations 表无界增长

- 现象：`prune()` 无任何生产调用方，`cacheMaxMb` 配置无消费者，observations 表无界增长；趋势查询随行数线性劣化。
- 影响：长期运行下 observations 行数单调增长（典型安装 15 连接器 × 每实例 2-10 metric × 每刷新周期一行），`query_trend_series`（290-338）、`list_latest_by_provider`（183-193）与 `list_by_source_instance_id`（199-209）的窗口函数/范围扫描成本随行数线性劣化，磁盘占用同步增长。
- 根因（产品缺陷）：全仓 grep `\.prune\(` / `prune(` 仅命中定义（src/main/core/observation/observation-store.ts:340）与 tests/integration/observation/observation-store.test.ts；`cacheMaxMb` 只在 src/renderer/views/settings-view/sections/data_section.tsx:28-43 被写入 config（UI 设置项），无任何代码读取它来裁剪数据。每次成功刷新为每个 metric 插入新行（refresh-service.ts:319-332 → insert_stmt observation-store.ts:150-162，非 stale 不查重），stale 副本仅在同 observed_at 下去重（observation-store.ts:236-245）。修复建议：在 config-store 或 scheduler 中接入留存策略——启动与每日定时调用 `prune(now - 90d)`（或按 cacheMaxMb 折算行数预算），并将 data_section 的 cacheMaxMb 设置真正接到该逻辑。
- 测试缺口：review 未点名遗漏测试；cacheMaxMb 设置项无消费方用例，无留存策略/定期 prune 调度测试。
- 线索：docs/reviews/review_20260813_114911/review_intensive.md 第 16 行
- 来源：review_20260813_114911/review_intensive
- 处理：decd35da
