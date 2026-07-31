---
tid: "t112"
slug: "kimi_oauth_device_code"
title: "Kimi device code OAuth 登录"
status: "done"
branch: "t112_kimi_oauth_device_code"
worktree: ""
review_level: "full"
diff_anchor: "994139c7257b370cb6c0f0a7f91ab1012710586d"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task t112_kimi_oauth_device_code

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 2026-07-25 start。diff_anchor `994139c`，分支 `t112_kimi_oauth_device_code`。spec/plan 为 HEAD 恢复版（工作区曾误清空为模板，已 `git checkout HEAD --` 恢复）。
- 实现 `kimi_oauth_manager.ts`：仿 `grok_oauth_manager.ts` 的 device-code 轮询 + refresh + logout 核心逻辑。Kimi 差异：URL（`auth.kimi.com/api/oauth/device_authorization` 与 `/token`）、无 scope（device 与 token 请求体均不含 scope）、设备头 `X-Msh-Platform: kimi_code_cli` + `X-Msh-Device-Id`、refresh grant_type 字面量 `refresh_token`。设备 id 默认从 `~/.kimi-code/device_id` 读，不存在则生成 UUID 落盘 0600（`make_default_get_device_id`），可经 `deps.get_device_id` 注入测试。
- 偏离 spec：未实现 grok 的 auto-refresh 调度（start_auto_refresh/reconcile_auto_refresh/shutdown）。spec 范围只要求「token 过期前自动刷新」，已由 `refresh_now` 满足；grok 的 auto-refresh 定时器是 t039 周边扩展，kimi 暂不引入，保持最小实现。若后续需要，可按 grok 模式补。
- 偏离 spec：未新建 `KimiLoginSection.tsx`。spec 提到「仿 GrokLoginSection」，但 GrokLoginSection 是编辑账号页内嵌组件，t110 非范围已排除编辑页嵌入；KimiLoginSection 建了即死代码。改为参数化 `OAuthDeviceForm`：加 `vendor: "grok" | "kimi"` prop，内部按值选用 `useGrokDeviceLogin` / `useKimiDeviceLogin` 结果（两 hook 无条件调用守 Rules of Hooks，idle 态不发网络请求）。AddAccountDialog 按 `vendor_id === "kimi"` 传 `vendor="kimi"`。
- manifest：`parameters` 加 `OAUTH_TOKEN`（secret, required:false, exposeToScript:true），`API_KEY` required 从 true 改 false（OAuth fallback）。`auth` 块声明 `oauth_device` + `secret_name: OAUTH_TOKEN`（OAuthDeviceForm 路由用）。未用 grok 的 `poll.request.auth` 自动注入模式--kimi 需 OAUTH_TOKEN 优先回退 API_KEY，单一 `auth.secret` 无法表达；改由 connector 手动读两 key 取其一。`build_params`（refresh-service）只把 manifest parameters 中 `exposeToScript:true` 的 secret 注入 `ctx.params`，故 OAUTH_TOKEN 必须在 parameters 声明才能被 connector 读到。
- connector.ts：token 读取顺序 `OAUTH_TOKEN` -> `API_KEY`，任一存在即可；两者皆空抛 `Missing required secret: OAUTH_TOKEN or API_KEY`。
- 验证：`pnpm test` 1710 passed / 166 files；`pnpm typecheck` 仅 1 pre-existing 错误（`tests/unit/core/storage/write-json.test.ts:23`，t111 遗留，与本次无关）；改动文件 ESLint 0 错误。
- 测试：`tests/unit/auth/kimi_oauth_manager.test.ts` 17 用例（start/poll/slow_down/expired/access_denied/timeout/status/refresh 旋转/refresh 省略 refresh_token 沿用旧值/invalid_grant 清 token/logout/cancel + 设备头/无 scope/proxy 刷新）。契约测试更新：`manifest-contract.test.ts` 移除 kimi 的 apikey required 契约；`kimi-connector.test.ts` API_KEY required=false + OAUTH_TOKEN 参数 + oauth_device auth 块 + OAUTH 优先于 API_KEY + 仅 OAUTH_TOKEN 成功用例。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 零 finding

两轴均 0 finding 时写：「Round 1 零 finding，未进处置表。」不必建表。

