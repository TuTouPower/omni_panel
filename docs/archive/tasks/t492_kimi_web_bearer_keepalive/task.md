---
tid: "t492"
slug: "kimi_web_bearer_keepalive"
title: "Kimi 网页会话 Bearer 续期通道与静默刷新语义修正"
status: "done"
branch: "t492_kimi_web_bearer_keepalive"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "302fb4be30040b2041fd6eebcdf42c5fe8833659"
depends_on: "t491"
conflicts_with: ""
note: "来源 p235；Bearer 过期后无人值守自动续期，静默刷新不得假成功，401 重登须换用新 Bearer；替换 t469 假绿用例"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

- 实现分四块：①新增 `src/main/core/auth/kimi_web_token_refresher.ts`（HTTP 续期 + JWT `exp` 判定，d060 契约）；②`trySilentCookieRefresh` 改为 `{refreshed, credential_changed}` 并让 kimi_web 走 refresh token 换新 Bearer（无 refresh token 的旧凭据要求现有 Bearer 仍在有效期）；③登录窗新增 `read_local_storage` 能力，kimi_web 登录成功后读取页面 `refresh_token` 随凭据入库；④`refresh-service` 只在 `saved && credential_changed` 时计重登成功，否则直接失败（不再用同一份失效凭据空转重试）。
- 取舍：refresher 先用 `make_default_http_post`（undici，JSON body 直传，无需 form 编码）；凭据只保留 `cookie/authorization/session_id/device_id/refresh_token`——一度写入的 `access_expires_at` 无任何消费者，收尾前删除，避免留投机字段。
- AC-006 文案统一：新增 `auth_error_display_text()`（凭证类 → 「凭证失效，请重新登录」），`ProviderCardErrorBanner` 在 auth 分支改为统一文案 + 重新登录入口（此前有缓存数据时会显示裸 `HTTP 401: request failed`），`ProviderAccountRow` tooltip 同样走该函数；kimi_web connector 把 401 映射为「Kimi 网页会话已失效，请重新打开网页登录窗口」，原始状态码只进日志。
- 测试：新增 `tests/unit/auth/kimi_web_token_refresher.test.ts`（9 例）；`auth-ipc.test.ts` 删除 t469 那两条把「原样保留过期 authorization」当期望的假绿用例，替换为 5 条新语义用例；`session-manager.test.ts` 加 3 例（捕获 refresh_token / 读失败不阻塞 / 非 kimi 不读）；`refresh-service.test.ts` 加 AC-001 换新 Bearer 后重试成功、AC-003 凭据未变不重试；`kimi_web_connector.test.ts` 加 401 友好文案；`auth-error.test.ts` 加文案映射。本 task 涉及文件内新增/改写用例全绿（93 passed）。
- 环境/既有阻塞（与本 task 无关，已复现于 base `302fb4be`）：①本机 Node 24.21.0 跑 `pnpm test` 触发 p228 的 better-sqlite3 `Statement::~Statement` abort（`ERR_IPC_CHANNEL_CLOSED`），拿不到全量结论；②`tests/unit/ipc/auth-ipc.test.ts` 7 例 + `tests/integration/scheduler/refresh-service.test.ts` 6 例因 t471 manifestId 迁移未同步 fixture 长期失败，已登记 p236；③renderer 项目在本机整体 `React.act is not a function`（base 同样失败），故 AC-006 的渲染层断言无法本地执行，改以 `auth_error_display_text` 单测 + connector 文案断言佐证。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round N (YYYY-MM-DD HH:MM UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t000_code_f001|critical/important/minor|已修/遗留/撤回|一句话|文件:行 / pNNN / tid|

无 finding 时写“Round N 零 finding”。

### Round 1 (2026-09-16 09:20 UTC+8)

代码轴 1 critical + 1 important + 4 minor、测试轴 2 minor，逐条处置如下。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t492_code_f001|critical|已修|refresh token 读取原在 `closed` 回调（窗口已销毁，`executeJavaScript` 必失败）→ 恒定采不到。改为在捕获 `authorization` 的同一请求内读取（此时页面活跃），落库前 await 在途读取；mock 增加「销毁后拒绝」以锁定该约束|`src/main/core/session/session-manager.ts`、`tests/unit/session/session-manager.test.ts`|
|t492_code_f002|important|已修|续期请求未走代理，代理用户静默续期必失败。`AuthIpcDeps.get_proxy_url` 由 `index.ts` 注入并与 connector/oauth 同源，透传给 `refresh_kimi_web_tokens`|`src/main/ipc/auth-ipc.ts`、`src/main/index.ts`|
|t492_code_f003|minor|已修|`is_auth_failure` 正则扫全串，`HTTP 500: request failed (401 bytes)` 会误判为会话失效。改为匹配 `HTTP <40[13]>` 形态（不锚定行首——脚本在 VM 内跨 realm，`String(error)` 带 `Error: ` 前缀）|`connectors/kimi_web/connector.ts`|
|t492_code_f004|minor|已修|抽出共用 `AuthRecoveryRow` 并统一使用 `AUTH_ERROR_DISPLAY_TEXT`，消除两处重复 JSX 与硬编码文案|`src/renderer/components/provider_card_states.tsx`|
|t492_code_f005|minor|已修|`connector-session.md` 仍列 `access_expires_at`（实现已删该字段），文档同步|`docs/specs/connector-session.md`|
|t492_code_f006|minor|已修|旧凭据分支只换 cookie、Bearer 未变时不再报成「换到新凭据」：该分支显式传 `{credential_changed:false}`|`src/main/ipc/auth-ipc.ts`|
|t492_test_f001|minor|已修|补「Bearer 字段缺失」经真实 `trySilentCookieRefresh` 驱动的用例|`tests/unit/ipc/auth-ipc.test.ts`|
|t492_test_f002|minor|已修|补「非 JSON 旧凭据」降级用例（原 t469 用例覆盖的形态）|`tests/unit/ipc/auth-ipc.test.ts`|

### Round 2 (2026-09-16 09:33 UTC+8)

代码轴：Round 1 六条全部**已消除**，0 新 finding，verdict PASS。测试轴：Round 1 两条已消除，新增 1 条 minor `t492_test_f003`（kimi `SESSION_COOKIE` 缺失的防御分支无用例）。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t492_test_f003|minor|已修|补「实例没有任何 kimi 凭据时不报成功也不写入」用例|`tests/unit/ipc/auth-ipc.test.ts`|

### Round 3 (2026-09-16 09:40 UTC+8)

双轴复核 Round 2 结论与唯一新增用例：0 新 finding，code / test verdict 均 PASS，`review_scope=ok`、`overall=PASS`、`next_action=finalize`。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：AC-001~AC-006 满足；AC-007 为 `[deploy]`，留部署人工验收
- 测试：`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`md_format.py --check`、`git diff --check`、`pnpm build` 全绿；相关文件新增/改写用例全绿（auth-ipc t492 8 例、session-manager 33 例、refresher 9 例、refresh-service t492 2 例、connector 5 例、shared 文案 2 例）。`pnpm test` 全量在本机 Node 24 触发既有 p228 abort；另有 13 例既有失败（p236）——两者均已在 base `302fb4be` 复现
- 黑盒：`pnpm build` 通过；构建产物真机启动 `electron out/main/index.js serve --foreground --port 17867 --user-data-dir <abs>` 成功且 `GET /v1/health` 返回 ok；端到端行为黑盒由 integration 用例经真实 `createRefreshService` 覆盖（401 → 换新凭据 → 重试成功 / 凭据未变不重试）
- review：full 级三轮。Round 1 code FAIL（1 critical + 1 important + 4 minor）、test PASS（2 minor）→ 全部处置后 Round 2 双轴 PASS（test 新增 1 minor，已修）→ Round 3 双轴 PASS、0 新 finding；末轮 `review_scope=ok`、`overall=PASS`
- AC 证据：见 `handoff.json`

### 结果摘要

- kimi_web 的 Bearer 到期不再需要人工重登：静默刷新改用 refresh token 打 `auth.kimi.com` 的 `AuthService/RefreshToken` 换新 Bearer（顺带落盘轮换后的 refresh token），登录窗口在页面存活时读入 `refresh_token` 一并入库；静默刷新与 401 重登链改为只认「真的换到新凭据」（`credential_changed`），并清理了 t469 把「保留过期 Bearer」当期望的假绿用例；用户可见文案统一为「凭证失效，请重新登录」，不再暴露裸 HTTP 状态码。
- 遗留：p236（t471 迁移遗留的 13 例既有红灯，与本 task 无关）已登记待处理。
