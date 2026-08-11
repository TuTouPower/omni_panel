# Task review t294（reviewer_focus: 代码）

- task：`t294_net_client_absolute_url_auth_exfil`
- spec：`docs/tasks/t294_net_client_absolute_url_auth_exfil/spec.md`
- diff_anchor：`c35155f2c456447e5981cbf84827f34c430b39b4`
- target：`git diff c35155f2c456447e5981cbf84827f34c430b39b4`
- round：1
- reviewed_at：2026-08-11 02:41 UTC+8

## Findings

### t294_code_f001 - same-origin 绝对 URL 不被拒绝，与 AC-001 字面不符

- 严重度：minor
- 锚点：AC-001「path 为绝对 URL 或 `//` protocol-relative 时请求被拒绝」；实现仅拒绝 origin 越界，same-origin 绝对 URL 放行
- 位置：`src/main/core/connector/net-client.ts:204`
- 问题：`if (url.origin !== base_url.origin)` 只拦截跨 origin 的绝对 URL / protocol-relative path。`get_json("default", "https://api.example.com/usage")`（path 与 base 同 scheme+host+port）仍会发请求并注入 auth，与 AC-001 字面「绝对 URL 被拒绝」有可观察差距。spec 范围区自身存在两种表述：主句「强制 `url.origin` 等于 endpoint base origin」与括号「或只允许 `/` 开头相对路径」；实现取主句（更宽松）。安全目标（防 auth 外泄到攻击者主机）已达成——same-origin 绝对 URL 只把凭据发给 manifest 已信任的同一主机，无实际外泄缺口，且该行为与修复前一致（修复前一切绝对 URL 都放行），不构成回归。
- 建议：处置为改 spec，将 AC-001 措辞限定为「拒绝 origin 越界的绝对 URL / `//` protocol-relative path」，或反之收紧实现拒绝一切绝对 URL（需评估现有 connector 是否依赖 same-origin 绝对 URL）。二者择一消除 spec 内两处表述冲突。若维持现实现，建议在 AC 或测试里补一句 same-origin 绝对 URL 属合法行为的说明。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：1 条（minor）
- 未进表的提示：
    - 文件过大：`src/main/core/connector/net-client.ts` 475 行（≥ 400 minor 阈值），本 task 净增 10 行，达到降级规则条件；但新增仅为 10 行内联检查，未让单文件职责继续显著膨胀，故仅在结论段提示，不进 finding 表。
    - 复杂度：`build_request_context` 手算近似 CC≈2（1 个 if + 1 个三元），远低于阈值，无提示。
    - 范围外观察：无。
- 总体判断：修复方案与 spec 范围区主句一致——`build_request_context` 构造 URL 后、auth 注入前做 `url.origin` 与 base origin 比对，一处覆盖全部请求通道；poll/probe/主请求（get_json/post_json）与 get_raw 全部经该函数，无遗漏请求通道，无其它 undici/fetch 出站路径。edge 检查（base 子路径、端口含默认端口归一化、hostname 大小写、IPv6、userinfo 跨主机攻击、反斜杠路径）均被 URL.origin 归一化正确覆盖，metadata host 防御保留。AC-001/002/003 机制侧实现完备。仅 1 条 minor（spec 措辞冲突），无未解决 critical / important。
- 系统性 follow-up：无

verdict: PASS

reviewed_scope: d1807b23f11cbcff

## Round 2 (2026-08-11 02:49 UTC+8)

### Findings

#### t294_code_f002 - get_raw 捕获服务器断言恒真，未验证「不发起网络请求」

- 严重度：minor
- 锚点：AC-001「不发起网络请求」子句；测试名与注释声称验证该性质，实际断言无法区分守卫存在与否
- 位置：`tests/integration/connector/net-client.test.ts:217-240`（"rejects an out-of-origin path from get_raw without sending the request"）
- 问题：capture server 监听 `127.0.0.1:<随机端口>`，而被测 path 为 `https://evil.example/steal`。即使移除守卫、请求真实发出，目标也是 `evil.example`（公网）而非 capture server——`expect(server_paths).toEqual([])`（:236）恒真，测试名与注释「Guard runs before any network I/O: the capture server must not see the request」宣称的「不发起网络请求」实际无法被此断言验证。AC-001 的「不发起网络请求」由代码路径保证（throw 在 net-client.ts:204，先于 undici_request :281）并经多条 `rejects.toThrow` 精确断言间接覆盖，非此 capture 断言证明。属「恒真/误导性断言」危险模式（本报告按 minor 处理：核心 reject 行为已被 `rejects.toThrow` 充分覆盖，此断言为无效补充，不使修复可信度受损；若门禁将恒真断言从严，可提升处理）。
- 建议：删除 capture server 与 `expect(server_paths).toEqual([])`，仅保留精确 `rejects.toThrow(/Refusing connector request to origin outside endpoint/)`；或改为真正可观测「不发起网络请求」的手段（如 base 指向不可达 host，守卫失效时抛不同错误使 throws 断言失败）。另 `capture.close()`（:238）未 await，删除 capture server 后一并消除。

