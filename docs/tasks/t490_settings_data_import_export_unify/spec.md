# Task spec

## 背景

在当前设置页「数据与隐私」板块中，桌面端与 Web 端的数据导出界面存在明显割裂（p234）：

1. 界面与文案不一致：Web 端提供了「包含明文密钥」复选框及安全提示，副标题为「导出配置；默认不含明文密钥」；桌面端该复选框被隐藏，副标题写死为「导出全部配置与账号密钥到 JSON 文件」。
2. IPC 桥接与实现断裂：前端 `SettingsView.tsx` 仅在 `web_mode` 下传参；`src/preload/index.ts` 将 options 声明为 `void options;` 抛弃；主进程 `handleConfigExport` 硬编码 `includeSecrets: true`，桌面端无法执行无密钥脱敏导出。
3. 导入行为不对称：Web 端在 `/v1/config/import` 强制要求 `allowEndpointOverrides: false`，含端点覆盖直接拒绝，而桌面端允许，违背了 t473 确立的「Web/桌面同权限同行为」基线。

本 task 统一桌面端与 Web 端的数据导入导出界面与行为，消除环境割裂，实现真正的一套代码同等体验。

## 契约区

### 范围

- 界面与文案对齐：
    - `SettingsView.tsx` 消除 `show_secret_option={web_mode}` 条件，桌面端与 Web 端统一展示「包含明文密钥」复选框及密钥警告文案；
    - `data_section.tsx` 副标题统一为「导出配置；默认不含明文密钥」，消除两端文案分支；
    - 桌面端与 Web 端点击「导出」时均将 `{ includeSecrets }` 传递给后端。
- Preload 与 IPC 通道对齐：
    - `src/preload/index.ts` 中 `config.export` 正确将 `options?: ConfigExportOptions` 透传至 `IPC_CHANNELS.CONFIG_EXPORT`；
    - `src/main/ipc/config-ipc.ts` 中 `IPC_CHANNELS.CONFIG_EXPORT` 接收 options 并传给 `handleConfigExport(deps, options)`；
    - `handleConfigExport` 调用 `export_config` 时使用传入的 `options.includeSecrets`（默认不含密钥，勾选后包含密钥），遵循 t472 canonical v2 规范。
- 导入行为对齐：
    - `src/main/core/local-api/server.ts` 中的 `/v1/config/import` 与桌面端对齐，取消针对 Web 导入的单向端点覆盖拦截，保持两端一致导入逻辑。

### 非范围

- 不修改配置文件的 canonical v2 格式（`formatVersion: 2`）。
- 不改动运行时凭据存储（vault 加密存储与密钥管理）。
- 不改动非设置页的平台特有逻辑（如原生窗口标题栏最小化/关闭按钮的环境适配）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：桌面端与 Web 端设置页「数据与隐私」中的「导出设置」均展示统一副标题「导出配置；默认不含明文密钥」，且均展示「包含明文密钥」复选框（未勾选时不展示警告，勾选时展示红色警告「文件含明文密钥，请妥善保管」）。
- [ ] AC-002：在桌面端点击「导出」按钮时，`window.usageboard.config.export` 接收到包含当前复选框状态的参数 `{ includeSecrets: boolean }`。
- [ ] AC-003：Preload 桥接层 `usageboard.config.export(options)` 完整将 `options` 透传至 `IPC_CHANNELS.CONFIG_EXPORT`，不再丢弃入参。
- [ ] AC-004：桌面端主进程 `handleConfigExport` 响应 `options`：未勾选时导出的 JSON 文件不包含 `secrets` 字段；勾选时导出的 JSON 文件包含 `secrets` 字段。
- [ ] AC-005：LocalAPI `/v1/config/import` 导入包含端点覆盖（`endpointOverrides`）的合法配置时，不再因 Web 来源而被单独拒绝，与桌面端导入保持一致行为。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：`p234`（2026-09-15 登记，桌面端与 Web 设置页数据导入导出界面与行为不一致及同类位点分歧）

### 有意不测

- 真实文件系统极端 I/O 错误（如磁盘已满或只读介质写入失败）：属系统底层环境故障，不在本 task 逻辑测试范围内。

### 测试策略

- 单元测试（组件）：在桌面模式与 Web 模式下渲染 `SettingsView` / `DataSection`，验证复选框、副标题文案及点击导出时传递的 options 参数。
- 单元测试（IPC 与 Preload）：测试 preload 桥接层入参转发，及主进程 `handleConfigExport` 对 `includeSecrets` 为 true/false 时的生成结果。
- 单元测试（LocalAPI）：测试 `/v1/config/import` 接收包含 `endpointOverrides` 的 canonical v2 配置，断言导入成功。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无。

### 风险与回退

- 风险：原有桌面用户若习惯了导出必定包含密钥，在未勾选「包含明文密钥」导出后迁移可能缺失密钥。
- 回退：副标题明确注明「默认不含明文密钥」，且勾选交互与 Web 端已运行数月的交互完全对齐，属符合安全常识与 t472 规范的预期行为。

### 依赖与约束

- 无前置未完结 task 依赖。遵循 t472 配置导出 canonical v2 规范与 t473 同权限基线。

### Finalization 时更新的 blueprint

- 无
