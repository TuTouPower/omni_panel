# Task review t055（reviewer_focus: 代码）

- task：`t055_connector_threshold_centralize`
- spec：`docs\tasks\t055_connector_threshold_centralize\spec.md`
- diff_anchor：`969afba3f7285832c7d7a6aa0dae49e2237382b9`
- target：`git diff 969afba3f7285832c7d7a6aa0dae49e2237382b9`
- round：1
- reviewed_at：2026-07-23 17:35 UTC+8

## Findings

（无）

## 范围外提示（不进 finding 表）

1. **P5 共享 helper 集中化遗留裁决——合理**
    - spec AC「共享阈值 helper 抽出，单测覆盖三函数边界」未直接落地。实现采用各连接器 inline helper（claude `status_for_pct`、firecrawl `status_for_ratio`），与既有 deepseek/mimo/tikhub/getoneapi/cpa 的 inline 模式一致。
    - 硬约束可证：`docs/blueprint/conventions.md:161` 明确「禁止 `import`/`export` 语句（运行时正则拦截）」——sandbox 单文件模型使跨连接器共享 helper 必须先扩 `ConnectorContext` 或放开 sandbox，属架构改动。
    - task.md「过程记录」已注明标遗留另立 spike；本 task 仅修硬编码 bug。裁决与硬约束自洽。

2. **CPA I5（to_pct 缺失）归 t059**
    - spec AC「cpa utilization 缺失 → null（跳过 status，不标 normal）」本 task 未实现。
    - task.md「过程记录」已显式拆分到 t059（空响应处置）。属已知范围拆分；建议 t055 收尾时同步修订 spec.md 范围说明，避免 AC 与实现长期错位。

## 阈值正确性逐连接器核对

### claude `status_for_pct`（`connectors/claude/connector.ts:45-49`）

- 阈值 `≥90 critical / ≥75 warning / 否则 normal`。
- 对齐 `docs/blueprint/conventions.md:168`（percent 型 90/75）。
- 与 `connectors/cpa/connector.ts:55-59` 既有 `status_for_pct` 逐字一致（内联复制可接受，sandbox 禁 import）。
- 调用点 `:91` `:110` 传 `pct(data.five_hour?.utilization)` / `pct(data.seven_day?.utilization)`，`pct()` 已 clamp 至 [0,100] 并 round，入参语义匹配 helper 契约（百分比）。
- 方向正确（used 越高越危险）。

### firecrawl `status_for_ratio`（`connectors/firecrawl/connector.ts:15-21`）

- `limit <= 0 → unknown`；`ratio >= 0.9 critical`；`ratio >= 0.75 warning`；否则 normal。
- 对齐 conventions.md:168（ratio 型 0.9/0.75）。
- `limit <= 0 → unknown` 守卫与兄弟连接器 call-site 模式一致：`tikhub/connector.ts:90`、`getoneapi/connector.ts:88`（`limit_num > 0 ? status_for_balance(...) : "unknown"`）；firecrawl 把守卫内嵌到 helper，语义等价。
- 调用点 `:95` `:104` 传 `(credits.used, credits.limit)` / `(tokens.used, tokens.limit)`，`extract_usage` 已用 `to_number` 兜底非 finite 为 0；`plan` 缺失 → limit=0 → unknown，不会误报 normal。正确。
- 方向正确（used/limit 越高越危险；非 balance 反向型）。

### codex（`connectors/codex/connector.ts:124`）

- `limit: null` 且 `status: "normal"` → `status: "unknown"`。
- spec AC「codex limit=null → unknown」直接满足。
- `cycleDurationMs: null`、`limit: null`、`reset_at: null` 与 unknown 语义自洽（无上限信息时不声称健康）。
- `observation_status_schema` 已含 `"unknown"`（`src/shared/schemas/observation.ts:5`），schema 合法。

## 代码质量扫描

- **DRY**：三连接器各一个 3-4 分支的小 helper，sandbox 禁 import 使共享不可行；非 verbatim 重复（语义型不同：pct vs ratio）。
- **圈复杂度**：`status_for_pct` CC=3，`status_for_ratio` CC=4，均远低于 minor 阈值 10。
- **文件大小**：claude=119、firecrawl=109、codex=135（物理行），均远低于实现源码 minor 阈值 400。
- **边界**：firecrawl `limit <= 0` 守卫已覆盖 plan 缺失场景；`to_number` 兜底非 finite；claude `pct()` clamp 100。
- **死代码 / 命名**：无。helper 命名清晰表达阈值方向。
- **不变量**：`observation_status_schema` 全部入参合法；`source_instance_id` 仍未由连接器设置（符合契约）。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：0 条。
- 总体判断：范围内 3 连接器 status 阈值修复方向、语义、边界均正确，与 conventions.md 及兄弟连接器既有模式一致；P5 共享集中化遗留裁决受 sandbox 硬约束支撑、合理；CPA I5 拆分到 t059 有记录。clean review。

verdict: PASS
