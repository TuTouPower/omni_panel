# Task review t492（reviewer_focus: 测试）

- task：`t492_kimi_web_bearer_keepalive`
- spec：`docs/tasks/t492_kimi_web_bearer_keepalive/spec.md`
- diff_anchor：`302fb4be30040b2041fd6eebcdf42c5fe8833659`
- target：`git -C '/Users/testuser/kar/code/omni_panel_t492' diff 302fb4be30040b2041fd6eebcdf42c5fe8833659`
- round：1
- reviewed_at：2026-09-16 09:23 UTC+8

## Findings

### t492_test_f001 - AC-002 的「Bearer 缺失」输入未在真实 trySilentCookieRefresh 上驱动

- 严重度：minor
- 锚点：AC-002（「续期通道无法产出可用新 Bearer（过期或**缺失**）时，静默刷新路径不报告成功」）；spec 可测试性声明 AC-002（「以过期/缺失 Bearer 驱动真实 `trySilentCookieRefresh`」）
- 位置：`tests/unit/ipc/auth-ipc.test.ts:657-698`（trySilentCookieRefresh 的 AC-002 用例组）
- 问题：无 refresh token 的旧凭据分支只驱动了两条输入——「Bearer 过期」（`authorization: Bearer ${make_jwt(seconds_from_now(-60))}`，:661）与「Bearer 仍有效」（`+600`，:683）；token 被拒另有 :631 覆盖。但「Bearer 缺失」（`authorization` 字段不存在/非字符串/非 JWT）从未经真实 `trySilentCookieRefresh` 驱动：该分支（`is_bearer_usable(undefined)===false` → NO_SILENT_REFRESH，`src/main/ipc/auth-ipc.ts:717-722`）目前只有 `tests/unit/auth/kimi_web_token_refresher.test.ts:is_bearer_usable` 的单测覆盖（`is_bearer_usable(undefined)/""`）。可测试性声明明确列了「过期/缺失」两种输入，缺失一路缺集成级证据（非「有意不测」项）。
- 建议：加一条 kimi_web 旧凭据（JSON 无 `refresh_token`、无 `authorization`）驱动 `trySilentCookieRefresh`，断言 `{refreshed:false, credential_changed:false}` 且 `secretsStore.set` 未被改写。

### t492_test_f002 - 被删 t469 用例覆盖的「SESSION_COOKIE 非 JSON / 缺失」降级分支未在新用例接续

- 严重度：minor
- 锚点：AC-005（替换 t469 假绿用例）；删除的覆盖未在同等层补回
- 位置：删除的 `tests/unit/ipc/auth-ipc.test.ts`「t469 AC-003: Kimi refresh without Bearer falls back instead of overwriting secret」（旧 secret = `"legacy-cookie-only"`）对应生产 `src/main/ipc/auth-ipc.ts:698-708`（JSON.parse 失败 → NO_SILENT_REFRESH）与 :693-697（secret 缺失分支）
- 问题：被删用例以**非 JSON** 的 `SESSION_COOKIE` 驱动了 kimi 静默刷新的解析失败降级路径，并把「不写回」作为期望；新用例（`tests/unit/ipc/auth-ipc.test.ts:566-699`）全部使用 JSON secret，`existing === null` 与 JSON.parse 抛错两条防御分支在 auth-ipc 层随之失去覆盖。删除本身由 AC-005 授权（属合法删除），但对应覆盖未接续。
- 建议：补一条非 JSON（或缺失）`SESSION_COOKIE` 的 kimi_web 用例，断言 `{refreshed:false, credential_changed:false}` 且 `deps.secretsStore.set` 未被调用。

## 结论

