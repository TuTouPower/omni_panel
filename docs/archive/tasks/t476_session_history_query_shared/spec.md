# Task spec

## 背景

查询类能力的业务逻辑在桌面 IPC 与 LocalAPI 各写一份，已漂移（d058）。两块：

1. 会话历史 query / recent / searchContent / summaries / sources：
    - 桌面 `src/main/ipc/session-history-ipc.ts:100-410` vs LocalAPI `src/main/core/local-api/server.ts:245-572`。
    - query：IPC 直接透传 `source/env/id/limit/before_cursor`；LocalAPI 强制要求 `id` + `source` + `env`（缺则 400，`server.ts:348-358`），`limit` 经 `parse_int_param(min:1)`（`server.ts:370-377`）。
    - recent：IPC `limit` 校验为 [1, 10000] 整数（`session-history-ipc.ts:82,243-248`，`INVALID_LIMIT`）；Web bridge 的 `recent` 无视入参、硬编码取 `/v1/sessions` 前 20（`src/web/usageboard-web.ts:755-763`），且 LocalAPI 无 `/v1/sessionHistory/recent` 端点（`server.ts` 无该 path）。
    - searchContent：LocalAPI 逐字段类型校验（keyword string、filters 形状、sources 数组、search/title/directory string，`server.ts:420-462`），畸形回 400；IPC 走 `content_search_candidates` 直接强转，畸形可能 500。分页区间 `clamp_search_content_range`（`search_content_range.ts`）在两侧各自拷一份调用。
    - summaries：LocalAPI 对 loc 逐条校验、空/畸形跳过（`server.ts:540-551`）；IPC 直接对 `request.locs` 迭代（`session-history-ipc.ts:388-396`），未校验 entry 形状，畸形可能抛错。
    - 常量：`CONTENT_SEARCH_PAGE_SIZE = 100`、`SEARCH_ENUM_CAP = 100000` 在 `session-history-ipc.ts:78-80` 与 `server.ts:186-188` 各维护一份。
2. token-stats / trend / dashboard：
    - `limit` 校验桌面严格（整数 [1, 10000]，`token-stats-ipc.ts:32-43`，`INVALID_LIMIT`）；LocalAPI `/v1/sessions` 用 `parse_int_param(min:0)` 无上界、允许 0（`server.ts:1510-1516`）；store 默认 `filters.limit ?? 100`（`token-stats-store.ts:1532`）。
    - `/v1/records`：LocalAPI 无显式 limit 校验，缺省走 store `DEFAULT_RECORDS_LIMIT=5000`（`token-stats-store.ts:39,1606`）；桌面 `TOKEN_STATS_RECORDS` 有 [1, 10000] 校验。
    - trend：IPC `Math.floor` 且 `days<=0`/非数回退 7（`trend-ipc.ts:31`）；LocalAPI 同样回退 7 且要求 4 个必填 query（`server.ts:1549-1563`）。
    - dashboard `sources_status`：IPC 组装 `store.sources_status()` 并入 status（`token-stats-ipc.ts:185-188`）；LocalAPI `/v1/dashboard` 只传 `{running,last_updated}`，缺 `sources_status`（`server.ts:1304-1307`）；`tokenStatsDashboardDtoSchema.status.sources_status` 为可选（`shared/types/token-stats.ts:507`）。

## 契约区

### 范围

- 把两组查询的参数校验、过滤组合、分页、常量、DTO 组装下沉到共享 service 层；IPC 与 LocalAPI 只做参数解包与结果封装。
- **固定参数契约**（两侧一致），并据此实现：
    - 会话 query：`id`/`source`/`env` 必填（缺 → 400/VALIDATION_ERROR）；`limit` 缺省=无限制或既有 store 默认，出现时必须为整数且 ≥1，非法 → 400；`before_cursor` 缺省=从尾部，出现时须为有限数。
    - session recent：`limit` 必填且为 [1, 10000] 整数，非法 → 400/VALIDATION_ERROR（对齐 IPC 现状）。
    - searchContent：`keyword` 必填 string；`filters` 形态错误 → 400；`sources` 数组、`search/title/directory` string；`offset`/`limit` 缺省与越界按 `clamp_search_content_range` 既有语义（`limit` 非有限/≤0 视为到末尾）。
    - summaries：`locs` 必为数组；数组内畸形/空项按**同一策略**——逐条校验、跳过无效项、保留有效项，不整单失败（对齐 LocalAPI 现状）。
    - token-stats sessions/records：`limit` 出现时必须为 [1, 10000] 整数（对齐桌面 IPC 现状），非法 → `INVALID_LIMIT`；缺省分别走 store 默认（sessions 100 / records 5000）。
    - trend：`provider/accountId/metricId/sourceInstanceId` 必填，缺 → 400/VALIDATION_ERROR；`days` 缺省=7，出现时须为有限数且 >0，按 `Math.floor` 截断，否则回退 7。
    - 排序/分页/过滤：`order_by` ∈ {ended_at,tokens,calls,started_at,title}，`direction` ∈ {asc,desc}，非法值忽略走默认；`offset` 非负整数，`min_*/max_*` 非负整数。
    - dashboard `sources_status`：来源为 `TokenStatsStore.sources_status()`（采集器写入的最新一轮 per-source 状态，`collector.ts:944` → `set_sources_status`），两端响应都含 `status.sources_status`（无数据时为空数组）。
