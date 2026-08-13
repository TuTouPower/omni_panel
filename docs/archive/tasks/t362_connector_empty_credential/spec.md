# Task spec

## 背景

连接器空凭据/空结果语义不一致：(1) deepseek/tikhub 空 API_KEY 静默 `return []`，账号显示「正常」但永远无数据（对照 kimi 缺凭据明确 throw）；(2) antigravity 连接器是空 stub（`main()` 恒 `return []`），manifest 却声明 local 能力，用户添加后恒空数据且无失败提示；(3) kimi manifest 声明可选 API_KEY 回退但 UI 路径设不了它，API_KEY-only 路径不可达。

## 契约区

### 范围

- deepseek/tikhub 无 key 时 `throw new Error("Missing required secret: API_KEY")`（与 kimi 对齐），或 `report_failed_account`。
- antigravity 连接器标注为占位 stub（manifest/添加对话框明示「暂不支持」），或实现 local 读取逻辑。
- kimi manifest 的 API_KEY 回退路径要么在 UI 暴露输入，要么从 manifest 移除。

### 非范围

- 不改 connector 采集协议。

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

- [ ] AC-001：空 API_KEY 不再静默成功（deepseek/tikhub 报 failed 或明确错误）。
- [ ] AC-002：antigravity 占位状态对用户可见（manifest/UI 明示），不误导为可用连接器。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：connector 集成测试（空 key 断言 failed/throw、antigravity 断言空观测+标注）。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`deepseek/connector.ts:28`、`tikhub/connector.ts:27`、`antigravity/connector.ts:8`、`antigravity/connector.ts:152`、`docs/specs/connector-direct.md:21`、`kimi/manifest.json:16-21`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 集成测试：空 key fixture 断言 deepseek/tikhub 报 failed；antigravity 断言空观测且 spec 标注 stub。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- antigravity 真实读取路径：`UNVERIFIED-SPIKE`，实施前先确认 `~/.antigravity/session.json` 结构与是否已废弃。

### 风险与回退

- 风险：antigravity 若已废弃，实现读取逻辑是浪费。
- 回退：先标注 stub 并降级 UI 提示，读取逻辑留待 spike 确认。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- `docs/specs/connector-direct.md`：antigravity 占位状态同步。