- 前轮 finding 复核：首轮，无（`docs/tasks/t492_kimi_web_bearer_keepalive/review_test.md` 之前不存在）。
- 改测方向复核：**无**。diff 中改动既有测试的点逐处核对：
    - `tests/integration/scheduler/refresh-service.test.ts:681,979`：既有两条用例 `return { saved: true }` → `return { saved: true, credential_changed: true }`。这是 `RefreshServiceDeps.sessionLogin` 返回类型新增必填字段 `credential_changed` 后的接口适配；`credential_changed:true` 表示「真的换到了新凭据」，与原用例「重登成功 → 重试」语义一致，属改「应有的预期」，非迁就实现。
    - `tests/unit/ipc/auth-ipc.test.ts`：`expect(ok).toBe(true/false)` → `expect(result).toEqual({refreshed:…, credential_changed:…})`（:762、:823）为接口形状迁移，断言强度不降反升。
    - t469 两条假绿用例（把「原样保留过期 authorization」当期望）整体删除并由新语义用例替换，符合 AC-005，未就地改预期。
    - 无 `toBe → toContain/正则/>=/toMatchObject` 的弱化式迁移，无删/反转/注释掉断言。
- 危险模式扫描：新增/改写用例中未命中 `.skip`/`.only`/恒真断言/删 expect/注释断言/`eslint-disable`/`@ts-ignore`/条件跳过弱化断言/阈值掩盖。`tests/unit/session/session-manager.test.ts:1786`（“读不到 refresh_token”用例）用 `toMatchObject` 断言 `{cookie, authorization, refresh_token:null}`——因该路径下 `session_id/device_id` 亦为 null 属预期，使用有正当理由，非弱化既有断言，不计 finding。新增测试的 mock 仅落在系统边界（Electron window、会话 cookie store、HTTP `http_post`/`kimi_web_refresh`、`execute_connector` 生产测试缝），未 mock 被测自有类/内部函数。
- 本轮新发现：2 条（均 minor）。
- 未进表的提示：
    - `tests/unit/ipc/auth-ipc.test.ts:769`「returns false when manifest declares no cookieNames (P1-4)」因 fixture 缺 `manifestId` 实际走的是 `definition not found` 分支，与期望对象恰好相同而变绿，并未覆盖 `!cookie_names.length`(:585-589) 分支——根因即 p236（同一文件同源缺 `manifestId`），已登记，不重复计 finding。
    - 可选扩展（不阻断）：AC-003 的「未换到新 Bearer 不计入成功重登」是用注入的 `credential_changed:false` 验证的；`refresh-service` 的 `saved && credential_changed`（`src/main/core/scheduler/refresh-service.ts:441`）以「整份凭据是否变化」代理「Bearer 是否变化」。kimi 旧凭据（无 refresh_token、本地 `exp` 未到但服务端已 401）下，cookie 变化会令 `credential_changed=true` 却仍用同一 Bearer 重试一次——该组合无用例覆盖。spec 可测试性对 AC-003 的验收定义已按现方案收敛（「断言两次请求携带的 Bearer 不同；未换新时断言该轮不判定为重登成功」），故不作 finding，仅作可选覆盖提示。
    - 环境/基线（与 base `302fb4be` 一致，不计本 task 缺陷）：本机 `npx vitest run --project node tests/integration/scheduler/refresh-service.test.ts tests/unit/ipc/auth-ipc.test.ts` 得 13 failed / 39 passed，失败名与 p236 所列 7（auth-ipc）+6（refresh-service）逐条吻合，无本 task 新增失败；renderer 项目 `tests/unit/renderer/components/provider_card_states.test.tsx` 本机整体 `React.act is not a function`，AC-006 渲染层断言无法本地执行；全量 `pnpm test` 本机 Node 24 触发 p228。
- 总体判断：实现与测试方向正确，AC 覆盖与可信度达标，t469 假绿用例按 AC-005 整体删除并由新语义用例替换；仅余 2 条 minor 覆盖扩展，无未解决的 critical / important。
- 系统性 follow-up：已有 `p236`（`docs/pending/todo/p236_t471_test_fixtures_missing_manifest_id.md`，本次 diff 一并新增）——覆盖 13 例 manifestId 陈旧 fixture；本轮不新增 follow-up 建议。

