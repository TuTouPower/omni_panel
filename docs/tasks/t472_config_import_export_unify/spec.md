# Task spec

## 背景

配置导出/导入有三套并行实现，输入形状与 vault 语义互不兼容（d058）：桌面 `handleConfigExport/Import`（`config-ipc.ts:547/581`）用 wrapper `{formatVersion:1, exportedAt, appVersion, config, secrets}` 且强制 `formatVersion===1`；LocalAPI/Web `handleConfigExportData/ImportData`（`config-ipc.ts:435/457`）产裸 config、宽松接受两种；CLI `import_config_file`（`src/main/cli/import-config.ts:39`）只接受裸 config。实测桌面导入 web 导出文件（裸 config，`formatVersion` 缺失）报「不支持的导入文件版本」。vault 写入也不一致：Web/桌面 `importAll`→replace-all，CLI 逐 key `set`→merge。

## 契约区

### 范围

- 定义**唯一** canonical 导出文件：`{ formatVersion: 2, exportedAt, appVersion, config, secrets? }`；`config` 为 native `AppConfiguration`（含 t471 的 `manifestId`，`executablePath` 可为空/本机派生）。
- 导出：桌面、LocalAPI、Web、CLI 全部走同一 `export_config` 函数产出上述格式；`includeSecrets` 语义统一（默认不含密钥，显式开启才注入）。
- 导入：全部走同一 `import_config` 函数；只接受 canonical `formatVersion: 2`，其他版本明确报错。
- vault 语义统一为 replace-all（导入即整体替换），与 Web/桌面现状对齐。
- 删除三套实现中的重复分支；CLI/Web/桌面仅做入口参数与文件 IO 封装。
- 跨平台迁移：导入时按 `manifestId`（t471）把连接器重映射到本机 definition，忽略文件中的 `executablePath`；无法匹配的项跳过并回报。

### 非范围

- 不兼容旧 `formatVersion: 1` 及裸 config 文件（用户明确要求不考虑向后兼容）。旧文件由用户按新格式手工修正后导入。
- 不改鉴权（→ t473）、不改并发写入语义（→ t479）。
- 不改 secret vault 加密/存储实现。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：桌面设置页导出的文件，可被 Web/LocalAPI `/v1/config/import` 与 CLI `--config` 成功导入；反之亦然（两端互导，四次方向全通）。
- [ ] AC-002：导出文件顶层恒为 `{formatVersion:2, exportedAt, appVersion, config, secrets?}`；默认不含 `secrets`，仅在显式 includeSecrets 时包含。
- [ ] AC-003：导入 `formatVersion !== 2` 的文件返回明确错误（含实际版本号），不写入任何配置或 vault。
- [ ] AC-004：导入含 Linux 侧 `executablePath` 的 canonical 文件到 macOS，连接器按 `manifestId` 匹配本机 definition 成功导入；文件中路径不落地到本机 config。
- [ ] AC-005：导入文件的连接器 `manifestId` 在本机不存在时，该连接器被跳过并在结果中回报（不整单失败，不写入无效项）。
- [ ] AC-006：导入成功后 vault 内容等于导出文件中的 secrets 集合（replace-all），不含导入前遗留的其他实例密钥。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试（共享函数单测 + IPC/LocalAPI/CLI 入口集成测试，跨平台以注入 definition 列表模拟）。

## 上下文区

- 来源：日常审计 d058（2026-09-14）；用户报告 + 裁定不使用兼容层

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 旧 `formatVersion:1` / 裸 config 的导入兼容：明确不支持，不写测试。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- fixture：canonical v2 文件（含跨平台路径与 manifestId）+ 本机 definition 列表。
- 断言：导出形状、跨入口互导、版本拒绝、manifestId 重映射、vault replace-all。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：统一后旧文件全部失效，用户需手工修正（已确认接受）。
- 回退：导入前现有 config 走 `.bak` 原子备份；vault replace-all 前导出快照。

### 依赖与约束

- 依赖 t471（`manifestId` 身份）——跨平台重映射以其为前提。
- 破坏性格式升级：不保留 v1 读路径。

### Finalization 时更新的 blueprint

- `docs/specs/config-store.md`：导出文件格式与导入语义。
- `docs/blueprint/decisions.md`：canonical v2 格式决策。
- `docs/specs_index.md`：挂 t472。
