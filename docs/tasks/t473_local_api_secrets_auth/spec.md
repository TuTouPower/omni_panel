# Task spec

## 背景

LocalAPI 监听 `0.0.0.0`（`src/main/core/local-api/server.ts:1847`），但 `/v1/secrets`（GET/POST）与 `/v1/config`（POST）在 `handle_web_config`（`server.ts:1629`，经 `server.ts:1168` 调用）内处理，位于 `check_auth`（`server.ts:1208`）**之前**，属免认证分支。任何能访问局域网该端口的客户端可读取/写入任意实例明文密钥与配置。桌面同名操作要求 `#setting` 路由（`config-ipc.ts:680`）。这是同一逻辑能力在两入口的授权不一致。

## 契约区

### 范围

- 把 `/v1/secrets`、`/v1/config`（含 POST）、`/v1/config/duplicate`、`/v1/config/createInstance`、`/v1/config/export`、`/v1/config/import` 移入 `check_auth` 之后（即需 token）。
- 保持 Web panel UI 所需的**只读**端点免认证（`/v1/dashboard`、`/v1/sessions`、趋势、会话历史查询、静态资源等）不变。
- 明确区分「Web UI 需要」与「敏感写入/读取」：前者保留 pre-auth，后者纳入认证。
- 更新受影响的前端调用（`src/web/usageboard-web.ts`）以携带 token；若无 token 机制则确认 Web UI 不调用这些端点（设置页在 Web 的导入导出路径）。

### 非范围

- 不改 token 生成/分发机制本身（若需新机制另立 task）。
- 不改桌面 IPC 的 `#setting` 路由校验。
- 不改配置格式（→ t472）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：无有效 token 时 `GET /v1/secrets` 返回 401，不返回任何密钥内容。
- [ ] AC-002：无有效 token 时 `POST /v1/secrets`、`POST /v1/config`、`POST /v1/config/import` 返回 401，且不修改 vault 或 config。
- [ ] AC-003：携带有效 token 时上述端点行为与改动前一致（读写成功）。
- [ ] AC-004：Web panel 只读端点（dashboard/sessions/trend/session-history/静态资源/`/v1/events`）在无 token 下仍返回 200，不回归。
- [ ] AC-005：`/v1/logs/renderer`、`/v1/logs/export` 等既有 pre-auth 白名单端点行为不变。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试（起本地 server 实例，带/不带 token 请求断言状态码与副作用）。

## 上下文区

- 来源：日常审计 d058（2026-09-14）；安全项

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 真实 http server + fetch；断言 401/200 与副作用（vault/config 未变）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- Web UI 是否有可用 token 渠道，或这些端点是否根本不被 Web UI 调用：UNVERIFIED-BLOCKING，实施期先核实 `usageboard-web.ts` 调用图与 token 分发，再决定是否需要为 Web 引入 token。

### 风险与回退

- 风险：把 Web UI 依赖的端点误纳入认证导致面板功能失效。
- 回退：逐个端点核实调用方后再迁移；保留 pre-auth 只读集合清单。

### 依赖与约束

- 安全底线：敏感读写不得免认证。
- 前置：无。与 t472 同文件区域，实施顺序建议 t472 后。

### Finalization 时更新的 blueprint

- `docs/specs/platform-services-api.md`（或 local-api spec）：端点认证分层表。
- `docs/specs_index.md`：挂 t473。