### AC 复验方式

- AC-001：`re_verified` — 重跑 `npx vitest run --project node tests/integration/scheduler/refresh-service.test.ts`，「t492 AC-001: refreshed credential is used for the retry and collection succeeds」通过；断言两次采集凭据不同（stale → fresh-bearer）且终态 `ready`/1 item，用时 3007ms 证实经 2s 等待后重试。
- AC-002：`re_verified` — 重跑 `npx vitest run --project node tests/unit/ipc/auth-ipc.test.ts`，两条 `t492 AC-002` 用例通过；逐条查证断言 `{refreshed:false, credential_changed:false}` 且 vault 未被改写。
- AC-003：`re_verified` — 重跑 refresh-service，`t492 AC-003` 用例通过；对照 `src/main/core/scheduler/refresh-service.ts:441-467` 确认「凭据未变 → 不 continue 重试 → 直接失败」，断言 sessionLogin 1 次、仅 1 次采集、终态 failed。
- AC-004：`re_verified` — auth-ipc「AC-001/004」用例与 `tests/unit/session/session-manager.test.ts` 三条 t492 用例通过；断言写回 JSON 保留 `session_id/device_id`、`cookie` 更新、`refresh_token` 落盘为轮换新值。
- AC-005：`re_verified` — 查证 `git -C '/Users/testuser/kar/code/omni_panel_t492' diff 302fb4be…` 中 t469 两条假绿用例整体删除、新增 8 个 t492 用例，替换由 diff 注释标明。
- AC-006：`trust_prior` — 依赖实施侧产出的证据：渲染层「重新登录」入口/统一文案断言位于 `tests/unit/renderer/components/provider_card_states.test.tsx:203-225`，本机 renderer 项目整体 `React.act` 故障无法执行（base 同样）；非 UI 的两路已 `re_verified`（`tests/unit/shared/auth-error.test.ts` 与 `tests/integration/connector/kimi_web_connector.test.ts:901` 均通过）。
- AC-007：`trust_prior` — `[deploy]`，需真实账号 ≥20 分钟连续采集，依赖部署后人工验收证据。

coverage = 5 / 7

reviewed_scope: d920435360753ea1

verdict: PASS

## Round 2 (2026-09-16 09:34 UTC+8)

### 前轮 finding 复核（以 `git -C '/Users/testuser/kar/code/omni_panel_t492' diff 302fb4be30040b2041fd6eebcdf42c5fe8833659` 与测试本身为准）

- **t492_test_f001 —— 已消除。** 新增用例 `tests/unit/ipc/auth-ipc.test.ts:702`「t492 AC-002: Bearer 字段缺失时静默刷新不报成功」：`secrets_store["kimi-missing-bearer:SESSION_COOKIE"]` 是无 `authorization`、无 `refresh_token` 的 JSON，经真实 `trySilentCookieRefresh` 驱动，断言 `{refreshed:false, credential_changed:false}` 且 vault 原值保留。走查命中 `src/main/ipc/auth-ipc.ts:364-372`（`refresh_token` 为空 → `!is_bearer_usable(undefined)` → NO_SILENT_REFRESH），且非被其它提前返回蒙对：用例提供了非空 cookie（`kimi_session=new-cookie`），若移除该判定会落到 `write_session_secret` 报 `refreshed:true`、断言即红。`npx vitest run --project node tests/unit/ipc/auth-ipc.test.ts -t "t492"` → **7 passed**（含本用例）。f001 的「缺失输入未驱动真实函数」缺口补齐。
- **t492_test_f002 —— 已消除。** 新增用例 `tests/unit/ipc/auth-ipc.test.ts:721`「t492: 非 JSON 的旧凭据（纯 cookie 字符串）不报成功也不被覆盖」：`SESSION_COOKIE = "legacy-cookie-only"`（与被删 t469 用例同一输入形态），经真实 `trySilentCookieRefresh` 驱动，断言 `{refreshed:false, credential_changed:false}` 且 vault 原值保留，命中 `src/main/ipc/auth-ipc.ts:349-358`（JSON.parse 抛错 → NO_SILENT_REFRESH）。被删用例覆盖的降级路径已在同一层接续。
    - 残留（另记新 minor f003）：f002 问题描述同时点名 `existing === null`（kimi secret 缺失，`auth-ipc.ts:343-347`）分支，本轮仍无 auth-ipc 层用例。因 f002 的最小修复建议为「非 JSON（或缺失）」，且被删 t469 用例本就只覆盖非 JSON 一路，f002 本身判已消除；另一路缺口以新 finding 记录。

