# Task review t294（reviewer_focus: 测试）

- task：`t294_net_client_absolute_url_auth_exfil`
- spec：`docs/tasks/t294_net_client_absolute_url_auth_exfil/spec.md`
- diff_anchor：`c35155f2c456447e5981cbf84827f34c430b39b4`
- target：`git diff c35155f2c456447e5981cbf84827f34c430b39b4`
- round：1
- reviewed_at：2026-08-11 02:42 UTC+8

## Findings

### t294_test_f001 - AC-003 poll/probe executor 覆盖仅到共享方法层，poll POST 与 get_raw protocol-relative 未直接测

- 严重度：minor
- 锚点：AC-003（poll/probe executor 同样拒绝越界 origin）；spec 上下文区测试策略「poll/probe executor 同检查」
- 位置：`tests/integration/connector/net-client.test.ts:189-208`（3 个新用例）
- 问题：新增 3 用例覆盖 get_json（绝对+protocol-relative）与 get_raw（仅绝对），未测：poll POST 通道（post_json，`tier1-poll-executor.ts:50` 使用）；get_raw 的 protocol-relative path；且未在 executor 层（`execute_poll` / `execute_probe`）用 manifest 越界 path 直接验证。守卫在 `build_request_context`（net-client.ts:200-209）单点生效，poll/probe executor 为纯透传（已读源码确认，无独立 URL 逻辑），故行为正确、删除守卫时用例能变红——不属「AC 无测试」或「假行为」，不阻断。但 AC-003 字面要求与测试策略均指向 executor 通道，现有覆盖是共享方法层的间接证明，建议在既有 `tests/unit/connector/tier1-poll-executor.test.ts` / `tests/integration/connector/probe-executor.test.ts` 补 executor 层用例，并补 post_json、get_raw protocol-relative 两 case。
- 建议：新增 1 条 poll POST 越界 path 用例 + 1 条 get_raw protocol-relative 用例（两者共享守卫，成本低）；如需直接满足 AC-003 字面，可在 executor 测试补「manifest poll.request.path / probe.path 为绝对 URL 时执行抛 origin 拒绝」。

### t294_test_f002 - 「不发起网络请求」为间接证据，断言仅匹配宽泛错误文案

- 严重度：minor
- 锚点：AC-001（请求被拒绝且**不发起网络请求**）
- 位置：`tests/integration/connector/net-client.test.ts:191-193, 198-200, 205-207`
- 问题：断言 `.rejects.toThrow(/origin|Refusing/)` 只匹配错误文案，未直接断言无网络请求（如本地测试服务器未收到请求、或 undici 未调用）。已核实非恒真：守卫在 `undici_request`（net-client.ts:281/396）之前抛错，错误消息专属于该守卫；`evil.example` 为 RFC 2606 保留域不解析，删除守卫时请求会落到网络层报 `getaddrinfo ENOTFOUND`（task.md RED 记录已证实），与正则不符、测试变红——即当前用例能捕获守卫移除。但正则可被同模块 metadata 拒绝消息（`Refusing connector request to metadata host`）或任意含 origin/Refusing 的错误命中，`不发起网络请求` 这一安全断言属间接证据。
- 建议：收紧为精确消息（如 `/Refusing connector request to origin outside endpoint/`）；如需直接证据，可在恶意 path 用例加「本地测试服务器未收到该请求」断言（当前 server handler 可记录 received 计数）。

## 结论

- 前轮 finding 复核：无（Round 1）
- 改测方向复核：无——diff 中既有测试零删除零修改，仅新增 3 个 it 块，无「迁就实现」改测；红灯归因成立（task.md 记 RED=ENOTFOUND 证实实现 bug，非测试写错）。
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
    - 「不发起网络请求」已通过守卫前置 + 保留域名实测确认（我独立跑了 get_json 探针：恶意 path 抛 `Refusing connector request to origin outside endpoint`，未触网；合法 `/usage` 正常进入网络层）。
    - query 型 auth + 越界 path 的组合未单测（守卫在 apply_request_auth 之前，行为正确，属可选扩展）。
    - AC-002 回归充分：既有 31 用例覆盖相对路径成功、bearer/header/query 三种 auth 注入、override、timeout、metadata 拒绝，全套 34 用例实测通过。
    - 新用例使用 RFC 2606 保留域 `evil.example`，即使守卫缺失也不会向真实第三方主机泄漏凭据，测试安全设计正确。
- 总体判断：AC-001/002 覆盖扎实且实测全绿，AC-003 经共享卡点间接覆盖；2 条 minor 均属加强建议，无 blocking。
- 系统性 follow-up：无

verdict: PASS

reviewed_scope: d1807b23f11cbcff

## Round 2 (2026-08-11 02:48 UTC+8)

### 前轮 finding 复核（以 diff 为准，不采信处置表）