- 统一常量（`CONTENT_SEARCH_PAGE_SIZE`、`SEARCH_ENUM_CAP`、limit 上下界、trend 默认天数）为单一来源。
- 保持对外 DTO 形状不变（除补回 sources_status）。
- **双入口测试**：既断言具体业务结果（结果集/排序/分页/错误分类），也断言 IPC 与 HTTP 两端同一输入同一输出（一致性），不写「同为接受或拒绝皆可」的空洞断言。

### 非范围

- 不改会话提取器/定位器（extractor、locator）。
- 不改 SQLite 表结构、token-stats 聚合逻辑（t192 层）。
- 不改 UI 查询参数命名与渲染逻辑。
- 不改 Web bulk trend 的请求方式（如批量优化另立 task）。
- Web bridge 的接线（recent 尊重入参、snapshot/forceCollect 实现）归 t480；本 task 负责共享业务层契约。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：同一 query 请求（相同参数）经 IPC 与 `/v1/sessionHistory/query` 返回相同结果集与排序。
- [ ] AC-002：畸形/缺参输入在两条入口返回一致的错误分类（同为 400/VALIDATION_ERROR），不再一端 400、一端 500。
- [ ] AC-003：同一 searchContent 请求两端返回相同分页结果与常量生效值（页大小、枚举上限单一来源）。
- [ ] AC-004：summaries 对含畸形 loc 的输入两端按同一策略处理（逐条跳过无效项、保留有效项），结果一致。
- [ ] AC-005：`limit: 0`、`limit: 10001`、非整数 limit 在 token-stats sessions/records 的 IPC 与 `/v1/...` 两端返回一致的接受/拒绝结果。
- [ ] AC-006：dashboard 响应在 IPC 与 `/v1/dashboard` 两端都含 `status.sources_status`，相同数据下取值一致；无采集报告时为空数组。
- [ ] AC-007：相同 trend 请求两端返回相同结果与相同默认天数（缺省 `days` 行为一致），缺必填参数与非法 `days` 的错误分类一致。
- [ ] AC-008：重复实现被替换为共享 service 调用，源代码中不再存在两份独立的查询逻辑（常量、校验、分页单一来源）。
- [ ] AC-009：session `query`/`recent`/`searchContent` 的必填与数值边界按上表被显式断言（每个参数一组正/反用例），且两端逐条一致。

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

- 临时 sqlite fixture + 双入口调用；断言具体结果、DTO 形状与错误分类逐条一致（正/反用例成对）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无（t457 的 title/directory 过滤参数在两端的现状已由本仓 `server.ts:453-461` 与 `session-history-ipc.ts:132-135` 核实；`sources_status` 来源已由 `collector.ts:944` / `token-stats-store.ts:1953-1958` 核实，见范围）。

### 风险与回退

- 风险：下沉时改变既有 IPC/Web 行为导致 UI 回归；统一校验收紧后 Web 端既有宽松调用报错。
- 回退：先建立共享 service + 双入口适配，保留旧路径直到双入口测试通过；DTO 补齐（低风险）与校验统一分步实施。

### 依赖与约束

- 前置：无。
- 与 t480（Web bridge 补齐）有交集，建议错开实施；本 task 定义共享层契约，t480 负责 bridge 接线。

### Finalization 时更新的 blueprint

- `docs/specs/session-library.md`：共享 service 边界与参数契约（含 query/recent/searchContent/summaries 的必填与边界表）。
- `docs/specs/ai-cli-token-stats-api.md`：查询校验与 DTO 单一来源（含 sources_status）。
- `docs/specs_index.md`：挂 t476。