### 新发现

#### t492_test_f003 - kimi secret 缺失（`existing === null`）降级分支仍无 auth-ipc 层用例

- 严重度：minor
- 锚点：AC-002 的防御性降级路径覆盖；无行为缺陷，属「可以再补一个 case」（不阻断）
- 位置：生产 `src/main/ipc/auth-ipc.ts:343-347`（`const existing = await deps.secretsStore.get(secretKey); if (!existing) return NO_SILENT_REFRESH;`）；测试 `tests/unit/ipc/auth-ipc.test.ts:566-734`（7 条 t492 用例全部预设了 `SESSION_COOKIE`）
- 问题：7 条 kimi 用例分别覆盖「有 secret：换新 Bearer / 无 cookie 续期 / token 被拒 / 无 refresh token 且 Bearer 过期 / Bearer 有效只换 cookie / Bearer 字段缺失 / 非 JSON」，但没有一条让 `secretsStore.get` 返回 `null`，`existing === null` 这条独立防御分支在集成层不可达。失败场景：kimi_web 实例已配置但尚未登录（vault 无 `SESSION_COOKIE`）时触发刷新，走该分支返回 `{refreshed:false, credential_changed:false}` 回退交互式登录——逻辑正确但无测试锁定，后续改动误删/误改此分支不会被发现。
- 建议：在 `tests/unit/ipc/auth-ipc.test.ts` 增加一条 kimi_web 用例，不预设 `secrets_store[...]`，断言 `{refreshed:false, credential_changed:false}` 且 `secretsStore.set` 未被调用。

### Round 2 危险模式与改测方向复核

- 改测方向：本轮改测点为 `tests/integration/scheduler/refresh-service.test.ts:679,979`（`return { saved: true }` → `{ saved: true, credential_changed: true }`）。`RefreshServiceDeps.sessionLogin` 返回类型新增必填 `credential_changed`，而这两条用例里 `sessionLogin` **确实**把 vault 凭据由 `"expired"` 换成 `"valid"`（真的换到了新凭据）→ 属「改应有的预期」，非迁就实现。`tests/unit/ipc/auth-ipc.test.ts` 被改写的自定义连接器用例由 `expect(ok).toBe(true)` 转为 `expect(result).toEqual({refreshed:true, credential_changed:true})`，断言强度不降反升。**无**迁就实现的改测。
- 危险模式扫描：新增/改写用例未命中 `.skip/.only/@Ignore`、恒真断言、删/反转 expect、注释断言、`eslint-disable`/`@ts-ignore`、`if(cond){expect}` 条件跳过、阈值（timeout/重试/容差）增大掩盖问题。`tests/unit/session/session-manager.test.ts:312` 的 `toMatchObject` 是新增用例自带（非弱化既有断言），且该降级路径下 `session_id/device_id` 亦为 `null`，用法有正当理由。
- mock 边界：新增用例的 mock 仍只落在系统边界——`ctx.http.post_json`（connector 宿主 HTTP）、Electron `SessionWindow` 替身 `MockWindow`、会话 cookie store、`kimi_web_refresh`（production 测试缝，`src/main/ipc/auth-ipc.ts:45`）、`sessionLogin`（`RefreshServiceDeps` 缝）。未 mock 被测自有类/内部函数。`tests/unit/session/session-manager.test.ts:40-51` 的 `MockWindow.read_local_storage` 现对「窗口已销毁」的读取抛错，复刻 Electron 在 `closed` 后 `executeJavaScript` 必失败的真实宿主行为（`read_local_storage_fails` 再覆盖读取中途失败），修掉了前轮 code f001 所记「mock 无条件返回 localStorage 掩盖恒 null」的问题，属测试基础设施可信度增强。
- 无新增 `.skip`/删测试/注释断言；t469 两条假绿用例的删除由 AC-005 授权且已由新语义用例替换（见 f002 复核）。

