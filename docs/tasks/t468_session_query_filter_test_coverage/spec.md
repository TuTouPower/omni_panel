# Task spec

## 背景

t457 已实现会话查询的 title/directory 独立过滤，但 review 留下三项 minor 测试覆盖缺口。来源 p224（2026-09-09 核实，t458 仅完成 UI 接入，未覆盖这三项）。

## 契约区

### 范围

- 补 store 层 search 与 title/directory 同时使用的组合过滤测试。
- 补 id 含目标词但 title 不含目标词时不应命中的判别 fixture/断言。
- 补桌面 IPC `tokenStats:sessions` 将 title/directory filters 原样透传给 `query_sessions` 的断言。

### 非范围

- 不改变查询生产逻辑、SQL、过滤语义或 IPC handler 行为。
- 不新增 UI 行为或修改既有验收预期。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：store 层同时提供非空 search 与 title/directory 时，结果满足全部过滤条件，且参数绑定/LIKE 转义路径被真实 query 覆盖。
- [ ] AC-002：存在仅 id 含目标词、title/directory 不含目标词的会话时，title 过滤不会错误命中该会话。
- [ ] AC-003：桌面 IPC `tokenStats:sessions` 在带 title/directory 的 filters 下调用 `query_sessions` 时，完整透传对应字段及其它过滤参数。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：p224 / t457_test_f001..f003（2026-09-09 核实；t458 已完成 UI 接入但未闭合这三项测试缺口）

### 有意不测

- 无

### 测试策略

- store 测试使用现有临时数据库/fixture 与生产 `query_sessions` 入口。
- IPC 测试使用现有 handler mock，断言 `query_sessions` 收到的完整 filters 对象。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无

### 风险与回退

- 风险：只调整 fixture 可能掩盖生产路径未触达；测试必须调用真实 store/handler。
- 回退：若现有 fixture 不足，增加最小交叉字段 fixture，不改变生产实现。

### 依赖与约束

- 依赖 t457/t458 已完成的过滤契约与 UI 接入。
- 本 task 仅补测试与必要 fixture，不修改生产过滤逻辑。

### Finalization 时更新的 blueprint

- 无