### 前轮 finding 复核（Round 2）

- t294_code_f001（minor）：已修。spec.md 范围区（:11）与 AC-001（:39）措辞改为「拒绝**不同 origin** 的绝对 URL 与 `//` protocol-relative」，与实现（`url.origin !== base_url.origin`）一致，原「或只允许 `/` 开头相对路径」括号歧义消除。实现侧 net-client.ts 本轮无新改动，Round 1 结论保持。处置方式为改 spec（与 Round 1 建议一致），正确。

### 结论（Round 2）

- 前轮 finding 复核：t294_code_f001 已修（spec 措辞修订消除与实现的冲突）
- 本轮新发现：1 条（minor）
- 未进表的提示：无（文件过大/复杂度无变化；当前测试文件 571 行 < 600 minor 阈值，未新增量）
- 总体判断：spec 措辞修订正确解决 f001；实现不变，origin 守卫与请求通道覆盖保持 Round 1 结论。新增 2 用例中 post_json protocol-relative 越界拒绝断言精确有效；capture 服务器用例主体（rejects.toThrow）有效，仅补充断言恒真属无效装饰。无未解决 critical / important。
- 系统性 follow-up：无

verdict: PASS

reviewed_scope: b3ff4eda684e3df9

## Round 3 (2026-08-11 02:49 UTC+8)

### Findings

无新 finding。

### 前轮 finding 复核（Round 3）

- t294_code_f001（minor）：已修（Round 2 已确认）。spec 措辞修订，实现不变。
- t294_code_f002（minor）：已修。get_raw 捕获服务器用例已整体删除——`git diff` 确认 capture server / `server_paths` / `expect(server_paths).toEqual([])` 全部移除，测试文件仅保留 4 条越界拒绝用例（get_json 绝对 URL、get_json protocol-relative、get_raw 绝对 URL、post_json protocol-relative）。get_raw 越界拒绝仍由 `"rejects an out-of-origin path from get_raw too"` 用例精确覆盖（`rejects.toThrow`），AC-001「不发起网络请求」由 throw 先于 undici_request 的代码路径结构性保证。恒真断言问题消除。

### 结论（Round 3）

- 前轮 finding 复核：f001、f002 均已修（f002 以用例删除方式处置，与建议一致）
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：实现（net-client.ts origin 守卫）三轮无变化，覆盖全部请求通道；测试侧 4 条精确越界拒绝断言覆盖 get_json/post_json/get_raw 三通道 + 相对路径回归；恒真断言已清除。无未解决 critical / important。
- 系统性 follow-up：无

verdict: PASS

reviewed_scope: e9ead98d1616d93d

## Round 4 (2026-08-11 02:49 UTC+8)

### Findings

无新 finding。

### 前轮 finding 复核（Round 4）

- t294_code_f001（minor）：已修（Round 2/3 确认）。spec 措辞修订，实现不变。
- t294_code_f002（minor）：已修（Round 3 确认）。capture server 用例删除，恒真断言消除。

### 结论（Round 4）

- 前轮 finding 复核：f001、f002 均已修，无回归
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：`docs/specs/connector-runtime.md` NetClient 小节新增「origin 约束（t294）」纯文档段落，逐条核对与已审实现一致（`new URL(path, base)` 构造后 `url.origin` 强制等于 endpoint base origin；不同 origin 绝对 URL / `//` protocol-relative path 在 auth 注入前抛错；do_request 与 get_raw 均经 `build_request_context` 单点校验）。无逻辑变更，实现侧净代码未动。无未解决 critical / important。
- 系统性 follow-up：无

verdict: PASS

reviewed_scope: 48645662e21c13a1

## Round 5 (2026-08-11 02:49 UTC+8)

### Findings

无新 finding。

### 前轮 finding 复核（Round 5）

- t294_code_f001（minor）：已修（Round 2/3/4 确认）。spec 措辞修订，实现不变。
- t294_code_f002（minor）：已修（Round 3/4 确认）。capture server 用例删除，恒真断言消除。

### 结论（Round 5）

- 前轮 finding 复核：f001、f002 均已修，无回归
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：`docs/specs_index.md` connector-runtime 行加 t294 并更新日期，纯索引更新，无逻辑变更，与已审实现/文档一致。所有收尾文档改动完成。无未解决 critical / important。
- 系统性 follow-up：无

verdict: PASS

reviewed_scope: e48d68e07bd9acf7