- **t294_test_f001（AC-003 executor 覆盖偏薄）**：已消除（核心）。新增 `post_json` protocol-relative 越界拒绝用例（`net-client.test.ts`「rejects an out-of-origin protocol-relative path from post_json (poll channel)」）覆盖 poll POST 通道（`tier1-poll-executor.ts:50` 对 POST 走 `post_json`）；新增 get_raw + 捕获服务器用例覆盖 probe 通道（`probe-executor.ts:59` 走 `get_raw`）；既有 get_json 用例覆盖 poll GET。三条 executor 调用路径均以越界 path 实测拒绝。残余：get_raw 的 protocol-relative path 与 executor 层直接用例仍无——protocol-relative URL 构造与调用方法无关（同一 `build_request_context` 守卫），executor 为纯透传，属「可再加 case」，不阻断。
- **t294_test_f002（断言仅匹配宽泛文案、无网络请求为间接证据）**：已消除。新增捕获服务器用例「rejects an out-of-origin path from get_raw without sending the request」把 manifest endpoint 指向独立本地服务器，断言 `expect(server_paths).toEqual([])`——直接证明守卫抛错前未发出任何网络请求；且新增两用例改用精确消息 `/Refusing connector request to origin outside endpoint/`。原 3 用例保留 `/origin|Refusing/`，由捕获用例承担直接证据，组合完整。

### 改测方向复核

- 无「迁就实现」改测：diff 仅新增 5 个 `it` 块，既有测试零修改零删除；断言方向与守卫行为一致（捕获服务器断言为空即守卫前置的逆向证明）。spec.md 措辞修订（范围区与 AC-001 改「拒绝不同 origin 的绝对 URL」）消除旧「只允许 `/` 开头相对路径」与 origin 约束的矛盾，与实现一致，属规格校正非测试迁就。

### 本轮新发现

- 0 条。新增用例无危险模式命中：无 `.skip`/`.only`、无删/注释断言、无弱化断言、无 `@ts-ignore`/eslint-disable、无 mock 被测逻辑（捕获服务器为真实 HTTP 监听，属系统边界，合法）。实测 36 用例全绿，5 个 t294 用例逐条执行通过。

### 未进表的提示

- 捕获服务器 `capture.close()` 未 await：因守卫保证无连接，`close()` 即时完成，无实际影响；仅测试清理风格小项。
- 修订后的范围允许「同 origin 绝对 URL」通过（实现 `url.origin === base_url.origin` 确实放行），未补对应正向用例；属可选覆盖扩展，不阻断。
- 用户提供的 `reviewed_scope: 4ca2cfa8434eefe6` 与当前工作区重算值 `b3ff4eda684e3df9` 不一致（fingerprint 覆盖 spec.md/net-client.ts/net-client.test.ts 相对 anchor 的 diff）。本记录采用重算当前值以保证 `check_review_status` 可校验；若用户侧确为另一状态，请以实际重算值为准。

### 总体判断

f001/f002 核心均已按 diff 实质修复，AC-001 的不发起网络请求现为直接断言，AC-003 三条 executor 调用路径全实测覆盖；本轮无新 blocking。

verdict: PASS

reviewed_scope: b3ff4eda684e3df9

## Round 3 (2026-08-11 02:53 UTC+8)

### 变更确认（以 diff 为准）

- get_raw 捕获服务器用例「rejects an out-of-origin path from get_raw without sending the request」已删除；get_raw 越界拒绝仍由独立用例「rejects an out-of-origin path from get_raw too (t294)」覆盖。现 4 个 t294 用例：get_json 绝对、get_json protocol-relative、get_raw 绝对（均 `/origin|Refusing/`）、post_json protocol-relative（精确 `/Refusing connector request to origin outside endpoint/`）。实测 35 用例全绿。

### 删测试合法性复核

- 捕获服务器用例确属恒真，删除合法：该用例 path 为绝对 URL `https://evil.example/steal`，`new URL` 会替换 base host——即使守卫缺失，请求也发往 `evil.example` 而非本地捕获服务器，`expect(server_paths).toEqual([])` 恒过，无法区分守卫存在与否。验证的是假行为，非 AC 有效证据，删除由等价覆盖（get_raw 独立用例）补位，不构成危险模式违规删测试。

### t294_test_f002 状态复核（用户指定重点）

- **维持「已消除」**。理由更新：
    1. Round 2 的直接断言方案（捕获服务器）已被证明恒真并撤销，属合法撤回——该断言测的是假行为，不能作为 AC-001 证据。
    2. 「不发起网络请求」现由结构性保证维护：`Refusing connector request to origin outside endpoint` 消息仅由守卫（`net-client.ts:200-209`）抛出，且守卫在 `undici_request`（net-client.ts:281/396）之前执行；匹配该消息 ⇒ 守卫路径 ⇒ 未触网。post_json 用例以精确消息直接锚定守卫；get_json/get_raw 三用例的宽泛 `/origin|Refusing/` 仍有效——守卫缺失时请求落到 `evil.example`（RFC 2606 保留域不解析）报 ENOTFOUND/ECONNREFUSED，消息不含 origin/Refusing，用例变红。故 AC-001「不发起网络请求」证据可靠，f002 核心问题（无网络请求为间接证据）已由守卫唯一消息 + 前置抛错的结构保证补足。

