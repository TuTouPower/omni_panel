# Task spec

## 背景

文档/spec 与实现错位：(1) popup 高度注释/spec/测试指南仍写「75% 工作区」，实现已是 100%（t081 把 MAX_HEIGHT_RATIO 改 1.0，但注释未同步）；(2) cpa 连接器文件头注释「5 provider parser」实际 4 个；(3) smoke_check.md 沿用旧 plugin 术语、进程退出描述与托盘常驻设计矛盾；(4) data_section 硬编码「4.2 MB」过期数字；(5) UpcomingResetCard 空态文案硬编码「未来 7 天」与可配置阈值不一致；(6) CLI 帮助文本声称 `omni_panel --help` 可用但裸 --help 不触发。

## 契约区

### 范围

- popup-height-controller 三处注释、window-management.md、testing.md 的 75% 改 100%。
- cpa 注释改「4 个 provider parser」。
- smoke_check.md 更新为连接器/账号模型 + web 面板 + CLI serve，进程退出描述对齐托盘常驻。
- data_section 硬编码数字改「暂未开放」或从后端读取。
- UpcomingResetCard 文案改「当前无即将重置」或传入实际窗口。
- CLI 帮助文本删 `--help` 表述或 parse_cli_args 把裸 --help 归一。

### 非范围

- 不改实现行为（仅文档/文案对齐）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：popup 高度相关文档/注释统一为 100%（不再残留 75%）。
- [ ] AC-002：smoke_check.md/CLI 帮助文案与实际行为一致。
- [ ] AC-003：硬编码过期文案（4.2MB/未来 7 天）不再误导。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 文档一致性可 grep/静态断言；CLI 帮助为行为验证（若选择归一化则补单测）。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`popup-height-controller.ts:55`/`:126`、`window-management.md:33`、`testing.md:128`、`cpa/connector.ts:4`、`smoke_check.md:24-31`/`:338`、`data_section.tsx:272`、`UpcomingResetCard.tsx:316`、`index.ts:186`、`designmd.ts:129`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 纯文档改动不做行为测试；用 grep 断言一致性。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 静态检查：grep 全仓「75%」「4.2 MB」等过期字样确认清理；CLI 帮助若归一化则补 parse_cli_args 单测。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：文档改动与实现仍有细微出入。
- 回退：以实现为真相源，文档对齐实现。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- `docs/specs/window-management.md`：popup 高度约束改 100%。
