# Task spec

## 背景

配置写入的并发语义按入口不同（d058）：`handleConfigSave` 走 `saveIfBaseMatches` 冲突检测（`config-ipc.ts:195`）；`handleConfigImportData`（`config-ipc.ts:516`）、`handleConfigDuplicate/CreateInstance`（`config-ipc.ts:318/374`）、CLI import（`import-config.ts:117`）都直接 `save` 覆盖。并发保存窗口下，导入/复制/新建可静默覆盖另一窗口的改动，而设置页保存会报 CONFLICT。

## 契约区

### 范围

- 统一配置写入语义：所有写入口（save / import / duplicate / createInstance / CLI import / auto-seed / prune）经同一串行化写入路径。
- 明确并实现各入口的冲突策略：导入/复制/新建为「用户显式整体操作」，可覆盖但需串行化（不与并发 save 交错），并保证最终状态一致。
- 写出「哪些入口允许覆盖、哪些要求 base match」的决策并落 blueprint。

### 非范围

- 不改 config store 的原子写/备份实现。
- 不改 t472 的导入格式。
- 不改 debounce 保存逻辑本身。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：并发「设置页保存」与「导入」不再产生撕裂写入；最终 config 为二者之一且内容自洽（非混合）。
- [ ] AC-002：导入/复制/新建在并发窗口下的行为与决策文档一致（覆盖或拒绝，可复现）。
- [ ] AC-003：CLI import 与桌面 import 对同一并发场景表现一致。
- [ ] AC-004：所有配置写入口经同一串行化路径（代码中不再有绕过队列的直接 `save`）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试（并发注入 + 最终状态断言）。

## 上下文区

- 来源：日常审计 d058（2026-09-14）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 临时 config 目录 + 并发调用；断言最终文件与内存 cache 一致、无交错。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 各入口期望的冲突策略（覆盖 vs 拒绝）：UNVERIFIED-BLOCKING，需产品裁定，实施期与用户确认后写入决策。

### 风险与回退

- 风险：改动写入路径影响所有配置保存，回归面大。
- 回退：保留 `saveIfBaseMatches` 现状，仅把绕过队列的入口接入队列。

### 依赖与约束

- 前置：建议在 t472 之后（同文件区域）。
- 安全/并发敏感，review_level=full。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：配置写入冲突策略。
- `docs/specs/config-store.md`：写入入口与并发语义。
- `docs/specs_index.md`：挂 t479。