### Round 1 (2026-07-26 00:05 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                                                                           | fix_ref                                                                                                                                    |
| -------------- | --------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| t112_code_f001 | important | 已修   | 补 auto-refresh 调度（start_auto_refresh/reconcile_auto_refresh/shutdown/退避重试），main/index.ts 仿 grok 在 config save 与 shutdown 处 reconcile kimi 实例                        | src/main/core/auth/kimi_oauth_manager.ts:296-390; src/main/index.ts:345-357,899                                                            |
| t112_code_f002 | important | 已修   | OAuthLoginResult 扩展 refresh_token/expires_at；ipc.ts KimiLoginResult 类型；preload 透传；useKimiDeviceLogin 返回；OAuthDeviceForm on_save 把 3 secret 存到 real instance          | src/main/core/auth/kimi_oauth_manager.ts:347-356; src/shared/types/ipc.ts:208-219; src/renderer/components/forms/OAuthDeviceForm.tsx:42-60 |
| t112_code_f003 | minor     | 遗留   | useKimiDeviceLogin 与 useGrokDeviceLogin 重复约 120 行。提取共享 hook 需重构 grok 侧（改 useGrokDeviceLogin 的 API 命名空间与测试），超本 task 范围；后续可建独立重构 task          | src/renderer/hooks/useKimiDeviceLogin.ts                                                                                                   |
| t112_code_f004 | minor     | 遗留   | kimi_oauth_manager 与 grok_oauth_manager 低层 helper 重复约 200 行。提取共享模块需重构 grok，且 kimi 的 auto-refresh 是按 grok 模式补的，进一步抽象需先稳定两者行为；超本 task 范围 | src/main/core/auth/kimi_oauth_manager.ts                                                                                                   |
| t112_test_f001 | minor     | 已修   | 补 vendor="kimi" 用例：mock window.usageboard.kimi，render OAuthDeviceForm vendor="kimi"，断言 kimi.login_start/login_poll 被调、on_save 收到 3 secret                              | tests/unit/renderer/components/forms/oauth_device_form.test.tsx:213-272                                                                    |
| t112_test_f002 | minor     | 已修   | 补 get_login_status (has_token=true, can_refresh=false) 边界用例                                                                                                                    | tests/unit/auth/kimi_oauth_manager.test.ts:324-347                                                                                         |

### Round 2 (2026-07-26 00:20 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                                                     | fix_ref                                            |
| -------------- | --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| t112_code_f005 | important | 已修   | main/index.ts 启动段（orchestrator.startAll 后）漏调 kimi reconcile_auto_refresh，仅 onConfigSaved/shutdown 接线。补 kimi 启动段 reconcile 块，对齐 grok 位置 | src/main/index.ts:654-665                          |
| t112_test_f003 | minor     | 已修   | auto-refresh 调度补 schedule_retry 退避重试 / terminal invalid_grant 停止重试并清 token / shutdown 取消定时器 3 个用例                                        | tests/unit/auth/kimi_oauth_manager.test.ts:510-589 |

### Round N (YYYY-MM-DD HH:MM UTC+8)

（有 finding 时用本表；每条 finding 一行。）

| finding_id     | severity                 | status | rationale | fix_ref   |
| -------------- | ------------------------ | ------ | --------- | --------- |
| t112_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t112` 查，不在此记。

### 验收标准勾选

- [x] kimi 添加账号时可走 device code OAuth，不再强制粘 API Key。
- [x] OAuth token 与 API Key 隔离存储，互不覆盖。
- [x] token 过期前自动刷新，refresh 省略 refresh_token 时沿用旧值。
- [x] `pnpm test` 全绿。

### Reviewer verdict

- Round 1 code：FAIL（f001/f002 important，已修；f003/f004 minor，遗留）
- Round 1 test：FAIL（f001/f002 minor，已修）
- Round 2 code：FAIL（f005 important，已修）
- Round 2 test：FAIL（f003 minor，已修）
- Round 3 code：PASS
- Round 3 test：PASS

### 遗留

- `t112_code_f003`：`useKimiDeviceLogin` 与 `useGrokDeviceLogin` 重复约 120 行；提取共享 hook 需重构 grok，超本 task 范围。后续可建独立重构 task。
- `t112_code_f004`：`kimi_oauth_manager` 与 `grok_oauth_manager` 低层 helper 重复约 200 行；auto-refresh 实现按 grok 模式补，进一步抽象需先稳定两者行为，超本 task 范围。

### 结果摘要

- Kimi device-code OAuth 完整链路：`kimi_oauth_manager`（device auth + poll + refresh + auto-refresh 调度）、`kimi_auth_ipc` + preload + main 实例化与 reconcile、`useKimiDeviceLogin` hook、`OAuthDeviceForm` 参数化 vendor（grok/kimi 双 hook 按值选用）、kimi manifest 声明 `oauth_device` auth 块、connector token 读取顺序 OAUTH_TOKEN -> API_KEY。
- token 迁移：device-code 登录在 temp instance id 下完成，OAuthLoginResult 携带 refresh_token/expires_at，OAuthDeviceForm on_save 把 3 个 secret 存到 real connector instance，auto-refresh/refresh_now/login_status/logout 在 real instance 可用。
- 测试：kimi_oauth_manager 23 用例（含 auto-refresh 5 个）+ connector 11 + manifest 契约 + OAuthDeviceForm vendor=kimi 7 + 4 个 view mock 加 kimi。`pnpm test` 1717 passed / 166 files；`pnpm typecheck` 仅 pre-existing `write-json.test.ts:23`（t111 遗留，与本次无关）。

- {一句话；无额外说明可写「见上」}
