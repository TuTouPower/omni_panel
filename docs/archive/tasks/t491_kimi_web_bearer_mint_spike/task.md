---
tid: "t491"
slug: "kimi_web_bearer_mint_spike"
title: "Kimi 网页 Bearer 续期口验证：是否存在 HTTP mint 通道"
status: "done"
branch: "t491_kimi_web_bearer_mint_spike"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "91c6b73e2a75cfdbbae893084378bddf27a0890e"
depends_on: ""
conflicts_with: ""
note: "来源 p235；验证网页端是否存在 cookie/会话→新 Bearer 的 HTTP 接口（QR-status 下发或 auth.kimi.com refresh），给出可复用 kimi_oauth_manager 续期的结论或回落 token pump 的依据"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

- 抓包方案：用 Playwright 有头 Chrome（`channel: chrome`；本机 ms-playwright 缓存版本与依赖版本不匹配，故走系统 Chrome）真实扫码登录并**读取响应体**——上一轮 `data/capture_20260909_*.zip` 的响应体未落袋，正是此前漏掉令牌下发点的原因。
- 关键发现：`GetLoginQRCodeStatus` 响应体直接返回 `accessToken`+`refreshToken`；前端 bundle 显示续期走 `AuthService/RefreshToken`（`AUTH_API_HOST=https://auth.kimi.com`），令牌存 localStorage。
- 离线实测（不依赖浏览器）：最小请求（仅 `content-type: application/json` + `{"refreshToken"}`）即 200 返回新 access/refresh；quota 口只认 Bearer，cookie 与 `x-msh-*` 都非必需；负样本（篡改/垃圾/缺失 Bearer）均 401，确认认证真实生效。
- 结论：**s036/d057 的 token pump 方案作废**，t492 改走 HTTP 续期；现有 `device_code_oauth_manager`/`oauth_helpers` 形态可对齐但不能直接复用（form vs JSON、`access_token` vs `accessToken`、`expires_in` vs JWT `exp`、`oauth_refresh` 门控仅 `oauth_device`），逐项差异见 spike 报告「AC-002」小节。
- 登录侧取 refresh token 的可行性另用 Electron 探针验证（应用同款 webPreferences 下 `executeJavaScript` 可读 localStorage）。踩坑：Electron 42 以 `.mjs` 为入口时脚本挂住，探针改用 `.cjs`。
- 环境阻塞：本机 Node 24.21.0 下 `pnpm test` 触发 p228 的 better-sqlite3 `Statement::~Statement` abort（`ERR_IPC_CHANNEL_CLOSED`），另附带 8 例 `tests/unit/ipc/auth-ipc.test.ts` 断言失败；已在主仓 base commit `91c6b73e` 复现同样结果，确认与本 task 改动无关（本 task 只新增 docs，无生产代码变更）。`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`md_format.py --check` 均通过。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round N (YYYY-MM-DD HH:MM UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t000_code_f001|critical/important/minor|已修/遗留/撤回|一句话|文件:行 / pNNN / tid|

无 finding 时写“Round N 零 finding”。

### Round 1 (2026-09-16 07:04 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t491_gen_f001|important|已修|report 增加「AC-002：与 device_code_oauth_manager / oauth_helpers 的对接点与差异」逐项映射表（协议体 form vs JSON、字段名 access_token vs accessToken、expires_at 由 expires_in vs JWT exp、oauth_refresh 门控仅 oauth_device、存储键），并把「可直接对齐」改为「形态可对齐、实现需适配」；d060 同步修订|`docs/spikes/s039_kimi_web_bearer_mint_probe/report.md`、`docs/findings/d060_kimi_web_bearer_http_refresh.md`|
|t491_gen_f002|minor|已修|新增候选路径 3 专门否定样本：用真实登录 cookie 打 RefreshToken（400 invalid_argument）与 quota 口（401），对照 refreshToken-only（200）|`docs/spikes/s039_kimi_web_bearer_mint_probe/code/cookie_probe.mjs`、report 第 3 节|
|t491_gen_f003|minor|已修|销毁 `.scratch/kimi-spike/` 下活动凭据（profile 30MB、secrets/network/bodies/storage/refresh\_\* 等）并在报告记录销毁清单；新增入库凭据扫描脚本作为 AC-006 复核命令|`docs/spikes/s039_kimi_web_bearer_mint_probe/code/scan_credentials.mjs`、report「凭据销毁」小节|
|t491_gen_f004|minor|已修|第 2 节表格补「脚本」列并标注 refresh_probe 各行非最小请求，最小性结论统一引用 error_probe 的 E5~E8|`docs/spikes/s039_kimi_web_bearer_mint_probe/report.md`|
|t491_gen_f005|minor|已修|`with_headers_snake` 行原称「去掉 Origin/Referer」与脚本不符（`try_refresh` 恒发五头），改为「头与 minimal_camel 相同；仅字段名改 refresh_token」|`docs/spikes/s039_kimi_web_bearer_mint_probe/report.md:68`|

### Round 2 (2026-09-16 07:10 UTC+8)

Round 2 复核 Round 1 四条均**已消除**，verdict PASS，新增 minor `t491_gen_f005`（已在本表处置）。

### Round 3 (2026-09-16 07:12 UTC+8)

Round 1/2 手写 prompt 缺 `reviewed_scope` 行（checker 判 `review_scope=missing`、`next_action=rerender_review`）。本轮改用官方渲染器 `render_review_prompts.py` 重出 prompt 并复跑：f001~f004 仍已消除、f005 已修，零新 finding，verdict PASS，`review_scope=ok`、`overall=PASS`、`next_action=finalize`。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足（AC-001/002/004/005/006 有实测证据；AC-003 为条件式条目，HTTP 路径成立故不适用）
- 测试：本 task 无生产代码变更。`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`md_format.py --check`、`git diff --check` 通过；`pnpm test` 在本机 Node 24.21.0 下触发既有 p228（better-sqlite3 abort），已在 base commit `91c6b73e` 复现同样结果与同样 8 例 auth-ipc 失败，确认与本 task 无关
- 黑盒：本 task 的验证链即真实黑盒——真实账号扫码登录抓包 20 分钟、离线最小请求复现刷新、负样本（篡改/垃圾/缺失 Bearer、cookie-only）、Electron 同款 webPreferences 读 localStorage；脚本见 `docs/spikes/s039_kimi_web_bearer_mint_probe/code/`
- review：single 级 Round 1 FAIL（1 important + 3 minor）→ Round 2 PASS → Round 3（官方渲染 prompt）PASS、零新 finding；末轮 `review_scope=ok`、`overall=PASS`
- AC 证据：见 `handoff.json`

### 结果摘要

- kimi 网页会话可用纯 HTTP 续期：`AuthService/RefreshToken` 以 refresh token 换 900 秒 access token（refresh 90 天且轮换），quota 口只认 Bearer；s036/d057 的 token pump 方案作废，t492 改走 HTTP 续期（现有 `device_code_oauth_manager` 形态可对齐但需适配，差异见 spike 报告 AC-002 小节）。
