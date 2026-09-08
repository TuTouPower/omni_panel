# Task spec

## 背景

Web 面板账号界面点“添加 Kimi”误渲染 CpaMgmtForm（标题“添加 Kimi 账号”、副标题“CPA 管理端授权”），Kimi 原生 device-code 登录弹窗不可达；Claude / Codex / Antigravity 同样误路由。桌面端正常。

已定位三段链条（p225，复现 `.scratch/repro-kimi-cpa-misroute.ts`）：Web 桥 `connector.catalog()` 请求 `GET /v1/catalog`，但 local-api 无此路由 → `useConnectorCatalog` catch 后 catalog 恒空 → `find_vendor` 回退分支命中 CPA 网关实例（`supportedProviders` 为 monitor\_\* 全集且不过滤开关）→ `cpa_mgmt`。

## 契约区

### 范围

- local-api 新增 `GET /v1/catalog`（复用 `handleConnectorCatalog`，与桌面 IPC 同源）。
- `find_vendor` 回退分支（catalog 缺失时）排除 `source === "gateway"` 的网关实例，除非 `vendor_id === "cpa"`。
- 补三层测试：server 路由存在性、空 catalog + CPA 实例共存的 dialog 渲染、CPA 覆盖 vendor 的回退排除。

### 非范围

- 不改 CPA 连接器采集逻辑与 monitor\_\* 语义。
- 不改桌面 IPC 通路。
- 不改 OAuthDeviceForm / CpaMgmtForm 表单本体。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：Web 服务 `GET /v1/catalog` 返回 200，条目与桌面 `connector:catalog` 一致（含 `manifest_id=kimi` 且 `auth.method=oauth_device` 的条目）。
- [ ] AC-002：Web 面板账号界面点“添加 Kimi”显示 Kimi 原生登录表单（OAuth 设备码），副标题为“OAuth 设备码授权”而非“CPA 管理端授权”；Claude / Codex / Antigravity 同样解析到各自原生表单。
- [ ] AC-003：catalog 为空（桥失败）时，kimi / claude / codex / antigravity 不再解析到 CPA 网关实例（不渲染 CpaMgmtForm、不携带 `manifest_id=cpa`）。
- [ ] AC-004：桌面端行为不变，既有桌面 catalog / dialog 用例全绿。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001：全部可自动测试（server 集成测试打真实路由）。
- AC-002：全部可自动测试（dialog 渲染测试用真实 catalog + 空 catalog 双场景断言表单类型与副标题）。
- AC-003：全部可自动测试（同 AC-002 的空 catalog 场景）。
- AC-004：全部可自动测试（既有套件回归）。

## 上下文区

- 来源：p225（`docs/pending/todo/p225_web_add_kimi_misroutes_to_cpa_form.md`）；复现 `.scratch/repro-kimi-cpa-misroute.ts`（2026-09-08 核实：空 catalog 下 kimi/claude/codex/antigravity 均误路由 cpa_mgmt，正常 catalog 下 kimi 为 oauth_device）

### 有意不测

- CPA 实例 monitor 开关全关时的 supportedProviders 收缩：不测，超出本 task 范围（采集语义，归 CPA 连接器所有）。
- Web e2e 全链路（mock local-api 需补 `/v1/catalog` mock）：不测，AC-002 由 dialog 渲染测试覆盖；mock 补 `/v1/catalog` 可作 follow-up。

### 测试策略

- `tests/integration/local-api/server.test.ts` 加 catalog 路由组（200 + kimi 条目 oauth_device）。
- `tests/unit/renderer/components/add_account_dialog.test.tsx` 加空 catalog + CPA 实例场景（kimi 应渲染 OAuthDeviceForm；claude/codex/antigravity 同断言至少抽查一例）。
- 全量 `pnpm test` 回归桌面行为。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：新增路由鉴权级别需与 `/v1/connectors` 对齐，错配会导致 Web 读不到或越权。
- 回退：单 commit 还原；路由与回退守卫相互独立，可分别 revert。

### 依赖与约束

- 无前置依赖；约束：`GET /v1/catalog` 只读、无 secret（对齐 `handleConnectorCatalog` 现有语义）。

### Finalization 时更新的 blueprint

- 无（行为修复，不涉及长期架构约束；如有新决策记 `docs/blueprint/decisions.md` 由执行期判断）。
