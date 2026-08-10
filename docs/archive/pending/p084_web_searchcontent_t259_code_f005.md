# p084 web searchContent 无取消，并发扫描堆积（t259 code f005）

- 来源：t259 code review f005（minor）
- 内容：桌面 IPC 按窗口用 AbortController 取消前序搜索；web 每次 searchContent 独立 POST，服务端全量扫文件且客户端断开不中止。连续触发时多请求并发扫盘，资源压力，与桌面行为不一致。建议渲染层防抖/合并，或服务端按来源去重。（2026-08-08 核实修订：渲染层 `SessionLibrary` 已有 300ms 防抖 + AbortController 丢弃过期结果；仍缺的是 fetch 级取消（`post_json` 无 signal）、服务端不随客户端断连中止扫描、无去重。）
- 处理：t263
