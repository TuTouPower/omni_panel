# Task review t491（reviewer_focus: 通用）

- task：`t491_kimi_web_bearer_mint_spike`
- spec：`docs/tasks/t491_kimi_web_bearer_mint_spike/spec.md`
- diff_anchor：`91c6b73e2a75cfdbbae893084378bddf27a0890e`
- target：`git diff 91c6b73e2a75cfdbbae893084378bddf27a0890e`
- round：1
- reviewed_at：2026-09-16 07:04 UTC+8

## Findings

### t491_gen_f001 - AC-002 未逐项交付「与 device_code_oauth_manager 的对接点与差异」，且结论「可直接对齐」与现有实现事实不符

- 严重度：important
- 锚点：AC-002；失败场景：t492 按报告结论直接复用 `device_code_oauth_manager.refresh_now`，kimi 端点返回 camelCase/JSON，现有实现按 snake_case/form 解析，`refresh_now` 返回 `{success:false,error:"unexpected token response shape"}`，续期始终失败。
- 位置：`docs/spikes/s039_kimi_web_bearer_mint_probe/report.md:110`、`docs/findings/d060_kimi_web_bearer_http_refresh.md:13`；对照 `src/main/core/auth/oauth_helpers.ts:79-91,137-140`、`src/main/core/auth/device_code_oauth_manager.ts:321-360`、`src/main/core/scheduler/refresh-service.ts:274-276`
- 问题：AC-002 要求「逐项说明与 `device_code_oauth_manager`（token 存储键、`expires_at` 语义、`refresh_now` 返回值）的对接点与差异」，报告只用一句话带过（report.md:110「token 存取与 `expires_at` 语义、`refresh_now` + 到期前调度形态可直接对齐」），未逐项成文，且该「可直接对齐」判断与代码相矛盾，遗漏了 t492 必须处理的四处差异：
    1. **协议体**：现有 `refresh_now` 经 `post_form`/`form_encode` 发 `application/x-www-form-urlencoded`（`grant_type=refresh_token&client_id=…&refresh_token=…`），而 kimi 端点要求 JSON `content-type: application/json` + `{"refreshToken":"…"}`（report.md:106）。form 编码形态本 spike 未测。
    2. **响应字段命名**：kimi 返回 `accessToken`/`refreshToken`（report.md:106），现有 `is_token_response` 只认 `access_token`，故 verbatim 复用会被判为「unexpected token response shape」；`is_error_response` 只认 `error`，而 kimi 错误体是 `{code:"unauthenticated"}`（report.md:59）。
    3. **`expires_at` 语义**：现有 `compute_expires_at` 依赖响应体 `expires_in`（`oauth_helpers.ts:137-140`）；kimi 响应体按报告只含 `accessToken`/`refreshToken`（无 `expires_in`），有效期只在 JWT `exp`（`exp-iat=900`）。若照搬，`expires_at` 会是 `undefined`，`schedule_auto_refresh_if_enabled` 只能退化为 `REFRESH_RETRY_DELAY_MS`（60s）轮询，得不到「到期前调度」。
    4. **触发门控**：`refresh-service.ts:276` 的 `oauth_refresh` 钩子门控为 `auth.method !== "oauth_device"` 即跳过；kimi_web 非 `oauth_device`，该钩子不会触发（spec 上下文区已把此钩子列为待复用设施）。报告未提。
- 建议：在 report.md 或 d060 增加一张逐项映射表（存储键 `OAUTH_TOKEN`/`OAUTH_REFRESH_TOKEN`/`OAUTH_EXPIRES_AT`、`expires_at` 由 `expires_in` vs JWT `exp`、`refresh_now` 返回 `RefreshResult{success,error}`），并显式标注「不可直接复用、需新增 JSON/camelCase 适配与 expires_at 从 `exp` 推导、以及 `oauth_refresh` 门控扩展」——即把「可直接对齐」改成「形态可对齐、实现需适配」。

### t491_gen_f002 - AC-001 候选路径 3（静态 cookie 换取新 Bearer）缺专门否定证据，结论靠推断

