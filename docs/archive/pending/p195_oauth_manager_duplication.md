# p195 grok/kimi 两个 OAuth manager 近全量重复且行为已漂移

- 现象：grok/kimi 两个 OAuth manager 近全量重复（各 ~300 行），且已出现行为漂移：kimi `logout` 会 `cancel_device_login` 并清 `retry_failure_counts`，grok `logout` 两者都不做；kimi `stop_auto_refresh` 清 retry 计数而 grok 不清——同一语义在两 provider 上行为不一致。
- 影响：同一语义在两 provider 上行为不一致；manager 层仍整体复制，任何修复（如错误码/重试语义调整）需同步两文件，漂移会继续累积。
- 根因（架构重复）：`src/main/core/auth/grok_oauth_manager.ts` / `kimi_oauth_manager.ts` 逐字复制 `enqueue_token_mutation`/token generation/`await_completion`/`cancel_device_login`/`get_login_status`/`refresh_now`/`schedule_retry`/`schedule_auto_refresh_if_enabled`/`start|stop_auto_refresh`/`reconcile_auto_refresh`/`shutdown`（grok 99-126/169-345/356-469 ↔ kimi 126-153/213-387/400-515）。t127 已把纯函数抽进 `oauth_helpers.ts`，但 manager 层仍整体复制。修复建议：把 device-code OAuth manager 参数化（endpoints/client_id/header builder/device-id resolver），grok/kimi 只保留常量与差异配置，删除两份重复实现。
- 测试缺口：review 未点名具体测试位置；无跨 provider 行为一致性用例（如 logout 清 retry 计数、stop_auto_refresh 语义应在两个 manager 上一致）。
- 线索：docs/reviews/review_20260813_114911/review_intensive.md 第 11 行
- 来源：review_20260813_114911/review_intensive
- 处理：698fe185
