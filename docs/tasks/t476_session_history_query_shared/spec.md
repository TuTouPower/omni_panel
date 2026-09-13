# Task spec

## 背景

查询类能力的业务逻辑在桌面 IPC 与 LocalAPI 各写一份，已漂移（d058）。两块：

1. 会话历史 query / recent / searchContent / summaries：桌面 `src/main/ipc/session-history-ipc.ts:100-410` vs LocalAPI `src/main/core/local-api/server.ts:245-572`。server 的 query 强制要求 `source`+`env`（400），IPC 直接透传；searchContent 校验强度不同（server 400 vs IPC 强转后可能 500）；summaries 对畸形项处理不同；`limit` 校验不同；`CONTENT_SEARCH_PAGE_SIZE`、`SEARCH_ENUM_CAP` 两处各自维护。
2. token-stats / trend / dashboard：桌面 `token-stats-ipc.ts:36/185`、`trend-ipc.ts:18` vs LocalAPI `server.ts:1510/1304/1547`。`limit` 校验桌面严格（1..10000 整数）Web 宽松（min 0 无上界、允许小数）；dashboard `sources_status` 桌面有 Web 无；trend 双实现校验不同、各自 `Math.floor`/默认 7。

## 契约区

### 范围

- 把两组查询的参数校验、过滤组合、分页、常量、DTO 组装下沉到共享 service 层；IPC 与 LocalAPI 只做参数解包与结果封装。
- 统一参数校验规则（必填、范围、整数性）与错误分类（400/VALIDATION_ERROR 口径一致）。
- 统一常量（`CONTENT_SEARCH_PAGE_SIZE`、`SEARCH_ENUM_CAP`、limit 上下界、trend 默认天数）为单一来源。
- dashboard 状态 DTO 统一：`sources_status` 两端都存在且语义一致。
- 保持对外 DTO 形状不变（除补回 sources_status）。

### 非范围

- 不改会话提取器/定位器（extractor、locator）。
- 不改 SQLite 表结构、token-stats 聚合逻辑（t192 层）。
- 不改 UI 查询参数命名与渲染逻辑。
- 不改 Web bulk trend 的请求方式（如批量优化另立 task）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：同一 query 请求（相同参数）经 IPC 与 `/v1/sessionHistory/query` 返回相同结果集与排序。
- [ ] AC-002：畸形/缺参输入在两条入口返回一致的错误分类（同为 400/VALIDATION_ERROR），不再一端 400、一端 500。
- [ ] AC-003：同一 searchContent 请求两端返回相同分页结果与常量生效值（页大小、枚举上限单一来源）。
- [ ] AC-004：summaries 对含畸形 loc 的输入两端处理一致（同一跳过/报错策略）。
- [ ] AC-005：`limit: 0`、`limit: 10001`、非整数 limit 在 IPC 与 `/v1/...` 两端返回一致的接受/拒绝结果。
- [ ] AC-006：dashboard 响应在 IPC 与 `/v1/dashboard` 两端都含 `status.sources_status`，相同数据下取值一致。
- [ ] AC-007：相同 trend 请求两端返回相同结果与相同默认天数（缺省参数行为一致），缺参错误分类一致。
- [ ] AC-008：重复实现被替换为共享 service 调用，源代码中不再存在两份独立的查询逻辑。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试（共享 service 单测 + 双入口集成测试）。

## 上下文区

- 来源：日常审计 d058（2026-09-14）；原 t477 合并入本 task

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 临时 sqlite fixture + 双入口调用；断言结果、DTO 形状与错误分类一致。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 现有对外 query 参数契约（t457 引入 title/directory）是否需在两端完全一致：UNVERIFIED-BLOCKING，实施期读 `docs/specs` 与 t457 spec 确认。
- `sources_status` 的完整字段定义与来源：UNVERIFIED-BLOCKING，实施期读 t192/collector 相关代码确认。

### 风险与回退

- 风险：下沉时改变既有 IPC/Web 行为导致 UI 回归；统一校验收紧后 Web 端既有宽松调用报错。
- 回退：先建立共享 service + 双入口适配，保留旧路径直到双入口测试通过；DTO 补齐（低风险）与校验统一分步实施。

### 依赖与约束

- 前置：无。
- 与 t480（Web bridge 补齐）有交集，建议错开实施。

### Finalization 时更新的 blueprint

- `docs/specs/session-library.md`：共享 service 边界与参数契约。
- `docs/specs/ai-cli-token-stats-api.md`：查询校验与 DTO 单一来源。
- `docs/specs_index.md`：挂 t476。
