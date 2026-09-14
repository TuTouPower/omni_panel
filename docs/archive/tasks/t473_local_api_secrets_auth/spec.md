# Task spec

## 背景

LocalAPI 监听 `0.0.0.0`（`src/main/core/local-api/server.ts:1847`），`/v1/secrets`、`/v1/config` 等写入/敏感端点在 `check_auth`（`server.ts:1208`）**之前**处理（`handle_web_config`，`server.ts:1628`），属免认证分支；而桌面同名操作历史上加了 `#setting` 路由限制（`config-ipc.ts:680/686` 的 `assert_setting_route`）。原审计（d058）把此差异当作「敏感读写在 Web 免认证」的安全缺口，本 task 原方向是「把敏感端点纳入 token 认证」。

用户裁定（2026-09-14）**反转该方向**：本应用为受信内网自用工具，Web 与桌面**同权限、都不需要认证**；能访问服务的人即可使用这些操作。这是产品边界，如实记录而非当作缺陷。因此不再引入 token、不把端点移到 `check_auth` 之后、不为 Web 单独降权。无认证不等于放任：输入校验、进程隔离、敏感日志脱敏、破坏性操作二次确认必须保留；renderer 仍不得任意执行代码。

盘点现状（本仓核实，2026-09-14）两端能力分布：

- 配置：`/v1/config`（GET 读 / POST 写）、`/v1/config/duplicate`、`/v1/config/createInstance`、`/v1/config/export`（GET）、`/v1/config/import`（POST）——`server.ts:1582-1647`；桌面同名经 `config-ipc.ts`。
- 密钥：`/v1/secrets`（GET 读 / POST 写）——`server.ts:1629`；桌面 `CONFIG_GET_SECRETS`/`CONFIG_SAVE_SECRETS`（`config-ipc.ts:678-697`，带 `assert_setting_route`）。
- 登录：`/v1/auth/cookieLogin`、`/v1/auth/cookieLogin/status`（`server.ts:933/946`）、`/v1/session/login`、`/v1/session/refresh`（`server.ts:958`）；桌面 `AUTH_COOKIE_LOGIN` 等（`auth-ipc.ts`）。
- 控制：`/v1/control/refresh-all|pause|resume|restart|quit`（`server.ts:1703-1740`）；桌面经 `control_deps`（`index.ts:708-731`）。
- 采集/刷新：`/v1/connectors`（GET 列表 / POST refreshAll）、`/v1/connectors/:id/refresh`、`/v1/connectors/:id/state`（`server.ts:1656-1700`）；桌面 `connector-ipc.ts`。
- 只读查询：dashboard / sessions / trend / sessionHistory / events / logs / 静态资源——已在 `check_auth` 之前，保持。

## 契约区

### 范围

- 确立**共享权限基线**：Web、桌面共享的业务操作（配置、secret、登录、控制、刷新采集）权限一致、结果一致；两者均不需要凭据即可调用。
- 删除桌面侧对敏感通道的 `assert_setting_route` 路由限制（`config-ipc.ts:680/686`），使桌面与 Web 同权限；保留 `assert_valid_sender`（进程隔离，防非授权 renderer/webContents 调用）。
- 撤销「把 `/v1/secrets`、`/v1/config` 等移到 `check_auth` 之后」的方案；不引入 token 分发、不改登录机制。
- 保留并强化非权限类防线：入参 schema/类型校验、错误分类、敏感日志脱敏（secret 一律 `***`）、进程隔离、破坏性操作（导入整体替换、restart/quit、删除实例）的显式确认。
- 列出上述能力清单与两端对应入口，作为后续 task 的共享权限基线；新增能力由 t480（Web bridge 等价）/ t481 / t482 实现，本 task 只定义基线语义，不重复实现它们。
- 核对既有认证/授权限制：除 `check_auth` 覆盖的 `/v1/ingest`（连接器推送，非用户业务操作）与 `assert_setting_route` 外，确认无其他按入口降权的分支；发现即在本 task 对齐。

