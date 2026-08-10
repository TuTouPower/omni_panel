# p085 web 会话检索端点无 auth 暴露会话原文（t259 code f002）

- 来源：t259 code review f002（minor）
- 内容：`GET /v1/sessionHistory`、`POST /v1/sessionHistory/searchContent`、`POST /v1/sessionHistory/summaries` 与现有 config/secrets GET 一致无 auth（仅 ingest token-gated，intranet 决策）。但新 POST 读会话原文：searchContent 返回命中 key（可探测哪些会话含某关键词），summaries 返回首条 user 消息前 80 字。server 绑定 0.0.0.0，增量暴露高于聚合用量端点。维持现状前提下记录残留风险；如暴露面扩大再评估 token-gate。
- 处理：用户确认不修（自用场景，维持 intranet 无 auth 决策）
