# p186 会话库内容搜索冷缓存全量解析过慢

- 现象：会话库勾选「包含消息内容」搜索关键词，页面「搜索消息内容中…」长时间无结果（Playwright 实测 4000 会话冷缓存首次搜索需 45s+），期间 UI 无进度/超时反馈，用户以为功能坏了或只搜出中间态少量结果（报 21 个，实测完整结果 65 个）。
- 影响：内容搜索（`searchContent`）在大会话库下的可用性；涉及 renderer 会话库搜索 + 主进程 session-history IPC 搜索链路。
- 根因：产品缺陷（性能）。`extract_cache` 是内存 `Map`（subscription-service.ts:353），服务重启即空；首次内容搜索须对 `query_all_sessions` 返回的全部候选（SEARCH_ENUM_CAP=100k，实际 4000）逐个 `extract_full` 全量解析会话文件（concurrency=3），冷启动极慢。已扫同类位点：`summaries`（:690）用 `first_user` 轻量扫描非全量，不同因；无确认同类。
- 测试缺口：现有测试未覆盖「大候选集 + 冷缓存」性能路径，也无搜索进行中/超时的 UI 反馈测试。应补：searchContent 对未缓存 locs 的并发/耗时上界验证；renderer 搜索超时或进度降级提示的断言。
- 线索：`.scratch/task-bug-session-search/repro.md`
- 处理：t404
