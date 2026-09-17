# Task spec

## 背景

用户在软件中点击“添加账号 -> Codex”时，界面固定显示“未找到本地授权文件”，无法扫描到本地实际存在的 `~/.codex/auth.json`。经排查，`LocalScanForm.tsx` 为纯前端 Mock（固定延迟 800ms 后提示未找到文件），主进程未提供真正的本地凭据扫描 IPC 通道；且后台 `connectors/codex` 仅扫描历史会话 token，未对接官方用量接口，导致本地已登录的 Codex 既无法在添加账号中被检测到，也无法在面板中展示官方 5 小时与周配额。

## 契约区

### 范围

- 主进程与 preload 新增本地凭证扫描 IPC（`IPC_CHANNELS.AUTH_SCAN_LOCAL`），实现对本地 CLI（Codex 的 `~/.codex/auth.json` 等）授权文件的真实存在性与有效性校验，返回状态与账号信息。
- 改造 `LocalScanForm.tsx`，对接真实扫描 IPC：当本地存在有效授权文件时，展示已就绪状态并激活导入操作；不存在或无效时展示对应提示。
- 改造 `connectors/codex/manifest.json` 与 `connector.ts`：声明 `~/.codex/auth.json` 路径白名单与 `chatgpt` endpoint，读取 `tokens.access_token` 与 `tokens.account_id`，直连官方配额端点 `https://chatgpt.com/backend-api/wham/usage`，提取 5 小时（primary_window）与周（secondary_window）用量百分比与重置时间，输出标准 `ScriptObservation`。
- 补充自动化单元测试。

### 非范围

- CPA 网关相关逻辑（完全解耦，不依赖 CPA 任何服务）。
- 向本地 `~/.codex/auth.json` 写回 token（只读消费）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：在“添加账号”选择 Codex 时，前端通过 IPC 真实扫描本地 `~/.codex/auth.json`；若文件存在且包含有效 access_token，界面展示“已发现有效授权文件”状态并允许导入账号。
- [ ] AC-002：若本地不存在授权文件或授权文件内容无效时，界面正确展示未找到或无效凭证错误状态，禁止假成功。
- [ ] AC-003：Codex 连接器读取本地 `~/.codex/auth.json` 并调用 `https://chatgpt.com/backend-api/wham/usage` 成功时，输出包含 5 小时窗口（`primary_window`）与周窗口（`secondary_window`）用量、重置时间及账号标识的标准观测数据。
- [ ] AC-004：当 Codex 官方接口返回 401/403 或本地凭据过期时，连接器返回清晰的失效状态（status 为 critical/unknown 且包含重登提示），不发生未捕获崩溃。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：用户直接反馈与现场代码排查（2026-09-17）。

### 有意不测

- 生产网络环境向 chatgpt.com 发起的真实实时请求（单元测试全部使用 mock HTTP 与 mock 文件系统，不消耗真实网络与配额）。

### 测试策略

- 针对主进程扫描 IPC 的单元测试：验证有效文件、不存在文件、无效 JSON 的扫描判定。
- 针对 Codex 连接器脚本的单元测试：验证 `auth.json` 凭据解析、`wham/usage` 成功响应结构转换以及 401/403 错误处理。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无。

### 风险与回退

- 风险：若用户本地 `auth.json` 的 token 字段层级发生变动可能解析不全。防护：同时兼容顶层与 `tokens.` 嵌套结构。
- 回退：git checkout 恢复。

### 依赖与约束

- 无。

### Finalization 时更新的 blueprint

- 无。
