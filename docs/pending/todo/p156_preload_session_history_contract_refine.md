# p156 preload sessionHistory 契约修复收尾精化（薄包装去壳 + summaries 通道断言）

- 来源：t341 遗留（2026-08-13，t341_code_f004 + t341_test_f003 minor）
- 内容：
    - t341_code_f004：preload/index.ts 本地 `is_ipc_result` 薄转发包装（delegate 到 ipc-envelope.ts）可去，直接 import 共享函数。改进方向：删除本地薄转发，调用点直用 `ipc-envelope` 导出。
    - t341_test_f003：AC-001 测试未断言 summaries 的 IPC channel/payload（open 通道已断言，summaries 缺）。改进方向：补 `toHaveBeenCalledWith("sessionHistory:summaries", { locs: [...] })`。
- 处理：未开
