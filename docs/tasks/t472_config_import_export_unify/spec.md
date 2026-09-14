# Task spec

## 背景

配置导出/导入有三套并行实现，输入形状与 vault 语义互不兼容（d058）：桌面 `handleConfigExport/Import`（`config-ipc.ts:547/581`）用 wrapper `{formatVersion:1, exportedAt, appVersion, config, secrets}` 且强制 `formatVersion===1`；LocalAPI/Web `handleConfigExportData/ImportData`（`config-ipc.ts:435/457`）产裸 config、宽松接受两种；CLI `import_config_file`（`src/main/cli/import-config.ts:39`）只接受裸 config。实测桌面导入 web 导出文件（裸 config，`formatVersion` 缺失）报「不支持的导入文件版本」。vault 写入也不一致：Web/桌面 `importAll`→`vault.replaceAll`（`secrets-store.ts:40-47`，无条件整体替换），CLI 逐 key `set`→merge（`import-config.ts:73-92`）。`handleConfigImportData`（`config-ipc.ts:514-528`）先 `save(stripped)` 再 `importAll`，secrets 写失败时反向 `save(previous_config)` 回滚，但 `prune_unhealthy_plugins` 之后仍可能改动落盘配置。

t471 已登记 `manifestId` 身份并将导入路径改为按 manifestId 重映射本机 definition（依赖 t471 已登记、本 task 保留该依赖）。本 task 只统一「导入自身的一致性」；并发写入语义（多入口交错、base 冲突）归 t479。

## 契约区

### 范围

- 定义**唯一** canonical 导出文件：`{ formatVersion: 2, exportedAt, appVersion, config, secrets? }`；`config` 为 native `AppConfiguration`（含 t471 的 `manifestId`，`executablePath` 可为空/本机派生）。
- 导出：桌面、LocalAPI、Web、CLI 全部走同一 `export_config` 函数产出上述格式；`includeSecrets` 语义统一（默认不含密钥，显式开启才注入）。
- 导入：全部走同一 `import_config` 函数；只接受 canonical `formatVersion: 2`，其他版本明确报错。
- **secret 三态语义**（替换现无条件 `vault.replaceAll`）：
    1. 导入文件**无 `secrets` 字段**：保留导入后仍存在的实例的原密钥；清理导入后已不存在实例的密钥。等价于「按新 config 的实例集合做并集保留 + 悬空清理」，不整体替换。
    2. 导入文件**有 `secrets` 字段**：以该字段为唯一真相整体替换 vault；空集合表示清空所有密钥。
    3. 过滤未知 manifest 后的 secret 处理：导入时被跳过/清理的实例（manifestId 本机不存在）对应密钥按「无 secrets 字段」规则处理——其密钥不再属于任何存活实例，随实例清理删除；文件内显式给出、但实例被跳过时同样不保留。
- CLI/Web/桌面仅做入口参数与文件 IO 封装；三套实现的重复分支删除。
- 跨平台迁移：导入时按 `manifestId`（t471）把连接器重映射到本机 definition，忽略文件中的 `executablePath`；无法匹配的项跳过并回报。
- **一致性要求**：文件级校验（JSON 形状、`formatVersion`、config schema、secrets 形状）全部通过前不得改动任何 config 或 vault 状态；校验失败返回错误且存储状态不变。
- **持久化失败恢复**：config 与 vault 的写入不得出现「config 已换、vault 仍旧」或反向的错配终态。实现须先在内存解析出目标 config 与目标 vault 集合，全部就绪后再落盘；任一写入步骤失败时按决策恢复到一致的前态，不自动回滚用户已确认成功的整体替换（见非范围）。
- **安全备份**：导入替换前对现有 config 与 vault 分别留可恢复快照（已有 `.bak` 原子写路径复用；vault 快照用既有导出能力），备份失败则中止导入，不进入写入阶段。

### 非范围

