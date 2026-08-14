# Task spec

## 背景

`scripts/omni_panel.mjs` 解析 `cli.json` 时用 `JSON.parse` 直接读，`parsed`/`instance` 字段 typed as `any` 并透传进模板串/赋值，`pnpm lint` 报 16 个 `@typescript-eslint/no-unsafe-*`。这是运行时契约 bug 面：损坏的 `cli.json` 会产生不透明的运行时错误而非类型化校验失败。

## 契约区

### 范围

- `omni_panel.mjs`（或抽出的 cli.json 解析模块）用 Zod/schema 校验 `cli.json` 结构，消除 `any` 透传。
- 损坏/缺字段的 `cli.json` 产生可读的校验失败提示。

### 非范围

- 不改 cli.json 的字段语义/契约本身。

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

- [ ] AC-001：`pnpm lint` 通过（0 error），`omni_panel.mjs` 无 `no-unsafe-*` 违规。
- [ ] AC-002：损坏的 `cli.json`（缺字段/类型错误）产生可读校验失败，而非运行时 `TypeError`/`undefined` 透传。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：AC-001 为 lint；AC-002 为脚本级单测（喂损坏 cli.json 断言可读错误）。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`scripts/omni_panel.mjs:92-169`，Validation 段 lint 16 errors）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 新增 cli.json 解析测试：合法/缺字段/类型错误三种输入，断言 zod 错误可读。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- cli.json 完整字段形态：已核实（2026-08-13）——`src/main/cli/cli-json.ts` 的 `CliInstanceInfo`：port/url/pid/userData/startedAt；parse_cli_json 校验前三个必填，userData/startedAt 缺省给空串。

### 风险与回退

- 风险：zod schema 与现有 cli.json 字段不符导致合法文件被拒。
- 回退：先盘点所有 cli.json 写入方字段，schema 宽松化（可选字段），避免误拒。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
