# Task plan / log

## 记录

- observation-mapping.ts L48：Observation→MetricRecord 映射缺 `last_error → error`。
- 改动：加 `...(obs.last_error != null && { error: obs.last_error })`。
- KIMI stale observation（real/synthetic）已有 last_error（refresh-service L284 记录）。
- e2e account_error_badge spec 移除 skip（MetricRecord.error 有值，badge 可见）。
- connector 脚本改进（report_failed_account per-account）后置 T029。