- 严重度：minor
- 锚点：AC-001；失败场景：reviewer 复核时无法从证据区直接确认「cookie-only 无可用 exchange 口」，只能从「刷新端点需要 refreshToken」间接推断。
- 位置：`docs/spikes/s039_kimi_web_bearer_mint_probe/report.md:61-72`
- 问题：范围候选路径 3 明确要求确认「是否存在其它可用的 exchange 口」。报告的 section 3 只证明 quota 口认 Bearer、cookie 非必需（正面证据），未见「不带 refreshToken、只带登录 cookie 打 `RefreshToken`/其它 exchange 端点 → 401/无令牌」的专门否定样本；`error_probe.mjs:51` 的 E2（空 refreshToken → 400）最接近，但未被报告引作路径 3 的否定判据。该路径的「不存在」结论目前是推断而非实测记录。
- 建议：补一条显式样本（cookie-only 调 `GetLoginQRCodeStatus`/`RefreshToken` → 401/无 accessToken）或在结论中把 E2/E4-E6 明确标注为路径 3 的否定依据。

### t491_gen_f003 - AC-006 后半句「抓包原值与临时样本销毁」无证据，scratch 仍保留活动凭据

- 严重度：minor
- 锚点：AC-006；失败场景：90 天有效期的真实 refresh token 长期落盘于本机 `.scratch/kimi-spike/`，AC 要求的销毁步骤未执行/未记录。
- 位置：`docs/spikes/s039_kimi_web_bearer_mint_probe/report.md:25`；实际残留 `.scratch/kimi-spike/secrets.json`、`network.jsonl`、`bodies/`、`profile/`、`quota_probe_tokens.json`、`storage.json`
- 问题：AC-006 前半句（`docs/` 零凭据）已满足——我对 diff 新增的 `docs/findings/d060_*.md` 与 `docs/spikes/s039_*/`（report + 7 个脚本）做了 JWT 结构/cookie 值/session-device id 形态扫描，零命中；项目 CI 亦有 `gitleaks-action@v2` 与 `pnpm security:js` 兜底（`.github/workflows/ci.yml:29-34`、`package.json:36`）。但 AC-006 后半句「抓包原值与临时样本销毁」缺乏证据：报告只写「不入库」，review 时 `.scratch/kimi-spike/` 下活动凭据仍在。`.scratch/` 已被 `.gitignore:70` 忽略，入库风险已消除。
- 建议：销毁 scratch 原值，或在报告中记录保留原因/期限；若团队确认 `.scratch`（gitignore）保留属既定策略，则把 AC-006 后半句改为「不得入 `docs/` 与 git」，处置为改 spec 而非实现。

### t491_gen_f004 - report 第 2 节 `minimal_camel` 行标注为「最小请求」与实际脚本不符

- 严重度：minor
- 锚点：行为缺陷——证据表与实际发出的请求不一致，易误导读者的「最小协议要求」判断。
- 位置：`docs/spikes/s039_kimi_web_bearer_mint_probe/report.md:50`；对照 `docs/spikes/s039_kimi_web_bearer_mint_probe/code/refresh_probe.mjs:24-30`
- 问题：表中 `minimal_camel` 标注「仅 `content-type` + `{"refreshToken"}`」，但 `refresh_probe.mjs` 的 `try_refresh` 无论 `extra_headers` 为何都固定发送 `connect-protocol-version`/`content-type`/`Accept`/`Origin`/`Referer`，故 `minimal_camel` 并非最小请求；真正支撑「仅需 `content-type`」的是 `error_probe.mjs` 的 E7（`report.md:51`），二者不应混列。
- 建议：把 `minimal_camel` 行改标为「content-type + connect + Origin/Referer（非最小）」，最小性结论统一引用 E7。

## 结论

- 本轮新发现：4 条（1 important + 3 minor）
- 未进表的提示：diff 仅新增 `docs/findings/d060_*.md`、`docs/spikes/s039_*/`（report + 7 脚本）并改写 `docs/tasks/t491_*/{spec,task}.md`，未触碰 `src/`、`connectors/`，范围与「非范围」一致；无文件过大/复杂度问题（最大单文件 `probe.mjs` 302 行）；AC-003/AC-004/AC-005 的条件与结论基本自洽（AC-003 因 HTTP 路径存在而条件不成立）；blueprint 未更新与 spec「仅在结论改变该描述时更新」一致。
- 总体判断：主结论（存在纯 HTTP 续期端点、无需常驻浏览器、空闲亦可由应用主动续期）证据链成立，`docs/` 无凭据泄漏；但 AC-002 的「逐项对接点与差异」未交付且「可直接对齐」与现有 `device_code_oauth_manager`/`oauth_helpers` 实现相矛盾，属未解决的 important，判 FAIL。
- 系统性 follow-up：建议「t492 补 kimi_web HTTP 续期与 device_code_oauth_manager 的字段/语义映射落地说明」，slug `kimi_web_refresh_adapter_mapping`（含 JSON/camelCase 适配、`expires_at` 由 JWT `exp` 推导、`oauth_refresh` 门控扩展）。

