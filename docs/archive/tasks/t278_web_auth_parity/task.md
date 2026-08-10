---
tid: "t278"
slug: "web_auth_parity"
title: "web 认证对齐：device-code OAuth + cookie 登录捕获 + 粘贴回退"
status: "done"
branch: "t278_web_auth_parity"
worktree: ""
review_level: "full"
diff_anchor: "f2c038cf8580c7c049e8460369780ccfcfba30e3"
depends_on: "t275"
conflicts_with: "t279"
note: "16 连接器全覆盖；B1 可见窗捕获"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 按 Round 1 的 8 条 important finding 补齐 Cookie 登录闭环：实例登录返回 `saved` 时不再要求明文 Cookie，异步 Cookie 登录改为立即触发并通过 `/status` 与 web bridge 轮询；增加手动 Cookie 保存入口；OAuth 非 JSON 响应不再把正文放入异常或日志。
- 认证 IPC、session-manager 与 OAuth 错误路径统一使用脱敏日志；新增 logger transport 哨兵测试，覆盖 Cookie、access token、refresh token 成功/错误路径。
- Grok/Kimi 集成测试改用独立 manager 与 namespace 哨兵，增加反向调用断言。Cookie 集成测试由本地登录站的 `Set-Cookie` 驱动，验证 session-manager、vault、LocalAPI/status 与无 display 错误链路。
- `tests/unit/web/usageboard-web.test.ts` 中原有 session/auth stub 断言迁移为 LocalAPI HTTP 契约：web bridge 已从 renderer stub 变为真实 `/v1/...` 请求；旧 Kimi safe-default 断言对应旧契约，按新 OAuth surface 整体替换，保留仍成立的错误与请求编码覆盖。
- web_login 连接器在 web 面板编辑路径使用 `cookieLogin` 立即触发与 `cookieLoginStatus` 轮询；Electron 桌面路径及无 `instance_id` 的新增账号路径保留 `session.login` 行为。补充 `status.error` 到 UI alert 的测试与捕获 session-manager 日志 transport 哨兵。
- 无头验证固定使用 `E2E=1 E2E_HEADLESS=1 xvfb-run -a`。Electron add-account E2E `4 passed`；Web E2E `68 passed, 2 failed`，两项均为既有 synthetic fixture 重建基线问题（登记 `p105`），未归因于本 task。`pnpm typecheck`、全量 `pnpm test`（2804 passed，2 skipped）、`pnpm lint`、Prettier、`git diff --check` 与 `pnpm build` 均通过。
- Finalization：`docs/blueprint/architecture.md` 增补 web 认证链路与 cookie 捕获在 CLI 模式的复用方式、无静默续期降级；`docs/guides/cli-mode.md` 增补网页登录与无 display 手动粘贴说明；synthetic fixture 重建基线登记 `docs/pending.md` p105，Round 3 四条 minor 遗留登记 p106。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-10 14:03 UTC+8)

Round 1 的 8 条 finding 均已在当前 task 内修复，逐条记录如下。

| finding_id     | severity  | status | rationale                                                                              | fix_ref                                                                                                                                   |
| -------------- | --------- | ------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| t278_code_f001 | important | 已修   | 实例 vault 登录按 `saved` 成功并重新读取 secrets，不再依赖回传明文 Cookie。            | `src/renderer/components/WebLoginSection.tsx:44-52; src/renderer/components/SettingsForm.tsx:238-260`                                     |
| t278_code_f002 | important | 已修   | Cookie 登录 POST 立即返回，状态端点、preload/web bridge 与设置页轮询已接通。           | `src/main/core/local-api/server.ts:638-672; src/web/usageboard-web.ts:377-383; src/renderer/components/SettingsForm.tsx:238-260`          |
| t278_code_f003 | important | 已修   | web_login section 增加受控 Cookie 输入并复用 secrets 保存与 connector refresh。        | `src/renderer/components/WebLoginSection.tsx:83-98; src/renderer/components/SettingsForm.tsx:324-403`                                     |
| t278_code_f004 | important | 已修   | OAuth 非 JSON 响应只生成固定分类错误，IPC 日志不再写入响应正文。                       | `src/main/core/auth/oauth_helpers.ts:113-126; src/main/ipc/grok_auth_ipc.ts:26-29; src/main/ipc/kimi_auth_ipc.ts:26-29`                   |
| t278_test_f001 | important | 已修   | logger transport 哨兵测试覆盖 session/OAuth 错误路径，断言原始采集日志不含认证明文。   | `tests/unit/ipc/session-ipc.test.ts:234-286; tests/unit/ipc/grok_auth_ipc.test.ts:130-176; tests/unit/auth/oauth_helpers.test.ts:235-270` |
| t278_test_f002 | important | 已修   | Grok/Kimi 使用独立 manager、不同哨兵结果，并断言 namespace 不串线。                    | `tests/integration/local-api/server.test.ts:310-461`                                                                                      |
| t278_test_f003 | important | 已修   | 本地登录站 `Set-Cookie` 驱动真实捕获闭环，并覆盖 vault/status 与 no-display 可读错误。 | `tests/integration/local-api/server.test.ts:486-664; tests/e2e/electron/add_account.spec.ts`                                              |
| t278_test_f004 | important | 已修   | 记录旧 web stub 语义因 LocalAPI 契约迁移而失效，并补充新 bridge endpoint 覆盖。        | `tests/unit/web/usageboard-web.test.ts:188-261,417-461; task.md:19-25`                                                                    |