- 不兼容旧 `formatVersion: 1` 及裸 config 文件（用户明确要求不考虑向后兼容）。旧文件由用户按新格式手工修正后导入。
- 不改鉴权（→ t473）。
- 不改跨入口并发写入语义（导入与并发 save 的交错、base 冲突策略归 t479）；本 task 只保证单次导入内部一致性。
- 不改 secret vault 加密/存储实现。
- 不自动回滚已成功的整体替换（用户已裁定：无 secrets 字段时增量保留、有 secrets 字段时整体替换，不做失败自动回滚用户显式操作）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：桌面设置页导出的文件，可被 Web/LocalAPI `/v1/config/import` 与 CLI `--config` 成功导入；反之亦然（两端互导，四次方向全通）。
- [ ] AC-002：导出文件顶层恒为 `{formatVersion:2, exportedAt, appVersion, config, secrets?}`；默认不含 `secrets`，仅在显式 includeSecrets 时包含。
- [ ] AC-003：导入 `formatVersion !== 2` 的文件返回明确错误（含实际版本号），不写入任何配置或 vault。
- [ ] AC-004：导入含 Linux 侧 `executablePath` 的 canonical 文件到 macOS，连接器按 `manifestId` 匹配本机 definition 成功导入；文件中路径不落地到本机 config。
- [ ] AC-005：导入文件的连接器 `manifestId` 在本机不存在时，该连接器被跳过并在结果中回报（不整单失败，不写入无效项）。
- [ ] AC-006：导入**有 `secrets` 字段**的文件后，vault 内容恰好等于该字段集合（整体替换），不含导入前遗留的其他实例密钥。
- [ ] AC-007：导入**无 `secrets` 字段**的文件后：仍存在实例的原密钥保留（值与导入前一致），已不存在实例的密钥被清理，vault 中不残留悬空实例密钥。
- [ ] AC-008：导入\*\*有 `secrets: {}`（空集合）\*\*的文件后，vault 为空，不保留任何先前密钥。
- [ ] AC-009：过滤未知 manifest 后的 secret 处理：文件内显式给出、但实例因 `manifestId` 本机不存在被跳过时，其密钥不保留；不因残留密钥留在 vault。
- [ ] AC-010：导入 config 校验失败（schema 不合法、缺必需字段、`secrets` 形状非法）时返回错误，config 与 vault 均保持导入前状态（逐字段比对不变）。
- [ ] AC-011：写入阶段 vault 落盘失败时，最终 config 与 vault 处于一致状态（不出现 config 已换而 vault 仍旧或反向），失败被回报且系统可用。
- [ ] AC-012：导入替换前生成 config 与 vault 快照；模拟备份写入失败时导入中止且不进入写入阶段，现有 config/vault 不变。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试（共享函数单测 + IPC/LocalAPI/CLI 入口集成测试，跨平台以注入 definition 列表模拟；vault 用临时 file-vault-backend；写入失败用可注入失败的 store/vault 桩）。

## 上下文区

- 来源：日常审计 d058（2026-09-14）；用户报告 + 裁定不使用兼容层

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 旧 `formatVersion:1` / 裸 config 的导入**兼容**：明确不支持，不写兼容测试；但拒绝行为有测试（AC-003 与测试策略）。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- fixture：canonical v2 文件（含跨平台路径与 manifestId）+ 本机 definition 列表 + 预置 vault 内容。
- 断言：导出形状、跨入口互导、v1/裸格式拒绝、manifestId 重映射、secret 三态（无字段并集保留/有字段整体替换/空集合清空）、校验失败零副作用、写入失败一致性、备份失败中止。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：统一后旧文件全部失效，用户需手工修正（已确认接受）。
- 风险：secrets 三态判断出错致误删仍存活实例密钥或漏清悬空密钥。
- 回退：导入前现有 config 走 `.bak` 原子备份、vault 走快照；写入阶段失败按一致性要求恢复前态。

### 依赖与约束

- 依赖 t471（`manifestId` 身份）——跨平台重映射与「过滤未知 manifest 后的 secret 处理」以其为前提。
- 破坏性格式升级：不保留 v1 读路径，但必须写测试明确断言 v1 与裸格式被拒绝（见测试策略）。
- 与 t479 的分界：本 task 负责单次导入内部的 config↔vault 一致性；t479 负责多入口并发写入的交错与 base 冲突。

### Finalization 时更新的 blueprint

- `docs/specs/config-store.md`：canonical 导出文件格式与导入三态 secret 语义。
- `docs/blueprint/decisions.md`：canonical v2 格式决策 + secret 三态决策（无字段保留+清理 / 有字段整体替换 / 空集合清空）。
- `docs/specs_index.md`：挂 t472。
