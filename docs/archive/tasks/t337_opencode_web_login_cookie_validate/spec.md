# Task spec

## 背景

OpenCode Go 网页登录（web_login，t098 添加弹窗 + t278 对齐）捕获 cookie 时不做有效性验证，且捕获点在 `on_before_send_headers`（请求头发送前）——OAuth 回跳第一个 opencode.ai 请求仍带登录前匿名 cookie，认证 cookie 由回跳响应 Set-Cookie 才设置，此时已捕获匿名 cookie 并 `saved:true` 回传。前端保存后，opencode_go connector `/auth` 判定失效（期望 3xx+workspace，实际 200 登录页），采集报「Cookie 可能已失效，未跳转到 workspace」（p148，`.scratch/repro-cookie-timing.ts` 复现 `{"saved":true,"cookie":"anon=1"}`）。t172 重新登录门控对 opencode 无效——重登走同一缺陷路径。

## 契约区

### 范围

- session-manager（`src/main/core/session/session-manager.ts`）捕获后新增有效性探测：对 `login_url` origin 的 `/auth` 发校验请求，期望 3xx 且 `Location` 含 workspace；不满足则判定无效。
- 无效 cookie 时 `start_login` 返回 `saved:false`，不写 vault；renderer 侧显示明确的「登录态无效，请重新登录或手动粘贴 Cookie」类提示。
- 补捕获时序与有效性校验测试（session-manager.test.ts）。

### 非范围

- 不改 opencode_go connector 采集逻辑（/auth 判定已正确，t115）。
- 不改 grok/kimi oauth_device 流程（t172 已覆盖）。
- 不改手动粘贴 Cookie 路径（走 SettingsForm 保存，不触发 start_login）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：捕获到的 cookie 无法通过有效性校验时，`start_login` 返回 `saved:false`，vault 不写入 SESSION_COOKIE。
- [ ] AC-002：回跳第一个 opencode.ai 请求带匿名 cookie（认证 cookie 尚未由响应 Set-Cookie 设置）的时序下，捕获结果不再判定为登录成功。
- [ ] AC-003：捕获到有效 cookie（/auth 返回 3xx 且 Location 含 workspace）时，`start_login` 返回 `saved:true` 并回传 cookie。
- [ ] AC-004：renderer 在登录态无效时显示可读提示（非「未捕获到 Cookie」歧义文案），引导重新登录或手动粘贴。
- [ ] AC-005：手动粘贴 Cookie 路径不受影响（不经过有效性探测）。
- [ ] AC-006：新增/更新的 session-manager 单测覆盖有效、无效、匿名回跳时序三种场景。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：AC-001/002/003/006 为 session-manager 单测（mock HTTP 探测）；AC-004 为 renderer 组件测试（mock start_login 返回 saved:false 断言错误文案）；AC-005 为手动粘贴路径回归（SettingsForm 不调 start_login）。

## 上下文区

- 来源：p148（2026-08-13 核实：匿名 cookie 被判登录成功，`.scratch/repro-cookie-timing.ts` 复现 `{"saved":true,"cookie":"anon=1"}`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 探测请求的具体 HTTP 实现（连接复用、超时）复用 connector 既有 `ctx.http` 或轻量 fetch，不单独测试框架行为。
- 探测的超时/重试细节：跟随 connector 既有失败语义，不新增重试策略测试。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- session-manager 单测：mock deps 新增的 `verify_cookie`/HTTP 探测依赖，模拟 /auth 返回 302+workspace（有效）与 200 登录页（无效）。
- 时序测试：复用 `.scratch/repro-cookie-timing.ts` 场景（auth 页匿名 → 跳 IdP → 回跳 /auth/callback 匿名）迁入正式测试，断言匿名 cookie 不保存。
- renderer 组件测试：mock `window.usageboard.session.login` 返回 `{saved:false}`，断言显示「登录态无效」类文案而非「未捕获到 Cookie」。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- opencode.ai/auth 无 cookie 时的响应形态（200 登录页 vs 重定向）：connector 已有 `/auth` 判定测试（tests/unit/connector/opencode_go.test.ts）覆盖「非 3xx+workspace 即失效」，本次探测复用该判定，无需新核实。

### 风险与回退

- 风险：探测请求在慢网络下拖长登录流程；探测端点形态变化误伤有效 cookie。
- 回退：探测失败按「无效」处理会让用户看到重登提示，手动粘贴 Cookie 路径不受影响可恢复；探测本身复用 connector /auth 判定，若误判可临时关停该 provider 采集。

### 依赖与约束

- 前置：无（p148 分析已完成，根因确认）。
- 平台/安全：探测请求仅发往 login_url 同源，不引入第三方调用；cookie 仅在 main 进程内校验，不回传 renderer。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：session login 捕获流程新增「有效性探测」步骤说明。
- `docs/blueprint/domain.md`：web_login provider 的登录态有效性语义。
