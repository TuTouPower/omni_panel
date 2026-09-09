# Task spec

## 背景

Kimi Web 的 manifest 使用 `cookieNames: ["*"]`，但静默会话刷新按具体 Cookie 名称匹配，导致永远找不到匹配项。刷新服务因此回退到交互式 `handleCookieLogin`，每次会话刷新都会创建新的登录窗口。另外，Kimi 登录凭据以包含 Cookie、Bearer、session_id、device_id 的 JSON 保存，静默刷新若直接覆盖为纯 Cookie，会丢失 Bearer 等连接所需凭据。

## 契约区

### 范围

- 正确处理 `cookieNames: ["*"]` 的静默刷新，不因通配符误判而打开新的登录窗口。
- 静默刷新 Kimi Web 会话时保留或正确更新 Bearer、session_id、device_id 等已保存凭据，不把 Kimi 会话覆盖成无法使用的纯 Cookie 字符串。
- 补充覆盖通配符匹配、凭据保留以及刷新失败回退行为的自动化测试。

### 非范围

- 不改变 Kimi Web 用量接口、指标名称、用量计算或登录页面地址。
- 不改变用户主动点击“网页登录”时打开登录窗口的行为。
- 不改变 Grok/Kimi OAuth device-code 登录流程及其它非 session 认证连接器的凭据格式。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：配置 `cookieNames: ["*"]` 的 Kimi Web 实例执行会话静默刷新时，能从该实例持久化会话分区读取实际 Cookie 并判定刷新成功，不调用交互式登录窗口创建路径。
- [ ] AC-002：Kimi Web 静默刷新完成后，连接器仍能取得有效 Cookie 与 Bearer Authorization；已保存的 session_id、device_id 在刷新未产生新值时不丢失。
- [ ] AC-003：非通配符 Cookie 配置的现有静默刷新语义保持不变；缺少必要会话凭据或静默刷新确实失败时，仍按既有逻辑回退到交互式登录，并且该回退最多由一次刷新请求触发一个登录流程。
- [ ] AC-004：自动化测试覆盖通配符 Cookie 匹配、Kimi JSON 凭据保留/更新、成功静默刷新不创建窗口，以及失败回退创建窗口的行为。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：2026-09-09 对 Kimi Web 会话刷新路径的代码核查；无外部来源。已确认 `connectors/kimi_web/manifest.json` 使用 `cookieNames: ["*"]`，而 `trySilentCookieRefresh` 按精确 Cookie 名称匹配并以纯 Cookie 覆盖 Kimi JSON 会话凭据。

### 有意不测

- 用户真实 Kimi 账号登录交互：本 task 的回归重点是刷新分支与凭据持久化，可通过 mock session partition/vault 自动验证；不在自动化测试中依赖真实账号或网络。

### 测试策略

- 在 auth IPC/session 相关单元测试中使用真实静默刷新函数与 fake Electron session cookie store，覆盖 `"*"` 与具体 cookie 名称两种配置。
- 使用 Kimi 已保存 JSON 凭据 fixture，断言刷新后 JSON 仍包含 cookie、authorization、session_id、device_id，并将其送入连接器参数解析路径验证 Bearer 可用。
- 使用 session manager/refresh-service mock 断言静默刷新成功时不调用 `create_window`，失败时才调用一次交互式登录路径。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无

### 风险与回退

- 风险：Cookie 分区中的多域、多路径或重复名称 Cookie 可能导致拼接结果与登录捕获值不一致；Kimi 凭据 JSON 的兼容回退可能误判旧格式。
- 回退：保留现有具体 Cookie 名称匹配与交互式登录回退；对无法解析或缺少必要 Bearer 的旧值不静默覆盖，记录失败并让用户主动重新登录。

### 依赖与约束

- 依赖现有 `persist:session-login:<instance_id>` 会话分区和 `SESSION_COOKIE` vault key。
- 凭据值包含认证材料，测试日志与错误信息不得输出 Cookie、Bearer 或完整 JSON secret。
- 本 task 需要完整 review，因为涉及鉴权凭据、持久化兼容和会话刷新并发路径。

### Finalization 时更新的 blueprint

- 无
