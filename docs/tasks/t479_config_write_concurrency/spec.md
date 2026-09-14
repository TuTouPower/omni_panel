# Task spec

## 背景

配置写入的并发语义按入口不同（d058）：`handleConfigSave` 走 `saveIfBaseMatches` 冲突检测（`config-ipc.ts:189-199`，底层 `config-store.ts:270-287` 在串行队列内比较 base，冲突返回 `"conflict"`）；而 `handleConfigImportData`（`config-ipc.ts:514-528`）、`handleConfigDuplicate/CreateInstance`（`config-ipc.ts:314-374`）、CLI import（`import-config.ts:116-117`）都直接 `save` 覆盖。`auto-seed`（`auto-seed.ts`）与 `prune_unhealthy_plugins`（`config-store.ts:410-424`）也各自写。并发保存窗口下，导入/复制/新建可静默覆盖另一窗口的改动，而设置页保存会报 CONFLICT。

关键：现有串行化只保证「单次写入不撕裂」，不保证「读最新状态 → 计算 → 提交」整段原子。若某入口在提交前基于旧快照计算（如复制时先 `load` 再追加），并发另一入口提交后仍会丢改动。因此排队必须覆盖读取最新状态、计算、提交三步，而非只排 `save`。

盘点各入口的真实冲突策略（本仓核实，2026-09-14）：

|入口|现状|期望语义|
|---|---|---|
|设置页保存 `handleConfigSave`|已串行 + base match，冲突返回 CONFLICT|保持 base 冲突拒绝|
|导入 `handleConfigImportData` / CLI import / 导入 `--config`|直接 `save` 覆盖|用户显式整体操作：覆盖但须串行（不与并发 save 交错），不静默丢并行无关字段修改|
|复制 `handleConfigDuplicate`|`load` → 追加新实例 → `save`（读-算-写）|在最新状态上追加，不丢无关修改|
|新建实例 `handleConfigCreateInstance`|`load` → 追加新实例 + 清理 tombstone → `save`（读-算-写）|同上|
|auto-seed|启动时 `load`/合并后写|基于最新状态 seed，不覆盖并发改动|
|prune|`cached_config` → 过滤 → `enqueueSave`|基于最新状态 prune|

## 契约区

### 范围

- 统一配置写入语义：所有写入口（save / import / duplicate / createInstance / CLI import / auto-seed / prune）经同一串行化写入路径。
- **排队覆盖「读最新 → 计算 → 提交」**：串行临界区内入口必须重新读取最新已提交状态再计算增量，然后提交；禁止基于临界区外的旧快照直接覆盖。实现方式（如 `enqueue(async () => { latest = committed; compute(latest); doSave })`）不限定，行为必须可观察。
- **逐入口冲突策略**（写入决策并落 blueprint）：
    - 设置页 save：base match，冲突拒绝（`CONFLICT`）。
    - 导入 / 复制 / 新建 / CLI import：用户显式整体操作，允许覆盖，但必须串行且不与其他入口交错；导入的整体替换语义不变（→ t472 的三态 secret）。
    - auto-seed / prune：系统维护操作，基于最新状态增量应用，不覆盖用户字段。
- Web / 桌面 / CLI 三入口对同一并发场景表现一致（同结果、同冲突分类）。
- 「丢失修改」可观察测试：并发两入口各自成功（非冲突）时，最终状态必须包含**两者全部不重叠的修改**；不允许两处都报成功却丢掉其中一处的非重叠字段。
- 本 task 只解决跨入口并发一致性；单次导入内部 config↔vault 一致性归 t472（两者分界明确，t479 依赖 t472）。

### 非范围

- 不改 config store 的原子写/备份实现（`writeJsonAtomic`/`.bak`）。
- 不改 t472 的导入格式与 secret 三态。
- 不改 debounce 保存逻辑本身（`scheduleSave`）。
- 不改 SQLite / observation 写入。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：并发「设置页保存」与「导入」不再产生撕裂写入；最终 config 为二者之一且内容自洽（非混合）。
- [ ] AC-002：导入/复制/新建在并发窗口下的行为与决策文档一致（覆盖或拒绝，可复现）。
- [ ] AC-003：CLI import 与桌面 import 对同一并发场景表现一致。
- [ ] AC-004：所有配置写入口经同一串行化路径（代码中不再有绕过队列的直接 `save`）。
- [ ] AC-005：并发「复制（读-算-写）」与「设置页保存另一字段」两者都成功后，最终 config 同时包含新实例与另一字段的修改，无丢失。
- [ ] AC-006：并发「新建实例」与「删除/隐藏另一实例」两者都成功后，最终 config 反映两项结果；tombstone（`removedConnectorIds`）与实例列表不互相覆盖。
- [ ] AC-007：并发两入口触发时，冲突策略与上表逐入口一致：save 冲突返回 `CONFLICT`；import/duplicate/createInstance 不因并发被静默丢弃，且不互相交错产生混合状态。
- [ ] AC-008：auto-seed / prune 在并发写窗口内基于最新状态应用，不覆盖并发用户改动（最终状态含用户改动与新 seed/prune 结果）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试（并发注入 + 最终状态断言；用可控制的 store 时序制造交错）。

## 上下文区

- 来源：日常审计 d058（2026-09-14）；用户 2026-09-14 裁定逐入口并发策略与「排队覆盖读-算-提交」

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 真实文件系统级掉电/强杀（非并发）下的写损坏：由既有原子写/`.bak` 机制覆盖，不属并发语义。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 临时 config 目录 + 并发调用；断言最终文件与内存 cache 一致、无交错、非重叠修改全部保留（不只断言 JSON 完整）。
- 逐入口成对测试：入口 A 与入口 B 并发，断言双方结果与最终状态。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无（各入口现状与冲突策略已由上表逐条核实；策略为用户已裁定，非待产品确认项）。

### 风险与回退

- 风险：改动写入路径影响所有配置保存，回归面大。
- 回退：保留 `saveIfBaseMatches` 现状，仅把绕过队列的入口接入队列；临界区内改为读最新状态再计算。

### 依赖与约束

- 前置：依赖 t472（同文件区域、导入/secret 语义先定型）。
- 与 t472 的分界：t472 = 单次导入内部 config↔vault 一致性；t479 = 跨入口并发交错与 base 冲突。
- 安全/并发敏感，review_level=full。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：配置写入冲突策略逐入口表 + 「排队覆盖读-算-提交」。
- `docs/specs/config-store.md`：写入入口与并发语义。
- `docs/specs_index.md`：挂 t479。