verdict: FAIL

______________________________________________________________________

### Round 2 (2026-09-16 07:10 UTC+8)

- 前轮 finding 复核：
    - `t491_gen_f001`：已消除。`report.md:137-154` 新增「AC-002：与 `device_code_oauth_manager` / `oauth_helpers` 的对接点与差异（逐项）」成文映射表（6 行：请求协议 / 响应字段名 / `expires_at` 来源 / 存储键 / `refresh_now` 返回值 / 401 即时刷新钩子），并显式给出「形态可对齐，实现不能直接复用」；我逐条对照源码，6 行所述全部与实现一致、引用行号精确：`post_form`+`form_encode` 与 `grant_type=refresh_token&client_id=…&refresh_token=…`（`oauth_helpers.ts:91-93`、`device_code_oauth_manager.ts:118-125`）、`is_token_response` 只认 `access_token` / `is_error_response` 只认 `error`（`oauth_helpers.ts:79-89`）、`compute_expires_at` 依赖 `expires_in`（`oauth_helpers.ts:137-140`）且 `expires_at` 非 finite 时落 `REFRESH_RETRY_DELAY_MS`=60s（`device_code_oauth_manager.ts:442-445`）、存储键 `OAUTH_TOKEN`/`OAUTH_REFRESH_TOKEN`/`OAUTH_EXPIRES_AT`（`oauth_helpers.ts:9-11`）、`refresh_now` 返回 `RefreshResult{success,error}` + `refresh_in_flight` 去重 + `token_generation`（`device_code_oauth_manager.ts:321-377`）、门控 `definition.manifest.auth?.method !== "oauth_device"` 跳过（`refresh-service.ts:272-279`）且仅 grok/kimi(code) 注册（`index.ts:412-423`）。另核对：kimi_web 凭据确为 `SESSION_COOKIE` 的 JSON `{cookie,authorization,session_id,device_id}`（`session-manager.ts:177-184`）、manifest 为 `web_login`（`connectors/kimi_web/manifest.json:6`）、`kimi_oauth_manager` token_url 为 `auth.kimi.com/api/oauth/token`（`kimi_oauth_manager.ts:29`）；`d060` 同步改为「形态可对齐、实现需适配」并给出同四项差异。未发现把结论修成另一个错误的迹象。
    - `t491_gen_f002`：已消除。新增 `code/cookie_probe.mjs`（C1 cookie-only 打 `RefreshToken`、C2 cookie-only 打 quota 口、C3 refreshToken-only 对照），`report.md:80-90` 第 3 节给出对应表（C1 400 `invalid_argument` 无 accessToken / C2 401 `unauthenticated` / C3 200 对照），脚本逻辑与报告表一致（脚本只打印 `cookie_count`/`cookie_names`/cookie header 的 sha8 与响应状态，不打印 cookie 值），结论「cookie→Bearer 的 exchange 口不存在」现为实测否定样本而非推断。
    - `t491_gen_f003`：已消除。`report.md:29-39` 新增「凭据销毁」小节含逐对象处置表；实测 `.scratch/kimi-spike/` 现仅剩 5 个 `.log`（`profile/`、`secrets.json`、`bodies/`、`network.jsonl`、`storage.json`、`refresh_*.json`、`quota_probe_tokens.json` 均已删除），grep 这些 log 无 JWT/长 base64 串/cookie 值。我执行 `node docs/spikes/s039_kimi_web_bearer_mint_probe/code/scan_credentials.mjs` 得 `{scanned_files:11,hits:0}`、退出码 0；并对 `docs/` 全目录另跑 JWT 结构正则与 `(kimi_session|HMACCOUNT_BFESS|msh_user_id|access_token|refresh_token)=<val>` 扫描，均零命中。AC-006 后半句（销毁）现有证据。
    - `t491_gen_f004`：已消除。`report.md:62` 增加说明「`refresh_probe.mjs` 的 `try_refresh` 固定发送 connect/content-type/Accept/Origin/Referer，故各行为非最小请求；最小性结论由 `error_probe.mjs` 的 E5~E8 支撑」，表格新增「脚本」列，`minimal_camel`/`with_headers_camel` 行已如实标注为 connect + content-type + Accept + Origin/Referer（与 `refresh_probe.mjs:42-51` 一致），E7（仅 content-type→200）作为最小请求被正确引用。