### Round 2 AC 复验方式

- AC-001：`re_verified` — `npx vitest run --project node tests/integration/scheduler/refresh-service.test.ts -t "t492"`（AC-001 用例 passed，耗时 ~3008ms，证实经 2s 等待后以新 Bearer 重试并产出 1 观测）；auth-ipc `-t "t492"` 的 AC-001/004 与「partition 无 cookie」两条 passed。
- AC-002：`re_verified` — auth-ipc `-t "t492"` 7 passed，含 token 被拒 / 无 refresh token 且 Bearer 过期 / Bearer 字段缺失 / 非 JSON 四条降级断言。
- AC-003：`re_verified` — refresh-service `-t "t492"` AC-003 用例 passed（sessionLogin 1 次、采集 1 次、终态 failed）。
- AC-004：`re_verified` — auth-ipc AC-001/004 断言写回保留 `session_id/device_id`、`cookie` 更新、`refresh_token` 轮换；`tests/unit/session/session-manager.test.ts`（33 passed）断言入库 JSON 字段。
- AC-005：`re_verified` — diff 中 t469 假绿用例整体删除并由新语义用例替换；`tests/unit/auth/kimi_web_token_refresher.test.ts` 9 passed。
- AC-006：`re_verified`（非 UI 两路）+ `trust_prior`（渲染层一路）— `tests/integration/connector/kimi_web_connector.test.ts` 6 passed（含新 connector 文案映射）、`tests/unit/shared/auth-error.test.ts` 8 passed；渲染层断言 `tests/unit/renderer/components/provider_card_states.test.tsx:203-224` 因本机 renderer 项目整体 `React.act is not a function`（base 同样）无法本地执行，依赖实施侧证据。
- AC-007：`trust_prior` — `[deploy]`，需真实账号 ≥20 分钟连续采集，依赖部署后人工验收。

coverage = 6 / 7（AC-006 渲染层一路与 AC-007 为 `trust_prior`；trust_prior 占比 2/7 < 30%）

### Round 2 结论

- 前轮 finding 复核：t492_test_f001 **已消除**；t492_test_f002 **已消除**（其点名的 `existing===null` 兄弟分支残留缺口另记新 minor f003）。
- 改测方向复核：**无**迁就实现的改测。
- 本轮新发现：1 条（minor，f003）。
- 本轮危险模式：0 命中。
- 未进表的提示：
    - 环境/基线（与 base `302fb4be` 一致，不计本 task 缺陷）：`npx vitest run --project node tests/unit/ipc/auth-ipc.test.ts` → **7 failed / 15 passed**，`tests/integration/scheduler/refresh-service.test.ts` → **6 failed / 26 passed**，失败名与 p236 所列 7+6 逐条吻合，无本 task 新增失败；本机 `pnpm test` 全量 Node 24 触发 p228；renderer 项目整体 `React.act is not a function`。
    - `tests/unit/ipc/auth-ipc.test.ts:804`「returns false when manifest declares no cookieNames (P1-4)」与 `:736`「uses instance-scoped partition …」因 fixture 缺 `manifestId`，命中的仍是 `definition not found` / `插件不存在` 早返回（p236 根因），并非 `!cookie_names.length`（`auth-ipc.ts:268-271`）或 cookie 写回分支；前者与期望对象恰好同形而变绿，覆盖名不副实——根因已在 base 复现并登记 p236，不重复计 finding。
    - AC-003 的「未换到新 Bearer 不计入成功重登」由注入 `credential_changed:false` 验证，`credential_changed` 仍以整份凭据是否变化为准（`src/main/ipc/auth-ipc.ts:325`）；但本轮无 refresh token 的旧凭据分支已显式传 `credential_changed:false`（`auth-ipc.ts:381`），Round 1 未进表提示中「旧凭据只换 cookie 仍被计成功 → 空转一轮」的变体已不再成立，故不作 finding。
