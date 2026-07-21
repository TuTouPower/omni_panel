# Task spec

## 背景

docs/specs/ 下 7 个连接器类 spec 自 2026-07-05 迁移自 omni_powers 后未随 t001-t029 同步，含事实错误与契约失真，会误导新维护者。

## 范围

同步 7 个 spec 到当前代码真相：

- `connector-direct.md`（严重）：kimi 实为 poll+API key（非 session）、antigravity 实为 local（非 poll）；补 `loginDomains`/`cookieNames`
- `connector-session.md`（严重）：分区命名 `persist:session-login:{instance_id}`（非 `persist:<provider>-login`）；`cookieRefreshHours` 后台续期未实现；IPC request 含 `provider`/`auto_close_ms`
- `ai-cli-token-stats.md`（严重）：4 表（非 2 表）、`utilityProcess.fork` 替代 `child_process.fork`、`kimi-reader.ts` 漏列、`source` 枚举含 `kimi_code`、PRAGMA `user_version` 迁移
- `connector-cpa.md`：补 `ctx.report_failed_account` 契约 + manifest `monitor_*` 参数
- `connector-runtime.md`：`files.read/list` 返回 Promise、`report_failed_account`/`failed_accounts`、沙箱编译期正则、`apply_request_auth` 命名
- `scheduler.md`：per-account stale 复制、`is_auth_error` 不含 `auth`、runtime-store 新接口
- `observation-store.md`：`query_trend_series`、t029 `last_error` 迁移、`idx_trend`、`cycleDurationMs` 不持久化

## 非范围

- 不改代码，只改 spec 文档
- 基础设施类 7 spec（config-store/ipc/platform-services/ui-views/web-panel/window-management/secret-vault）归 t034

## 验收标准

- [ ] 每个 spec 上述差距逐条修复或核实
- [ ] spec 提及的文件/符号/行为与 src/ connectors/ 当前代码一致
- [ ] 无新增过期引用

## 依赖与约束

- 纯文档，无红/绿测试；黑盒 = grep 核对 + 人读
- 基于 t031/t032 新工作流