- 本轮新发现：1 条

### t491_gen_f005 - report 第 2 节 `with_headers_snake` 行描述与脚本实际行为及同节说明自相矛盾

- 严重度：minor
- 锚点：行为缺陷 / 文档一致性——证据表某行与实际发出的请求不符，且与本行上方刚加的说明冲突，易误导读者的「协议最小性/字段名」判断（正是 f004 的同类问题未覆盖到的另一行）。
- 位置：`docs/spikes/s039_kimi_web_bearer_mint_probe/report.md:68`；对照 `code/refresh_probe.mjs:42-51`、`report.md:62`
- 问题：`with_headers_snake` 行「请求差异」写为「同上去掉 `Origin`/`Referer` 之外不变、字段名改 `refresh_token`」——字面宣称该样本去掉了 `Origin`/`Referer`。但 `try_refresh` 在 `...extra_headers` 展开前就固定写入 `connect-protocol-version`/`content-type`/`Accept`/`Origin`/`Referer`，`with_headers_snake` 传入的 `extra_headers` 为 `secrets.headers ?? {}`（`extract_secrets.mjs:66` 写死为 `{}`），故该行实际仍发送 `Origin`/`Referer`，与描述相反；且与本报告同节 `report.md:62`「`refresh_probe` 各行固定发送 …`Origin`/`Referer`」的说明直接冲突。字段名改 `refresh_token` 的部分（`{"refresh_token": …}`，`refresh_probe.mjs:43`）属实，结论「200（两种字段名都接受）」亦与脚本可产生的结果自洽，问题仅在该差异描述。
- 建议：把该行「请求差异」改为「同上，头不变；仅请求体字段名改 `refresh_token`」（去掉「去掉 `Origin`/`Referer`」这一与脚本不符的表述）。

## 结论（Round 2）

- 本轮新发现：1 条（0 critical / 0 important / 1 minor）
- 未进表的提示：
    - `scan_credentials.mjs` 的扫描目标为 `docs/findings/d060_*.md` + `docs/spikes/s039_*/`（11 文件），未纳入 t491 的 `task.md`/`spec.md`/`review_general.md`；我另行对 `docs/` 全目录扫描零命中，故无实际泄漏，仅为复核脚本覆盖面提示（spec 的 AC-006 声明即以此脚本为准，不构成缺口）。
    - `cookie_probe.mjs`/`refresh_probe.mjs`/`error_probe.mjs`/`quota_probe.mjs` 依赖已按 AC-006 销毁的 `.scratch/kimi-spike/` 输入（`secrets.json`、`profile/`），当前不可再复现，证据以报告记录表为准——这是「销毁原值」与「可复现」的固有取舍，属预期。
    - 两个修复引入文件 `code/cookie_probe.mjs`、`code/scan_credentials.mjs` 当前未被 `git add`（工作区 `??` 未跟踪，但 `git check-ignore` 退出 1 表明未被忽略）；提交时需确保纳入 `git add`，否则 spec 引用的 AC-006 复核命令会缺失。
    - `docs/findings/d060_*.md` 未写「遗留」行（其余多份 d-file 常有），非必填项，不计为 finding。
- 总体判断：Round 1 的 4 条 finding 均已按事实消除（f001 的 AC-002 映射表逐条与 `device_code_oauth_manager`/`oauth_helpers`/`refresh-service` 实现相符，未引入新错误结论；f002/f003/f004 均有可复核证据），diff 仍只触及 `docs/`、未动 `src/`/`connectors/`，无凭据入库；仅剩 1 条文档一致性 minor，判 PASS。
- 系统性 follow-up：无（Round 1 提出的 `kimi_web_refresh_adapter_mapping` 建议已由 d060/report AC-002 提供输入，t492 落地即可）。

verdict: PASS

______________________________________________________________________

## Round 3 (2026-09-16 07:12 UTC+8)

reviewed_scope: c51b36f9a26541d2