- 总体判断：Round 1 两条 minor 覆盖缺口均已按建议补齐并经独立复跑验证，无未解决的 critical / important，仅余 1 条 minor 覆盖扩展。
- 系统性 follow-up：已有 `p236`（覆盖 13 例 manifestId 陈旧 fixture）；本轮不新增 follow-up 建议。

reviewed_scope: 2f19ee8835bf8dc3

verdict: PASS

## Round 3 (2026-09-16 09:40 UTC+8)

### 前轮 finding 复核（以 `git -C '/Users/testuser/kar/code/omni_panel_t492' diff 302fb4be30040b2041fd6eebcdf42c5fe8833659` 与测试本身为准）

- **t492_test_f003 —— 已消除。** 本轮唯一变更即新增用例 `tests/unit/ipc/auth-ipc.test.ts:736`「t492: 实例没有任何 kimi 凭据时不报成功也不写入」：**不**预设 `secrets_store["kimi-absent:SESSION_COOKIE"]`（`beforeEach` 每例清空 `secrets_store`，:494），经真实 `trySilentCookieRefresh(kimi_deps("kimi-absent"), "kimi-absent")` 驱动，断言 `{refreshed:false, credential_changed:false}`（精确 `toEqual`）且 `secrets_store["kimi-absent:SESSION_COOKIE"]` 仍为 `undefined`（等价「`secretsStore.set` 未被调用」，`set` mock 会写入该 map，:548-551）。走查命中 `src/main/ipc/auth-ipc.ts:343-347`（`existing === null` → `NO_SILENT_REFRESH`）。用例用 `kimi_deps`（含 `manifestId: "kimi_web"`，:535），**不**落入 p236 的 `definition not found` 早返回，非假绿。`npx vitest run --project node tests/unit/ipc/auth-ipc.test.ts -t "t492"` → **8 passed**（含本用例，Round 2 为 7）。
    - 精度说明（**不另计 finding**）：因 `auth-ipc.ts:343` 的 `!existing` 守卫与紧随其后 `:351` 的「`JSON.parse` 结果为 `null`」守卫对 `existing === null` 行为等价（`JSON.parse(null)` → `null`，即在 `:351-353` 提前返回，同样返回 `NO_SILENT_REFRESH`、同样不写入），本用例无法区分二者的删除。但删除该守卫**不改变任何可观察行为**，故 f003 所述「误删此分支不会被发现」实为无行为差异的冗余守卫；用例已锁定全部可观察结果（不报成功 + 不写入），f003 视为已消除。

### 新发现

本轮无新 finding。

### Round 3 危险模式与改测方向复核

- 改测方向：本轮**仅新增一条用例**，未改动任何既有测试的断言 → **无**迁就实现的改测。
- 危险模式扫描：新用例未命中恒真断言 / 删·反转 expect / 注释断言 / `.skip`·`.only`·`@Ignore` / `eslint-disable`·`@ts-ignore` / 条件跳过弱化断言 / 阈值（timeout/重试/容差）掩盖；断言为精确等值（`toEqual`）+ 未写入检查（`toBeUndefined`），未见弱化。mock 仍只落在系统边界（fake vault `secretsStore`、`configStore`、Electron cookie store、`kimi_definition`），未 mock 被测自有类/内部函数。全 diff 扫 `tests/` 下 `eslint-disable` 仅命中 `tests/integration/connector/kimi_web_connector.test.ts:57`（`@typescript-eslint/unbound-method`），为 base `302fb4be` **既有**、非本 diff 新增。

