# Task spec

## 背景

当前 OmniPanel 用量面板尚不支持添加 Command Code 账号，且现有图标仅为一个临时绘制的终端黑白窗口，与 Command Code 官方品牌形象（循环指令结 `⌘`）不符。参考 `../my_file/server/relay/cc_proxy/quota.py`，Command Code 提供了经由 Bearer Token（`user_...` 格式）鉴权的 HTTP API（`https://api.commandcode.ai`），支持查询用户月度额度（monthly credits）、5 小时窗口用量、周窗口用量及重置时间，但请求受 Cloudflare 1010 防护拦截，需携带合规 User-Agent。

## 契约区

### 范围

- 新增 `connectors/commandcode/manifest.json` 与 `connectors/commandcode/connector.ts`：
    - 能力声明为 `"poll"`，定义参数 `API_KEY`（类型 `secret`，必填）与 `API_BASE`（默认 `https://api.commandcode.ai`）。
    - 连接器请求携带防 Cloudflare 1010 拦截的 User-Agent 与 `Authorization: Bearer <API_KEY>`。
    - 请求 `/alpha/whoami`、`/alpha/billing/credits`、`/alpha/billing/subscriptions`，转换输出包含月度额度、5 小时窗口及周窗口（含 `reset_at`）的标准观察量。
- 架构与 UI 接入：
    - 在 `src/shared/schemas/plugin-output.ts` 的 `usageProviderSchema` 中加入 `"commandcode"`。
    - 在 `src/renderer/lib/common-services.ts` 的 `ADD_COMMON_SERVICES` 中注册 Command Code。
- 官方资产与图标替换：
    - 将官网提取的官方矢量 `⌘` 徽标存入 `src/renderer/assets/vendor_logos/commandcode.svg`。
    - 在 `src/renderer/components/Icon.tsx` 的 `VENDOR_LOGOS` 中引入并注册 `commandcode`，同时更新 `VENDOR_MARKS` 中的备用矢量图。
- 自动化测试：
    - 新增 `tests/unit/connector/commandcode.test.ts` 覆盖正常解析与异常状态处理。

### 非范围

- 不修改 Agent 面板既有的本地日志 token 统计与会话提取逻辑（`commandcode-reader.ts`）。
- 不修改其它服务商的用量计算模型。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：在「添加账号」弹窗的服务列表中可选择「Command Code」，展示官方 `⌘` 图标，并提供 User Key 输入项。
- [ ] AC-002：`commandcode` 连接器请求端点时携带 `Authorization: Bearer <API_KEY>` 与防 Cloudflare 拦截的合规 User-Agent。
- [ ] AC-003：`commandcode` 连接器成功解析 API 数据，产出月度额度、5 小时窗口用量与周窗口用量（含重置时间）的标准观察量。
- [ ] AC-004：当 API 响应认证失败（401/403）或网络超时时，连接器产出包含错误描述的异常观察量。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：`p233`（2026-09-15 核实，参考 `../my_file/server/relay/cc_proxy/quota.py` 与官网资产）

### 有意不测

无

### 测试策略

- 在 `tests/unit/connector/commandcode.test.ts` 中模拟 Command Code 各 API 端点返回报文，断言解析产出的 metrics/observations。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无

### 风险与回退

- 风险：若 Command Code 接口变更或 Cloudflare 策略调整可能导致请求失败。
- 回退：保持 `API_BASE` 可配置并具备完备的错误状态捕获。

### 依赖与约束

- 依赖 Command Code 账户 User Key（`user_...`）。

### Finalization 时更新的 blueprint

- 无