### 非范围

- 不新增 token、登录、会话密钥或任何凭据校验（用户明确裁定）。
- 不改 cookie/OAuth 登录本身（→ t478）。
- 不改配置格式与导入语义（→ t472 / t479）。
- 不实现具体共享操作在 Web 的等价逻辑（→ t480 / t481 / t482）。
- 不改 `check_auth` 对 `/v1/ingest` 的现状（连接器 ingest 非终端用户业务操作）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-006：无任何凭据时，`/v1/secrets`（GET/POST）、`/v1/config`（GET/POST）、`/v1/config/import|export|duplicate|createInstance` 与桌面同能力调用均成功，不被 401 拒绝。
- [ ] AC-007：清单中的共享业务操作（配置、secret、登录、控制、刷新采集）在 Web 与桌面两端返回同一业务结果与同一错误分类，不因入口不同而降级为只读/禁用。
- [ ] AC-008：桌面侧敏感通道不再因 `#setting` 路由哈希缺失而拒绝；从合法 renderer 窗口调用 `CONFIG_GET_SECRETS`/`CONFIG_SAVE_SECRETS` 成功。
- [ ] AC-009：非合法 sender（非本应用 renderer/webContents 的调用）仍被拒绝，进程隔离防线不因取消认证而失效。
- [ ] AC-010：非法/畸形入参在所有共享操作两端返回一致的校验错误（不因取消认证而落到 500），secret 相关日志与 IPC 结果中密钥一律脱敏为 `***`。
- [ ] AC-011：破坏性共享操作（`/v1/config/import` 整体替换、`/v1/control/restart|quit`、实例删除）保留显式确认或等价可观察的保护，两端一致。
- [ ] AC-012：本 task 不新增任何 token/凭据校验；代码中不出现把既有共享业务端点移入 `check_auth` 或新增 bearer 校验的分支（只读端点与 ingest 的既有分层不变）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-006..012 全部可自动测试（起本地 server 实例 + 桌面 IPC handler 单测，无凭据请求断言成功/错误分类与副作用；sender 防线用构造 event 断言拒绝；脱敏用日志捕获断言）。

## 上下文区

- 来源：日常审计 d058（2026-09-14）；用户 2026-09-14 裁定反转为「两端同权限、无认证」基线（原安全缺口结论作废，改为产品边界记录）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 真实外网/跨主机访问的网络拓扑与防火墙行为：不在应用职责内，由部署环境决定，不测。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 真实 http server + fetch（无 Authorization 头）；桌面 handler 直接调用 + 构造 sender event。
- 断言：无凭据成功、两端结果/错误分类一致、非法 sender 拒绝、日志脱敏、无新增 token 分支。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无（末端点集合与免认证现状已在本仓 `server.ts` 调用顺序核实；sender 校验实现见 `ipc/helpers.ts`）。

### 风险与回退

- 风险：取消 `#setting` 限制后任意 renderer 窗口可调敏感通道——由 `assert_valid_sender` 与进程隔离兜底；无认证为已确认产品边界。
- 回退：基线为删除限制，回退即恢复 `assert_setting_route` 调用；不改动任何存储或格式。

### 依赖与约束

- 安全底线（保留项）：入参校验、错误分类、日志脱敏、进程隔离、破坏性确认；`check_auth` 对 ingest 的既有行为不变。
- 前置：无。与 t472 同文件区域，实施顺序建议 t472 后。
- 与 t480/t481/t482 的分界：本 task 定义共享权限基线；这些 task 负责各自能力在 Web 的等价实现。

### Finalization 时更新的 blueprint

- `docs/specs/platform-services-api.md`（或 local-api spec）：共享操作能力清单与「两端同权限、无认证」基线，替换原端点认证分层表。
- `docs/blueprint/decisions.md`：记录「无认证、两端同权限」为产品边界决策。
- `docs/specs_index.md`：挂 t473。
