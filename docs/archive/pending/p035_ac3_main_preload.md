# p035 AC3「更新事件报告同一已提交版本」的 main→preload 转发粘合层无测试（2026-08-03）

- 来源：t192_test_f004（t192 Round 1，minor）
- 内容：主进程 on_update 发送 `get_data_version()`、preload onUpdated 解析 number，但版本在 main→preload 转发中丢失/错位无用例捕获。建议在 ipc/preload 层补 onUpdated 事件版本转发用例。
- 处理：t202
