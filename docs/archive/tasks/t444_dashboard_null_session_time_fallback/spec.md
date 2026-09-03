# Task spec

## 背景

web 面板 /v1/dashboard 对含「records 缺失的 session」返回 500「Invalid dashboard response」:rollup 就绪路径 `materialize_session_meta` 从 rollup 建 session_meta 骨架(started_at/ended_at 默认 NULL),再窄查 records 补时间;session 只在 rollup/sessions 表有、records 无时(数据不一致)补查失败 → NULL 时间透出 → DTO schema 拒 → 整面板崩。来源 p211(2026-09-04 复现:7 条 8-28 grok session 触发,复现笔记见 `.scratch/task-bug-dashboard-null-session/`)。

## 契约区

### 范围

- `materialize_session_meta`(token-stats-store.ts:783)records 补查失败(row undefined)时,从 `token_stats_sessions` 表兜底该 session 的 title/directory/started_at/ended_at,杜绝 NULL 时间透出。
- 上述兜底对主 dashboard(:1669)与 `query_dashboard_sessions`(:1799)两入口同时生效(共用 materialize_session_meta)。
- 补测:构造「rollup 就绪 + session 仅 rollup/sessions 有、records 无」场景,跑两端点断言不抛、时间兜底非 null、其余 session 正常。
- 清理用户库中 7 条 8-28 脏 grok session 数据(rollup + sessions 表;records 本无)。[deploy]

### 非范围

- 不改 connector/grok 采集逻辑(脏数据为 8-28 一次性异常,今日采集正常,非采集缺陷复发)。
- 不改 `dashboard_session_items` 的 schema 校验或 DTO 结构。
- 不做 dashboard 查询性能优化。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `.repo_template/docs/usage.md`「命名与格式」。

<!-- /规范 -->

- [ ] AC-001：构造「rollup 就绪 + 某 session 仅 rollup/sessions 表有、records 无」的数据后,`store.query_dashboard` 返回该 session 的 started_at/ended_at 为非 null 数值(兜底自 sessions 表),不再抛/不再被 DTO schema 拒。
- [ ] AC-002：同上数据下,`store.query_dashboard_sessions` 返回的 items 时间字段同样非 null。
- [ ] AC-003：records 正常的其余 session,其 title/directory/started_at/ended_at 与修复前一致(兜底不覆盖已有正确值)。
- [ ] AC-004 [deploy]：真实库清理后,/v1/dashboard 与 /v1/dashboard/sessions 对 8-28 那 7 条脏 grok session 的时间窗返回 200(不再 500)。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001/002/003：可自动测试(单元层构造不一致数据)。
- AC-004 [deploy]：需真实库与运行实例,自动测试覆盖等价单元场景(AC-001/002),清理动作用脚本验证后人工确认。

## 上下文区

- 来源：p211(2026-09-04 复现并登记,根因定位到 materialize_session_meta records 补查无兜底;已确认同类位点 query_dashboard_sessions 共用同一函数)

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 真实库清理动作(AC-004 [deploy]):人工 + 脚本核对,不写自动测试;单元场景由 AC-001/002 覆盖。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 按项目默认(token_stats_dashboard.test.ts / token-stats-store.test.ts 基建)。
- 单元构造:标记 rollup ready + 向 rollup/sessions 表插入 session(有 started_at)但 records 不插 → 调 query_dashboard/query_dashboard_sessions,断言时间非 null、不抛、正常 session 不受影响。
- 复现锚点:`.scratch/dash_probe.mts`(真实库)做黑盒交叉验证。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无。sessions 表对脏 session 有有效 started_at 已实证(node 直查)。

### 风险与回退

- 风险：兜底从 sessions 表取时间,若 sessions 表该 session 也缺时间(理论极端)仍可能 null——按最小充分原则:records 补不到 → sessions 表兜底;sessions 也缺 → 该 session 在 window_rows 的 MIN(hour_start) 二次兜底,保证非 null。实现时按实际可达性选层,不超需求。
- 回退：git revert;清理脚本前备份 sqlite。

### 依赖与约束

- 数据清理需备份 `~/.config/OmniPanel/observations.sqlite`(624MB)后方可改,删除仅限 7 条已确认脏 session(固定 session_id 清单,见复现笔记)。
- 不触碰 records 表(本无脏行)。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：无。
