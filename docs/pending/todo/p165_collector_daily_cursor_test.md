# p165 AC-003 daily 截断游标路径无测试

- 来源：t345 遗留（2026-08-13，t345_test_f004 minor）
- 内容：跨轮截断游标测试只覆盖 session 维度，daily 游标路径（daily 超 MAX_RECORDS\*5 截断跨轮推进）无测试。改进方向：补 daily 超限跨轮推进用例。
- 处理：未开