- 前轮 finding 复核（一律以相对 `91c6b73e2a75cfdbbae893084378bddf27a0890e` 的完整 worktree 为准，含未跟踪交付文件）：
    - `t491_gen_f005`：**已消除（真修）**。`report.md:68` 该行现为「头与 `minimal_camel` 相同；仅请求体字段名改 `refresh_token`」，与脚本实际行为一致：`with_headers_snake` 走 `refresh_probe.mjs:107` 的 `try_refresh(..., secrets.headers ?? {}, "snake")`，而 `secrets.headers` 由 `extract_secrets.mjs:66` 写死为 `{}`，故其请求头与 `minimal_camel`（`extra_headers = {}`）逐字相同——`refresh_probe.mjs:44-51` 在 `...extra_headers` 展开前固定写入 `connect-protocol-version`/`content-type`/`Accept`/`Origin`/`Referer`，五者全部保留。原 finding 指出的「去掉 `Origin`/`Referer`」错误宣称已不存在，「仅请求体字段名改 `refresh_token`」与 `refresh_probe.mjs:43` 的 `{ refresh_token }` 相符，结果列「200（两种字段名都接受）」与脚本可产生结果及 `error_probe.mjs` 的 E3（snake_case 字段名）自洽，且与本节 `report.md:62`「`refresh_probe` 各行固定发送 …`Origin`/`Referer`」的说明不再冲突。修复未引入新错误：该行仍保留 4 列、与表头 `|样本|脚本|请求差异|结果|`（`report.md:64-65`）对齐。
    - 本轮改动面核对：用 `stat` 列全部相关文件 mtime——`report.md` 07:10:48 晚于 Round 2 报告 `review_general.md` 07:10:36，其余交付文件均 ≤ 07:07:39（`spec.md` 07:07:39、`task.md` 07:08:47、`d060` 07:05:57、`cookie_probe.mjs`/`scan_credentials.mjs` 07:06:47、其余探针 ≤ 06:58:33），与「本轮 diff 相较 Round 2 仅改 `report.md` 的 `with_headers_snake` 一行」相符。
    - `t491_gen_f001`：**仍保持已消除**。`report.md:137-154` 的「AC-002：与 `device_code_oauth_manager` / `oauth_helpers` 的对接点与差异（逐项）」6 行映射表仍在、未被本轮改动；本轮重新抽查全部引用行，逐条与实现相符：存储键 `OAUTH_TOKEN`/`OAUTH_REFRESH_TOKEN`/`OAUTH_EXPIRES_AT`（`oauth_helpers.ts:9-11`）；`is_token_response` 只认 `access_token`、`is_error_response` 只认 `error`（`oauth_helpers.ts:79-89`）；`form_encode` 与 `grant_type=refresh_token&client_id=…&refresh_token=…`（`oauth_helpers.ts:91-93`、`device_code_oauth_manager.ts:118-125`）；`compute_expires_at` 依赖响应体 `expires_in`（`oauth_helpers.ts:137-140`）且缺失时退化为 `REFRESH_RETRY_DELAY_MS`（`device_code_oauth_manager.ts:445`，常量 `oauth_helpers.ts:18`=60s）；`refresh_now` 返回 `RefreshResult` + `refresh_in_flight` 去重 + `token_generation`（`device_code_oauth_manager.ts:321-373`）；401 即时刷新门控 `definition.manifest.auth?.method !== "oauth_device"`（`refresh-service.ts:276`）且仅 grok/kimi 注册（`index.ts:412-423`，其余 provider `return undefined`）；kimi_web 为 `auth.method = "web_login"`、`secret_name = "SESSION_COOKIE"`（`connectors/kimi_web/manifest.json`）；`KIMI_TOKEN_URL = https://auth.kimi.com/api/oauth/token`（`kimi_oauth_manager.ts:29`）。结论仍是「形态可对齐、实现不能直接复用」，未被修回成 Round 1 的错误判断。
    - `t491_gen_f002`：**仍保持已消除**。`code/cookie_probe.mjs` 与 `report.md:82-90` 第 3 节一致：C1 cookie-only 打 `RefreshToken`、C2 cookie-only 打 `GetSubscriptionStats`、C3 refreshToken-only 对照；脚本只打印 `cookie_count`/`cookie_names`/cookie header 的 sha8 与响应状态/`code`/`got_access_token`，不打印 cookie 值，无凭据泄漏。
    - `t491_gen_f003`：**仍保持已消除**。`report.md:29-39`「凭据销毁」小节仍在；本轮重跑 `node docs/spikes/s039_kimi_web_bearer_mint_probe/code/scan_credentials.mjs` 得 `{"scanned_files":11,"hits":0}`、退出码 0；另对 `docs/` 全目录跑 JWT 结构正则（`eyJ….….…`）与 `(kimi_session|HMACCOUNT_BFESS|msh_user_id|access_token|refresh_token)=<16+ 字符>` 扫描均零命中。`.scratch/kimi-spike/` 下现仅 5 个 `.log` 与本轮 prompt 副本 `review_prompt_round3.txt`（读之无凭据），无活动凭据；`.scratch` 已被 `.gitignore` 忽略。
    - `t491_gen_f004`：**仍保持已消除**。`report.md:62` 说明、第 2 节表「脚本」列、`minimal_camel`/`with_headers_camel` 行如实标注 connect + content-type + Accept + Origin/Referer（与 `refresh_probe.mjs:44-51` 一致）、最小性结论引用 `error_probe.mjs` 的 E7（`report.md:69`，仅带 `content-type`→200）均在，未被本轮改动。
