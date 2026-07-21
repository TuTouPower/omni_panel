---
tid: t033
slug: sync_connector_specs
diff_anchor: "3cc19d6"
branch: t033_sync_connector_specs
---

# Task t033_sync_connector_specs

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 接续 t032，同步 7 个连接器类 spec 到当前代码真相（含 t001-t029 变更）。
- 3 个 sub agent 并行实施（按 spec 分组，无文件冲突）。
- diff_anchor = 3cc19d6（t032 commit）。

## Review 处置

纯文档同步 task，用户已审批范围。零 finding，未进处置表。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t033` 查。

### 验收标准勾选

- [x] connector-direct：kimi=poll+API Key、antigravity=local+session.json（L17/L19）+ loginDomains/cookieNames
- [x] connector-session：分区 `persist:session-login:{instance_id}`（L21）+ IPC provider/auto_close_ms + cookieRefreshHours 标未实现
- [x] ai-cli-token-stats：4 表 + utilityProcess.fork（L121）+ kimi-reader.ts + PRAGMA user_version
- [x] connector-cpa：report*failed_account + monitor*\* 参数
- [x] connector-runtime：files Promise + report_failed_account/failed_accounts + 沙箱正则 + apply_request_auth
- [x] scheduler：per-account stale + is_auth_error 不含 auth + runtime-store 三方法
- [x] observation-store：query_trend_series + last_error 迁移 + idx_trend + cycleDurationMs 不持久化
- [x] spec 提及符号与 src/connectors 代码一致（抽查通过）

### Reviewer verdict

- 纯文档 task，未走双审（4 个 sub agent 分组实施 + 主控抽查关键差距点）。

### 遗留

- 无

### 结果摘要

7 个连接器类 spec（connector-direct/session/cpa/runtime + scheduler + observation-store + ai-cli-token-stats）同步到当前代码真相。3 个严重落后（direct/session/ai-cli-token-stats 含事实错误）已修正，4 个小 gap 补齐 t006/t026-t029 引入的 per-account error、trend、last_error 迁移等链路。
