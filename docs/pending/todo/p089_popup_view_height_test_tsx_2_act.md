# p089 popup_view_height.test.tsx 批量运行 2 条 act 警告（2026-08-08）

- 来源：技术债自查（t261 实施期批量跑 popup_view 8 文件发现；锚点基线复跑确认 pre-existing）
- 内容：批量运行 `tests/unit/renderer/views/popup_view_height.test.tsx` 出现 2 条「update not wrapped in act」警告，测试仍通过但疑似掩盖时序问题（疑似假绿）。单文件运行是否复现未单独验证；根因暂未定位。
- 处理：未开