- 本轮新发现：0 条（0 critical / 0 important / 0 minor）
- AC 复验方式（逐条）：
    - AC-001：`trust_prior`——在线扫码抓包与 cookie-only 实测不可独立复验；依赖 s039 报告第 3 节记录表与 `cookie_probe.mjs` 脚本本身（脚本已由 reviewer 读取比对一致）。
    - AC-002：`re_verified`——本轮重读 `oauth_helpers.ts` / `device_code_oauth_manager.ts` / `refresh-service.ts` / `index.ts` 相关行，逐项与 `report.md:137-154` 映射表相符。
    - AC-003：`trust_prior`——「不存在 HTTP 续期路径则按 token pump」的判据属实测结论；依赖报告否定样本记录。
    - AC-004：`trust_prior`——「无需常驻浏览器/后台导航」为实测结论。
    - AC-005：`trust_prior`——20 分钟空闲观测（`report.md:107-115`，观测时长与方式已写明）为实测结论。
    - AC-006：`re_verified`——本轮重跑 `scan_credentials.mjs`（11 文件 0 命中、退出码 0）并对 `docs/` 全目录另跑 JWT/cookie 正则扫描零命中。
    - coverage = 2/6（re_verified / 总 AC 数）；`trust_prior` 占比 4/6 > 30% → 建议合并前人工抽查 trust_prior 项（AC-001/003/004/005 的在线实测证据）。
- 未进表的提示：
    - `code/cookie_probe.mjs`、`code/scan_credentials.mjs` 仍为未跟踪且未执行 `git add -N`（`git status --short` 显示 `??`），故不出现在 `git diff 91c6b73e…` 中；reviewer 已直接读取两文件，且 `review_scope` 指纹经 `git ls-files --others --exclude-standard` 已纳入未跟踪交付物，无 reviewer 看不到的隐藏交付文件，故不判 INCOMPLETE——但提交时仍需 `git add` 纳入，否则 spec AC-006 的复核命令与 f002 证据脚本会缺失（与 Round 2 同类提示，非 finding）。
    - `report.md` 第 3 节末尾有两张相邻且同为 `|样本|请求|结果|` 的表（`report.md:84-88` 的 C1-C3 与 `report.md:92-99` 的 B1/B2/N1-N4），第二张表缺引出句、易被误读为同一张续表；属排版可读性且非本轮改动引入，不计 finding。
    - diff 仍只触及 `docs/`（`docs/findings/d060_*.md`、`docs/spikes/s039_*/`、`docs/tasks/t491_*/{spec,task}.md`），未动 `src/`、`connectors/`，与契约区「非范围」一致；无文件过大/复杂度问题（最大单文件 `probe.mjs` 302 行）。
- 总体判断：Round 2 唯一 finding（minor，f005）已按事实修复，Round 1 的 4 条 finding（f001~f004）复核后仍保持已消除、无修回或回归；本轮 diff 相较 Round 2 仅改 `report.md` 一行且不改变任何结论；无未解决 critical/important，判 PASS。
- 系统性 follow-up：无（Round 1 的 `kimi_web_refresh_adapter_mapping` 建议已由 `d060` / report AC-002 提供输入，t492 落地即可）。

verdict: PASS
