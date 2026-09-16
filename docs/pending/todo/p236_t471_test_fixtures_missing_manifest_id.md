# p236 t471 manifestId 迁移遗留陈旧测试 fixture，主仓 13 例用例长期红

- 现象：主仓（`302fb4be`）上两个测试文件共 13 例固定失败，全部是「配置插件没有 `manifestId`」导致生产代码查不到 connector definition：
    - `tests/unit/ipc/auth-ipc.test.ts` 7 例：`handleCookieLogin > delegates to sessionManager.start_login…`、`returns the result from sessionManager.start_login`、`falls back to endpoints.default…`、`rejects loginUrl with disallowed domain`、`accepts loginUrl with domain declared in manifest loginDomains (P1-4)`、`propagates sessionManager errors as INTERNAL_ERROR`、`trySilentCookieRefresh > uses instance-scoped partition persist:session-login:<instance_id>`。
    - `tests/integration/scheduler/refresh-service.test.ts` 6 例：`auto re-login session connector on auth error and retries`、`falls back to failed state when sessionLogin fails`、`preserves lastSuccess across consecutive failures (anti-flicker)`、`session connector succeeds within 3-attempt loop after re-login`、`marks failed after sessionLogin throws and retries exhausted`、`connector error freshness > retries on connection errors and marks stale`。
- 影响：两个文件的本地与 CI 判读长期为红，`pnpm test` 无法作为门禁；真实回归会被淹没在既有失败里（t492 实施时需先做基线对比才能区分新旧失败）。
- 根因：`614dea2e feat(config): migrate connector identity to manifestId`（t471，2026-09-14）把 connector 解析从 `executablePath` 改为 `plugin.manifestId === definition.manifest.id`（`src/main/ipc/auth-ipc.ts`、`src/main/core/scheduler/refresh-service.ts`），但未同步更新上述两个测试文件的内联 fixture：
    - `auth-ipc.test.ts` 的 `build_deps()` 与 `trySilentCookieRefresh` 的 `custom-silent` 内联 plugin 缺 `manifestId`。
    - `refresh-service.test.ts` 的 `plugin_config()` 返回 `manifestId: "deepseek"`，而 mimo/kimi 用例复用该 helper 却不覆盖 `manifestId`。
        失败特征与之一致：auth 侧报「插件定义不存在」/`expected false to be true`；scheduler 侧报「Refresh requested for connector without definition」，会话重登与连接错误重试路径整段不执行。
- 测试缺口：本次是既有测试自身失效，不是覆盖缺口；修复即补齐 fixture 的 `manifestId`（`auth-ipc.test.ts` 两处、`refresh-service.test.ts` 的 helper 与各调用点）。修完须重跑两个文件确认转绿，并检查是否还有其它文件复用同类 fixture。
- 线索：主仓不改源码直接运行 `npx vitest run --project node tests/unit/ipc/auth-ipc.test.ts tests/integration/scheduler/refresh-service.test.ts` 即复现 13 例红；t492 实施记录见 `docs/archive/tasks/t492_kimi_web_bearer_keepalive/task.md` 实施笔记。
- 处理：未开