### Round 3 AC 复验方式

- AC-001：`re_verified` — `npx vitest run --project node tests/integration/scheduler/refresh-service.test.ts -t "t492"` AC-001 用例 passed（耗时 3013ms，证实经 2s 等待后以新 Bearer 重试并产出 1 观测）；auth-ipc `-t "t492"` 的 AC-001/004 与「partition 无 cookie」两条 passed。
- AC-002：`re_verified` — auth-ipc `-t "t492"` **8 passed**，含 token 被拒 / 无 refresh token 且 Bearer 过期 / Bearer 字段缺失 / 非 JSON / **本轮新增无凭据**五条降级断言。
- AC-003：`re_verified` — refresh-service `-t "t492"` 2 passed（sessionLogin 1 次、采集 1 次、终态 failed）。
- AC-004：`re_verified` — auth-ipc AC-001/004 断言写回保留 `session_id/device_id`、`cookie` 更新、`refresh_token` 轮换；`tests/unit/auth/kimi_web_token_refresher.test.ts` + `tests/unit/session/session-manager.test.ts` + `tests/unit/shared/auth-error.test.ts` 三文件 **50 passed**。
- AC-005：`re_verified` — diff 中 t469 假绿用例整体删除并由新语义用例替换（旧用例未就地改预期）。
- AC-006：`re_verified`（非 UI 两路）+ `trust_prior`（渲染层一路）— `tests/integration/connector/kimi_web_connector.test.ts` **6 passed**（含新 connector 文案映射）；渲染层断言 `tests/unit/renderer/components/provider_card_states.test.tsx:203-224` 因本机 renderer 项目整体 `React.act is not a function`（base 同样）无法本地执行，依赖实施侧证据。
- AC-007：`trust_prior` — `[deploy]`，需真实账号 ≥20 分钟连续采集，依赖部署后人工验收。

coverage = 6 / 7（AC-006 渲染层一路与 AC-007 为 `trust_prior`；trust_prior 占比 2/7 < 30%，无需人工抽查行）

### Round 3 结论

- 前轮 finding 复核：t492_test_f003 **已消除**（新增 auth-ipc 用例覆盖「无 kimi 凭据」分支，经独立复跑 `-t "t492"` 8 passed 验证）。
- 改测方向复核：**无**（本轮只新增、未改既有断言）。
- 本轮新发现：0 条。
- 本轮危险模式：0 命中。
- 未进表的提示：
    - 新增用例的断言精度受上游 `!existing` 与 null-object 双守卫冗余限制（见 f003 复核「精度说明」），无法区分二者删除，但无行为差异，不阻断、不另计 finding。
    - 环境/基线（与 base `302fb4be` 一致，不计本 task 缺陷）：auth-ipc 全文件 `7 failed / 16 passed`（Round 2 为 7 failed / 15 passed，+1 即本轮新增用例），7 条失败均为 p236（缺 `manifestId`，`handleCookieLogin` 组）base 既有；refresh-service 全文件 `6 failed / 26 passed`（同 base、同 p236）。
- 总体判断：Round 2 唯一遗留的 minor 覆盖缺口（f003）已按建议补齐并经独立复跑验证，无未解决的 critical / important，本轮 0 新发现、0 危险模式命中。
- 系统性 follow-up：已有 `p236`（覆盖 13 例 manifestId 陈旧 fixture）；本轮不新增 follow-up 建议。

reviewed_scope: b7e27fe30c043923

verdict: PASS