### Round 2 (2026-08-10 14:20 UTC+8)

Round 2 的 1 条 code important 与 2 条 test minor 均已在当前 task 内修复。

| finding_id     | severity  | status | rationale                                                                                            | fix_ref                                                         |
| -------------- | --------- | ------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| t278_code_f005 | important | 已修   | web_login 的 web 实例登录改用立即触发 + 状态轮询；桌面与无实例新增账号路径保持原有 `session.login`。 | `src/renderer/components/WebLoginSection.tsx:38-89`             |
| t278_test_f005 | minor     | 已修   | 直接覆盖 `cookieLoginStatus` 返回 `error` 到设置页可读错误提示的分支。                               | `tests/unit/renderer/components/settings_form.test.tsx:716-739` |
| t278_test_f006 | minor     | 已修   | 捕获闭环接入 logger transport，断言 session-manager 捕获路径不输出 Cookie 哨兵。                     | `tests/integration/local-api/server.test.ts:616-646,687-690`    |

### Round 3 (2026-08-10 14:48 UTC+8)

Round 3 两路均 PASS；4 条 minor 按流程登记 `docs/pending.md`「待办」节（p105/p106），本表只留引用。

| finding_id     | severity | status | rationale                                                                                              | fix_ref |
| -------------- | -------- | ------ | ------------------------------------------------------------------------------------------------------ | ------- |
| t278_code_f006 | minor    | 遗留   | web 添加账号（无 instance_id）cookie 登录仍阻塞、无轮询，刷新/断请求会丢捕获结果；与编辑实例路径分叉。 | p106    |
| t278_code_f007 | minor    | 遗留   | `SettingsForm.handle_session_login` 与 `WebLoginSection` web 分支轮询逻辑逐字重复，后续可抽共享 hook。 | p106    |
| t278_test_f007 | minor    | 遗留   | `startCookieLogin` 并发冲突（CONFLICT）分支无测试。                                                    | p106    |
| t278_test_f008 | minor    | 遗留   | UI 轮询 120s 超时分支无测试。                                                                          | p106    |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC1/AC2（mock OAuth device-code 端点驱动全流程，真实厂商链路归 live 契约）；AC3（本地 mock 登录站 `Set-Cookie` 驱动真实 session-manager 捕获，vault 落值 + `/status` saved，Electron add-account E2E 4 passed）；AC4（no-display 可读错误且状态不损坏，手动粘贴保存链路测试通过）；AC5（logout/refresh web bridge 端点与参数断言通过）；AC6（logger transport 哨兵断言认证全流程日志无 cookie/token 明文）；AC7（桌面 `session.login` 路径保留，既有 electron e2e 回归通过）。`pnpm test` 2804 passed / 2 skipped，typecheck、lint、`pnpm build` 通过；Web E2E 68 passed、2 failed 均为既有 `p105` synthetic fixture 重建基线问题。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：FAIL
- Round 1 test：FAIL
- Round 2 code：FAIL
- Round 2 test：PASS
- Round 3 code：PASS
- Round 3 test：PASS

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- web 认证对齐完成：OAuth 全组 + cookie 登录轮询 + 手动粘贴回退 + 日志脱敏，两轮审阅后 code/test 均 PASS；4 条 minor 遗留已登记 p105/p106。
