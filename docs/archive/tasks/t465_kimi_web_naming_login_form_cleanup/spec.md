# Task spec

## 背景

用户要求将产品中的 “Kimi 网页版” 统一改称 “Kimi Web”，并精简 Kimi Web 登录界面。Kimi Web 的认证材料由登录窗口自动捕获，用户不应被要求填写无效或不必要的 Cookie、Bearer、接口地址字段。

## 契约区

### 范围

- 将 Kimi Web 面向用户的名称改为 `Kimi Web`，覆盖添加账号入口、标题、provider 展示标签和相关测试文案。
- Kimi Web 登录表单只保留备注、网页登录按钮和必要的状态/错误提示。
- 移除 Kimi Web 表单中的 Cookie 字符串、网页登录令牌、接口地址和接口地址(login)等手动输入或展示字段。
- 保留现有自动捕获 Cookie/Bearer/session/device 凭据及既有 Kimi 设备码入口行为。

### 非范围

- 不修改 Kimi Web quota 请求协议和指标解析。
- 不修改既有 Kimi 设备码/API Key 表单。
- 不变更其它 provider 的登录表单。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：添加账号入口与 Kimi Web 相关用户可见标签显示为 `Kimi Web`，不再显示 `Kimi 网页版`。
- [ ] AC-002：选择 Kimi Web 后，登录表单显示备注输入、网页登录按钮和必要的登录状态/错误反馈；不显示 Cookie 字符串、网页登录令牌、接口地址或 `接口地址 (login)` 字段。
- [ ] AC-003：Kimi Web 的自动登录捕获与既有 Kimi 设备码/API Key 入口保持可用，相关回归测试通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001：全部可自动测试（common services/provider label 与 dialog 标题测试）。
- AC-002：全部可自动测试（AddAccountDialog/WebLoginForm 渲染测试断言必要字段存在且无禁用字段）。
- AC-003：自动测试覆盖表单接线与既有回归；真实网页登录已在 t464 live_verify 验证，当前 task 不重复使用真实凭据。

## 上下文区

- 来源：用户需求（2026-09-09）；t464 真实 Kimi Web 登录验证结论

### 有意不测

- 真实 Kimi 登录：不重复执行，凭据捕获协议未变，t464 已有真实验证记录。

### 测试策略

- 更新/新增 renderer dialog 测试，覆盖 Kimi Web 标签、标题和字段隐藏。
- 运行 Kimi Web connector 相关测试、全量 `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm build`。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无

### 风险与回退

- 风险：名称可能遗漏某个 provider label 或表单字段由共享组件间接显示。
- 回退：回退本 task 单个执行 commit；不影响 Kimi Web 认证协议和既有 Kimi 入口。

### 依赖与约束

- 依赖 t464 已合入；不得把 Kimi Web 的 Bearer/session/device 自动捕获改回手动输入。

### Finalization 时更新的 blueprint

- 无
