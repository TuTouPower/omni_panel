# p180 /v1/trend 集成测试未钉 date 时刻格式

- 来源：t383 遗留（test reviewer f001）
- 内容：t383 改 build_trend_series date 为 UTC ISO 时刻后，local-api `/v1/trend` 集成测试只断言 percent 未断言 date 格式——第三消费方（web 面板）链路未显式覆盖。核心由 build_trend_series 单测 + 两 IPC 路径覆盖，不阻断。后续可在 server.test.ts 补 date 时刻格式断言。
- 处理：t397