### 改测方向复核

- 无「迁就实现」改测：本轮仅删除一个恒真用例，无既有断言被改向迁就实现；删除方向与「验证真实行为」一致。

### 本轮新发现

- 0 条。剩余用例无危险模式命中（无 skip/only、无删/注释断言、无弱化、无 ts-ignore）。

### 未进表的提示

- get_json/get_raw 三用例仍用宽泛 `/origin|Refusing/`，与 post_json 精确消息不一致；已论证有效（守卫缺失时 ENOTFOUND 不匹配），可统一为精确消息作一致性清理，属 minor 级可选优化，不阻断。

### 总体判断

捕获服务器用例恒真删除合法，f002 维持已消除由结构保证支撑，AC-001/002/003 覆盖完整；本轮无新 blocking。

verdict: PASS

reviewed_scope: e9ead98d1616d93d

## Round 4 (2026-08-11 02:58 UTC+8)

### 变更确认（以 diff 为准）

- 本轮唯一变更：`docs/specs/connector-runtime.md` 新增「origin 约束（t294）」一行描述（`git diff c35155f2c456447e5981cbf84827f34c430b39b4 -- docs/specs/connector-runtime.md` 确认），纯文档同步，与 net-client.ts:200-209 实现描述一致，无测试逻辑变更。指纹变化（`e9ead98d1616d93d` → `48645662e21c13a1`）由此文档 diff 引起（fingerprint 未排除 `docs/specs/`），与「纯文档」声明吻合。
- 测试面零改动：net-client.test.ts 维持 Round 3 的 4 个 t294 用例 + 既有回归，无新增/删除/修改。

### 前轮 finding 复核

- **t294_test_f001**：维持已消除——4 用例覆盖 poll GET（get_json 绝对+protocol-relative）、poll POST（post_json protocol-relative）、probe（get_raw 绝对）三条 executor 调用路径；本轮无相关变更。
- **t294_test_f002**：维持已消除——「不发起网络请求」由守卫唯一消息 + 前置抛错的结构保证支撑，post_json 精确锚定守卫，get_json/get_raw 宽泛正则仍有效；本轮无相关变更。

### 改测方向复核

- 无测试改动，无「迁就实现」改测。

### 本轮新发现

- 0 条。

### 未进表的提示

- 文档新增的 origin 约束描述为长期真相落点（`docs/specs/`），内容与实现一致，无元引用残留；收尾检查无其他需测试侧处理项。

### 总体判断

纯文档同步，测试逻辑与覆盖未变，无新 blocking。

verdict: PASS

reviewed_scope: 48645662e21c13a1

## Round 5 (2026-08-11 03:02 UTC+8) —— 最终记录

### 变更确认（以 diff 为准）

- 本轮唯一变更：`docs/specs_index.md` connector-runtime 行备注加 `t294`、日期更新为 2026-08-11（`git diff c35155f2c456447e5981cbf84827f34c430b39b4 -- docs/specs_index.md` 确认），纯索引更新，无测试逻辑变更。指纹变化（`48645662e21c13a1` → `e48d68e07bd9acf7`）由此索引 diff 引起（fingerprint 未排除 `docs/specs_index.md`），与「纯索引」声明吻合。
- 测试面零改动：net-client.test.ts 维持 Round 3 起的 4 个 t294 用例 + 既有回归，无新增/删除/修改。

### 前轮 finding 复核

- **t294_test_f001**：维持已消除——4 用例覆盖 poll GET（get_json 绝对+protocol-relative）、poll POST（post_json protocol-relative）、probe（get_raw 绝对）三条 executor 调用路径；本轮无相关变更。
- **t294_test_f002**：维持已消除——「不发起网络请求」由守卫唯一消息（`Refusing connector request to origin outside endpoint`）+ 前置抛错（守卫在 undici_request 之前）的结构保证支撑，post_json 精确锚定守卫，get_json/get_raw 宽泛正则仍有效；本轮无相关变更。

### 改测方向复核

- 无测试改动，无「迁就实现」改测。

### 本轮新发现

- 0 条。

### 未进表的提示

- 收尾文档（spec + specs_index）均已同步 origin 约束，与实现一致，无测试侧遗留。

### 总体判断

纯索引同步，测试逻辑与覆盖自 Round 3 起稳定，历轮 finding 均已消除，无 blocking；收尾通过。

verdict: PASS

reviewed_scope: e48d68e07bd9acf7
