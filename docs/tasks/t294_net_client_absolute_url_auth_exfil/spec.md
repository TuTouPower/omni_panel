# Task spec

## 背景

来源：Grok 全仓评审（2026-08-11）Issue 3。`src/main/core/connector/net-client.ts` 请求 URL 由 `new URL(options.path, base)` 构造；`path` 为绝对或 protocol-relative URL（`https://evil.example/...` / `//evil.example/...`）时 URL API 以之替换 manifest endpoint origin。`apply_request_auth` 在 URL 构造后注入 vault 凭据（apikey/cookie），hostile/被攻陷的 connector 脚本（用户 `connectors/` 目录经 `manifest-loader` 加载）或构造的 poll path 可把 vault 注入的 auth 发往任意主机。`assert_safe_connector_host` 只拦云 metadata 主机，不拦任意公网主机。

## 契约区

### 范围

- URL 构造后强制 `url.origin` 等于解析后的 endpoint base origin（或只允许 `/` 开头相对路径），拒绝绝对 URL 与 `//` protocol-relative path
- 同一检查应用到 poll/probe executor 的请求路径

### 非范围

- connector 信任模型重构（架构已声明用户 connector 为受信代码，见 architecture.md）
- 其他网络能力调整

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

- [ ] AC-001：`path` 为绝对 URL 或 `//` protocol-relative 时请求被拒绝（抛错），不发起网络请求
- [ ] AC-002：合法相对路径（`/` 开头）请求行为不变，auth 注入与请求成功（既有 connector 测试全绿）
- [ ] AC-003：poll/probe executor 与主请求路径同样拒绝越界 origin（单测覆盖）

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：单测构造绝对/protocol-relative path 断言拒绝 + 相对路径回归。

## 上下文区

- 来源：Grok 全仓评审 Issue 3（net-client.ts:199）

### 测试策略

- 单测：net-client URL 构造用例（绝对/protocol-relative/相对路径）+ poll/probe executor 同检查
- 回归：既有 connector 请求测试保持全绿
