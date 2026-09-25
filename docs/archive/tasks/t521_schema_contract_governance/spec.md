# Task spec

## 背景

系统中存在 Schema 双源分叉与契约缺少校验问题：`manifest.ts` 与 `plugin-metadata.schema.json` 规则不一致导致合法配置在跨校验时报错；`pluginResultSchema` 定义后未在数据管道边界真正消费；环境配置模板缺少最新连接器说明；Schema 导出文件无防篡改/防漂移门禁，易出现手改导致脱节。

## 契约区

### 范围

- 确定 zod 定义为 Schema 的单一权威源，JSON Schema 必须由其编译生成，消除手写双源分叉。
- 在连接器产物消费边界调用 `pluginResultSchema.safeParse`，杜绝未校验数据流入管道。
- 补全 `.env.example` 中各类连接器的环境变量说明。
- 在 `scripts/export-schemas.ts` 中实现 `--check` 参数，并在 CI 中集成防漂移门禁。
- 统一 probe 与 observe 领域术语。

### 非范围

- 不改变插件 manifest 的对外字段语义。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [x] AC-001：`plugin-metadata.schema.json` 与 zod 生成源完全对齐，不再出现合法字段被拦截的冲突分歧。
- [x] AC-002：连接器返回非契约格式的脏数据时被 `pluginResultSchema` 拦截并记录警告，数据不进入下游存储。
- [x] AC-003：执行 `pnpm schema:export --check` 能准确比对磁盘文件与代码生成物；若存在未同步修改则返回错误。
- [x] AC-004：`.env.example` 包含当前全部连接器的配置指引说明。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试

## 上下文区

- 来源：`docs/reviews/review_20260925_085413/adoption_decision.md`（采纳项 A77, A78, A80, A81）

### 有意不测

- 无

### 测试策略

- 编写双向 parse 测试断言 schema 兼容性。
- 模拟 schema 漂移场景验证 `--check` 退出码。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无

### 风险与回退

- 风险：若存量连接器输出缺少某些非必需字段可能触发 safeParse 拦截。
- 回退：确保 schema 中对可选字段正确使用 `.optional()`，并回归现有连接器测试。

### 依赖与约束

- 依赖 zod 与 json-schema 生成器。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：记录单一 Schema 来源与 CI 防漂移规则
