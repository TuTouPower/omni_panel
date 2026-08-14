# Task spec

## 背景

`schemas/` 是跨服务接口契约。zod 源（`src/shared/schemas/plugin-output.ts` / `plugin-metadata.ts`）已演进到 15 provider、`cycleDurationMs`/`metric_id`/`error` 字段、`login_url`/`cookie_names` 顶层键、provider 改 regex，但导出的 `schemas/plugin-output.schema.json` / `plugin-metadata.schema.json` 停留在 2026-07-03（`1a3bc4f9 remove gemini`），`pnpm schema:export` 未随 t049/t050/t051/grok 重跑。`additionalProperties:false` 会让任何按 JSON 校验的插件输出（含 `cycleDurationMs` 等合法字段）校验失败，外部消费者误判为非法。

## 契约区

### 范围

- 重跑 `pnpm schema:export`（`scripts/export-schemas.ts`）重新生成两个 schema.json 并提交。
- 在 CI（`ci.yml`/`nightly.yml` 或 `pnpm check`）加入「导出物与 zod 源一致」检查：生成后 `git diff --exit-code` 漂移即失败。

### 非范围

- 不改 zod 源本身的 schema 定义（它们已是对的）。
- 不做 schema 版本化/向后兼容协商机制（超出本次修漂移范围）。

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

- [ ] AC-001：`schemas/plugin-output.schema.json` 的 `provider` enum 与 `usageProviderSchema` 一致（含 getoneapi/exa/tikhub/grok，或改用同源 regex）。
- [ ] AC-002：`schemas/plugin-output.schema.json` 的 items 含 `cycleDurationMs`/`metric_id`/`error` 字段，`additionalProperties` 与 zod 源语义一致。
- [ ] AC-003：`schemas/plugin-metadata.schema.json` 含 `login_url`/`cookie_names` 顶层键，`supportedProviders` 与 zod 源一致（同源 regex，新增 provider 自动覆盖）。
- [ ] AC-004：CI 或 `pnpm check` 中新增 schema 新鲜度检查（生成后 diff），源与导出物漂移时检查失败。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：AC-001/002/003 通过 `pnpm schema:export` 产物与 zod 源的结构 diff 断言；AC-004 为 CI 脚本级验证。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`schemas/plugin-output.schema.json:28`、`:116`、`:25-133`；`schemas/plugin-metadata.schema.json:105`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 跑 `export-schemas.ts` 后对两个 JSON 与 zod 源做结构断言（provider 集合、items 键集、顶层键）。
- CI 检查：`.github/workflows/ci.yml` 增加 `pnpm schema:export && git diff --exit-code schemas/`。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：重新导出后 schema 结构变化可能暴露新的 zod 源不完整。
- 回退：schema 生成幂等，重跑即可；CI 检查只读，可临时移除该步骤。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
