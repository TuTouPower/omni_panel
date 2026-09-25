# Task spec

## 背景

项目文档与治理索引存在多处滞后与分裂：README 与架构文档中连接器数量存在 16、17、20 三种不同数字；项目交接总账 `handoff.md` 与需求索引 `specs_index.md` 滞后较久；`AGENTS.md` 目录权责表存在不存在的幽灵目录；部分早期 TDD 决策未登记在 `decisions.md`；用户针对 LocalAPI 局域网免认证（R7）、Vault 密钥同机文件保护（R8）、Cookie 明文存储（R10）的安全威胁模型决策需要正式文档化，以消除后续重复审阅争议。

## 契约区

### 范围

- 同步 `README.md` 与 `architecture.md`：连接器总数统一更新为 20，补全厂商对照清单，清理过期 TODO。
- 迁移 `docs/handoff.md` 旧历史至 `docs/archive/handoff.md`，按 AGENTS.md 规范记录当前分支与提交。
- 梳理更新 `docs/specs_index.md`，补齐近期完成的规格条目。
- 清理 `AGENTS.md` 中关于 `vendors/` 和 `patches/` 等幽灵目录的描述。
- 在 `docs/blueprint/decisions.md` 记录 t507 Grok Bot 指标裁撤的背景与理由。
- 在 `README.md`、`architecture.md` 和 `decisions.md` 补充固化用户对于 LocalAPI LAN 信任模型、Vault 存储及 Cookie 安全策略的明确声明。

### 非范围

- 不修改任何业务源码与自动化测试代码。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：`README.md` 与各架构文档中的连接器统计数字完全一致（20 个），且厂商表格无缺失行。
- [ ] AC-002：`docs/handoff.md` 仅包含当前最新交接记录并符合分支/commit 格式，历史交接迁入归档。
- [ ] AC-003：`docs/specs_index.md` 完整索引当前库内的全部有效规格说明文件。
- [ ] AC-004：`AGENTS.md` 目录权责表中移除非真实存在的路径条目。
- [ ] AC-005：`decisions.md` 包含完整的架构安全模型声明（涵盖 LocalAPI、Vault、Cookie 与指标裁撤决策）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试

## 上下文区

- 来源：`docs/reviews/review_20260925_085413/adoption_decision.md`（采纳项 A83-A87，以及 R7, R8, R10 声明要求）

### 有意不测

- 无

### 测试策略

- 运行文档链接与规范检查工具，人工核对各文档版本的一致性。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无

### 风险与回退

- 风险：更新交接与索引文件时若遗漏有效历史可能影响回溯。
- 回退：历史记录统一归档至 archive 目录，随时可查证。

### 依赖与约束

- 遵循项目文档撰写规范。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：同步连接器与安全声明
- `docs/blueprint/decisions.md`：记录历史取舍与安全决策
