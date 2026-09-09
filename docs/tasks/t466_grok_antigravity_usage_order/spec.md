# Task spec

## 背景

调整用量面板中的特定 provider 用量条顺序，提升 Grok 与 Antigravity 多窗口用量的阅读顺序。

## 契约区

### 范围

- Grok provider 的周用量条固定排在该 provider 用量列表最后。
- Antigravity provider 的用量条固定按 Gemini 5h、Gemini 7d、Claude 5h、Claude 7d 排序。
- 其它 provider 的用量顺序保持现状。

### 非范围

- 不修改用量数值、标签、指标解析或采集协议。
- 不修改 antigravity 连接器采集逻辑。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：Grok 用量面板中，周用量条出现在该 provider 的其它用量条之后。
- [ ] AC-002：Antigravity 用量面板顺序为 Gemini 5h、Gemini 7d、Claude 5h、Claude 7d。
- [ ] AC-003：其它 provider 的用量顺序与修改前一致，相关前端测试通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001：全部可自动测试。
- AC-002：全部可自动测试。
- AC-003：全部可自动测试。

## 上下文区

- 来源：用户需求（2026-09-09）；无外部来源

### 有意不测

- 真实上游采集：不测；本 task 只改变 renderer 列表排序。

### 测试策略

- 在 renderer provider usage 排序单测中覆盖 Grok、Antigravity 和普通 provider。
- 运行相关测试、`pnpm typecheck`、`pnpm lint`、`pnpm build`。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无

### 风险与回退

- 风险：指标 raw label 或 provider label 差异导致排序漏项。
- 回退：回退本 task 单个执行 commit。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
