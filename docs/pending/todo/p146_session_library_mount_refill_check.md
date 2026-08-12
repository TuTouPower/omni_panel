# p146 会话库首屏挂载自动填充的极端大屏重查缺失

- 来源：t328 code Round 3 finding f004 遗留 + test Round 3 finding f003 遗留（minor）
- 内容：SessionList 挂载 effect 仅在「首屏不溢出」时主动加载一页填满。极端场景：视口极大（~3900px 高）时自动加载第 2 页后仍不溢出，不会再次触发加载，列表停留不足。概率极低（正常窗口首屏 50 条必溢出触发滚动加载），reviewer 明确非阻断。现未实现「mount 后循环重查至溢出或 has_more=false」。
- 测试覆盖：该「首屏不溢出补加载」分支在 jsdom（clientHeight=0）与 e2e（恒溢出场景）均不可达，零自动化覆盖（t328_test_f003）；如需覆盖需小数据 + 小窗口 e2e 场景。
- 处理：未开
