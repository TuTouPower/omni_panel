# Task spec

## 背景

Kimi 现只有设备码/API Key 模式（`connectors/kimi`，`oauth_device`）。用户要求加第二种网页登录模式（对标 `opencode_go` 的 `web_login`），登录后查 quota（含月用量）。入口呈现经用户确认：添加账号里两个并列独立入口，各存独立账号。

## 契约区

### 范围

- 新增 `connectors/kimi_web/`：manifest（`session` + `web_login`，按 t463 结论填 login_url/cookieNames）、`connector.ts`（Cookie 查 quota，产出 5 小时/周/月用量观察，月用量为新增指标）。
- 注册新 provider：`usageProviderSchema`、添加账号入口（VendorPicker/common-services）、图标与展示映射。
- dialog/Web 桥覆盖：新入口渲染 WebLoginForm 并可完成添加；既有 Kimi 入口不动。
- 测试：connector 解析单测（t463 脱敏 fixture）、dialog 渲染、server catalog 含新条目；`pnpm test` 全绿。

### 非范围

- 不改 `connectors/kimi/` 现有设备码/API Key 通路。
- 不做 CPA 侧 Kimi 监控改动。
- t463 结论为不可行则本 task 不启动。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：添加账号界面有“Kimi 网页版”独立入口，点击进入网页登录表单（非设备码表单）。
- [ ] [deploy] AC-002：用有效 Cookie 添加成功后，该账号用量含月用量指标（`window=month`），与 5 小时/周指标同屏展示（fixture 解析自动测 + 用户测试实例真账号验证）。
- [ ] AC-003：Cookie 失效时该账号采集明确报失败（可见错误，非静默正常）。
- [ ] AC-004：既有 Kimi（设备码/API Key）添加与采集行为不变；`pnpm test` 全绿。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001：全部可自动测试（dialog 渲染测试）。
- AC-002：connector 解析单测用 t463 脱敏 fixture 覆盖；真凭据端到端需用户 Kimi 账号，`[deploy]` 由用户在测试实例中点添加验证（执行期约）。
- AC-003：全部可自动测试（无效 Cookie 单测）。
- AC-004：全部可自动测试（既有套件回归）。

## 上下文区

- 来源：用户需求（2026-09-09）；前置 t463 spike 结论（finder 条目，执行期取）

### 有意不测

- 上游页面结构漂移的长期回归：不测，页面解析类连接器通用风险（opencode_go 同例），靠用户反馈 + 失败可见性兜底。

### 测试策略

- connector 解析单测（t463 脱敏 fixture，覆盖三窗口 + 失效 Cookie）。
- dialog 渲染（新入口 → WebLoginForm；既有 Kimi 入口 → OAuthDeviceForm 不变）。
- server catalog 含 kimi_web 条目；`pnpm test` 全绿。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- Kimi quota 页数据形态：UNVERIFIED-SPIKE，t463 结论未出前本 task 不能 start（启动门禁）。

### 风险与回退

- 风险：新 provider 注册面广（schema/图标/入口/桥），易漏映射；以上线后 catalog/dialog/server 三层测试锁住。
- 回退：单 commit 还原（新目录 + 注册点集中）。

### 依赖与约束

- 前置依赖：t463（spike 结论）；t463 不可行则本 task drop。
- 约束：Cookie 为 secret，只进 vault，不落日志与 fixture。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：若新增 provider 注册清单类约定，记一条（执行期判断）。
