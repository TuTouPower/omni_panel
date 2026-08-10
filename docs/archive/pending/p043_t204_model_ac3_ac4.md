# p043 t204 model 筛选测试覆盖补强（AC3/AC4/端点透传）

- 来源：t204_test review Round 1 f002/f003/f004
- 内容：t204 model 筛选遗留三条测试覆盖缺口：(1) AC4「重开面板保持」只断言 localStorage 未做 remount 恢复路径覆盖；(2) AC3 model+agent/platform AND 组合、窗口切换后模型列表刷新无显式用例；(3) local-api /v1/dashboard/sessions、/v1/heatmap、/v1/hourBuckets、/v1/rollup 四端点与 IPC 通道的 model 透传、`query_range_rollup` 过滤无显式断言。
- 处理：t206
