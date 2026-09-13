# Task spec

## 背景

`ConnectorConfiguration.executablePath`（`src/shared/types/config.ts:118`）是平台绝对路径，却被同时用作连接器身份键：`hydrate-runtime-store.ts:25`、`auth-ipc.ts:53/164`、`refresh-service.ts:249`、`connector-ipc.ts:120`、`secret_param_keys.ts:13/36-40`、`config-store.ts:194`、`config-ipc.ts:151`。后果：(1) 跨平台/移动安装目录即失配，配置无法迁移；(2) `auto-seed.ts:47-51` 每次启动「按 id 匹配、仅更新 executablePath」当补丁；(3) 用户下载的 Linux 配置在 macOS 导入报「未知连接器路径」。连接器身份应为平台无关标识。manifest 已有稳定 `id`（`manifest_schema.id`），tombstone `removedConnectorIds` 已在用它。

## 契约区

### 范围

- `ConnectorConfiguration` 新增 `manifestId: string`（取自 `manifest.id`），作为跨平台身份键；`executablePath` 降级为「本机解析缓存」，不再作为身份参与匹配。
- 全部按 `executablePath` 找 definition / 找 secret key / 健康判定 / 白名单的调用点改按 `manifestId`：`hydrate-runtime-store.ts`、`refresh-service.ts`、`auth-ipc.ts`、`connector-ipc.ts`、`secret_param_keys.ts`、`config-store.ts`、`config-ipc.ts`。
- `auto-seed`：按 `manifestId` 匹配已有项（替代现「按 id 匹配仅更新 path」的补丁语义）；新项写入 `manifestId`。
- 存量迁移：旧 config 无 `manifestId` 时，用其 `executablePath` 尾段（目录名）匹配 definition 的 `manifest.id` 回填；匹配不到则该项标记为孤儿并按健康清理移除（record 日志）。
- schema：`manifestId` 加入 `appConfigurationSchema`；`executablePath` 保留（本机派生），导入时由 manifestId 现算覆盖，不再信任文件中的路径值。

### 非范围

- 不改 manifest schema 本身；不改 `manifest.id` 语义。
- 不改配置导出导入的外层格式与鉴权（→ t472 / t473）。
- 不改 observation / secret vault 的存储键（`keyFor(instanceId, name)` 保持）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：`ConnectorConfiguration` 含必填 `manifestId`；`appConfigurationSchema` 校验含该字段，缺字段的旧配置经迁移层可加载。
- [ ] AC-002：把同 provider 的连接器目录移动到另一路径（同机器）后重启，该连接器仍匹配到同一实例（身份不因路径变化丢失），无需重新配置。
- [ ] AC-003：构造 executablePath 指向不存在路径、但 `manifestId` 有效且本机存在该 manifest 的连接器配置，启动后该连接器正常运行（路径由 manifestId 现算）。
- [ ] AC-004：旧 config（无 `manifestId`，路径尾段可对应 manifest id）加载后每项 `manifestId` 正确回填，且配置对用户可见行为不变（连接器数量、启用态、参数值、secret 归属均不变）。
- [ ] AC-005：`auto-seed` 不再以 executablePath 判等；同一 manifest 已存在实例时不重复 seed（按 manifestId 匹配）。
- [ ] AC-006：production 代码中按 `executablePath` 做身份匹配的调用点清零（路径仅用于定位本机文件与日志）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-002：目录移动以注入的 definition 列表模拟（同 manifestId、不同 directory），单测可证；真实文件系统移动留 `[deploy]` 冒烟。

## 上下文区

- 来源：日常审计 d058（2026-09-14）；用户裁定迁移到 manifestId

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 真实跨 OS 文件系统移动：环境无法在 CI 复现，以注入 definition 列表的等价单测覆盖。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- fixture：旧格式 config JSON（无 manifestId）+ definition 列表（manifest.id ↔ directory 映射）。
- 断言：迁移后 manifestId 回填；改 directory 后仍命中；孤儿项被清理。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：迁移误判 manifestId 致实例错配；孤儿判定过激误删用户自定义连接器。
- 回退：迁移前 config 走既有 `.bak` 原子备份；孤儿项不移除只标记 + 日志，由 t471 实施期确认是否真删。

### 依赖与约束

- 破坏性 schema 升级，不留 `executablePath`-as-identity 兼容读（一次性迁移除外）。
- 前置：无。t472 依赖本 task。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：记录「连接器身份 = manifestId，executablePath 仅本机解析」。
- `docs/specs/config-store.md`：ConnectorConfiguration 字段表。
- `docs/specs_index.md`：挂 t471。
