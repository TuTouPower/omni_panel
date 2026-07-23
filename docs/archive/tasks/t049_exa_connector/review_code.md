# Task review t049（reviewer_focus: 代码）

- task：`t049_exa_connector`
- spec：`docs\tasks\t049_exa_connector\spec.md`
- diff_anchor：`08ebd8a931e25a72a0cc994806eda0186c8ba6c3`
- target：`git diff 08ebd8a931e25a72a0cc994806eda0186c8ba6c3`（含 untracked：`connectors/exa/`、`tests/integration/connector/exa_connector.test.ts`）
- round：1
- reviewed_at：2026-07-23 16:50 UTC+8

## 评审依据

- 运行时默认值应用点：`src/main/core/scheduler/refresh-service.ts:105` —— `connector_config.parameterValues[name] ?? param.default ?? ""`；非 secret 参数的 manifest `default` 会在进入脚本前填入 `ctx.params`。auto-seed（`src/main/core/config/auto-seed.ts:64-67`）也会把 `param.default` 写入初始 `parameterValues`。
- 类型契约：`src/shared/types/observation.ts:2` `ObservationDisplayStyle = "percent" | "ratio"`，`:3` `ObservationStatus = "normal" | "warning" | "critical" | "unknown"`。
- 同类连接器约定：`connectors/mimo/connector.ts:41-44, 51-57`、`connectors/firecrawl/connector.ts`。所有连接器结尾均为 `void main;`（运行时约定，非 no-op 错误）。

## Findings

### t049_code_f001 - LIMIT ≤0（以及缺失）时 `total_cost_usd` 永远不会得到 `unknown` 状态，违反 spec AC

- 严重度：important
- 位置：`connectors/exa/connector.ts:12-15`（`parse_limit`）、`connectors/exa/connector.ts:26-32`（`status_for_cost`）、`connectors/exa/connector.ts:45,90`（调用链）
- 问题：
    - spec AC（`spec.md:29`）：「status 正向：成本/预算 ≥0.9 critical、≥0.75 warning，LIMIT 缺失/≤0 时 unknown」。
    - spec 正文（`spec.md:15`）：「`limit<=0` 时 `unknown`」。
    - 实现链路：
        1. `parse_limit` 在 `raw` 为 `undefined` / 非数字 / `≤0` 时一律返回 `DEFAULT_LIMIT=100`（`connector.ts:14`：`return value > 0 ? value : DEFAULT_LIMIT;`）。
        2. `main` 中 `const limit = parse_limit(...)`（`connector.ts:45`），把 `limit` 同时塞进 `base` 和 `total_cost_usd` 观测（`:88,90`）。
        3. `status_for_cost(total, limit)`（`:90`）虽含 `if (limit <= 0) return "unknown";`（`:27`），但其入参 `limit` 来自 `parse_limit`，**恒为正**（100 或更大）。该 `unknown` 分支成为不可达死代码。
    - 实际坏结果：用户显式配置 `LIMIT=0` 或负数（也包含 `LIMIT` 留空，因 manifest `default:"100"` 经 `refresh-service.ts:105` 注入后仍为正）时，`total_cost_usd` 的 status 总是 `normal` / `warning` / `critical` 三选一，从不为 `unknown`，直接违反 AC。
    - 与同类连接器的差异：mimo 对 `limit<=0` 返回 `normal`（`mimo/connector.ts:52`），其 spec 未要求 unknown；exa spec 显式要求 unknown，不能照抄 mimo 的 default-100 模式。
- 建议（最小修复方向，非命令）：让 `parse_limit` 对「显式数字且 ≤0」保持原值（如 `0` 或负数）透传给 `status_for_cost`，仅在 `raw` 为 `undefined` / 非数字 时回落。再由 `status_for_cost` 的 `limit<=0 → unknown` 分支兑现 AC。`LIMIT` 留空是否算「缺失 → unknown」由 adoption 阶段对 spec 内部矛盾（manifest `default:100` vs AC 「缺失→unknown」）裁决；当前实现两路都不产生 unknown，无论如何都违 AC。

## 结论

- 前轮 finding 复核：本轮为 Round 1。
- 本轮新发现：1 条（important）。
- 总体判断：`status_for_cost` 的 `unknown` 分支为死代码，spec AC「LIMIT 缺失/≤0 时 unknown」在 `total_cost_usd` metric 上完全未兑现；其他维度（manifest 字段、observation 映射、period/reset_at、零用量、文件规模、复杂度）均合规。

verdict: FAIL

## Round 2 (2026-07-23 17:30 UTC+8)

### 前轮 finding 复核

- **t049_code_f001（important）→ 已修**：
    - `connectors/exa/connector.ts:20-24` `parse_limit` 重写：`raw === undefined || raw.trim() === ""` → `0`；`Number(raw)` 非有限或 `≤0` → `0`；仅 `value > 0` 时透传原值。原先兜底 `DEFAULT_LIMIT=100` 的行为已移除。
    - `connectors/exa/connector.ts:45` `limit_num > 0 ? limit_num : null` 正确把 0 映射为 `null`（满足「无预算」语义）。
    - `connectors/exa/connector.ts:90` `status: limit_num > 0 ? status_for_cost(total, limit_num) : "unknown"` 在调用点兑现 AC，而非依赖被调用函数的不可达分支。
    - `connectors/exa/connector.ts:26-31` `status_for_cost` 删除了原 `if (limit <= 0) return "unknown"` 死代码，仅保留 critical/warning/normal 三支（入参 `limit` 由调用点保证 `>0`）。
    - `connectors/exa/manifest.json:22-29` `LIMIT` 参数不再有 `default` 字段，使「LIMIT 缺失」真正发生（避免运行时 `refresh-service` 注入默认值）。
    - 选择 AC（「缺失→unknown」）而非 spec 范围描述 line 12「默认如 100」，遵循 AC 优先原则，合理。
    - 测试覆盖：`exa_connector.test.ts:193-229` 覆盖 missing/`0`/`-5`/`abc` 四种情形，断言 `status==="unknown" && limit===null`。

### 本轮新发现

无。

### 本轮扫描范围

- `connectors/exa/connector.ts`（118 行）/ `manifest.json`（43 行）：Round 1 修复点 + 全文复扫。
- `tests/integration/connector/exa_connector.test.ts`（271 行）：仅核对是否触及被测逻辑本身（mock 用法、断言强度），不评测试覆盖广度。
- 非 exa 改动（`src/renderer/lib/common-services.ts`、`provider-usage.ts`、`src/shared/schemas/plugin-output.ts`、`tests/unit/renderer/common_services.test.ts`）：仅把 `"exa"` 加入 provider 枚举与列表，与 spec 范围一致，无越界。
- `docs/tasks_index.json` / `task.md`：流程性字段更新，无代码含义。

### 复杂度与质量复核

- `main`（`connector.ts:39-116`）McCabe 近似 ≈ 15，其中 4 分支来自 for-body 表驱动类型窄化（`typeof === "string"` ternaries × 2 + `if (!is_record(item)) continue` + `for`），按「纯表驱动分发函数」排除；余 ~11 分支多为类型守卫与 null 检查，无嵌套业务逻辑，未达 important 阈值。
- DRY：`to_ms(is_record(period) ? period["start"|"end"] : undefined)` 复现 2 次（`connector.ts:60-61`），2 行且字段名不同，不构成 verbatim 重复。
- 错误处理：非对象响应 throw（`:54-55`）；HTTP 非 2xx 由 `get_json` reject 传播，测试 `exa_connector.test.ts:255-270` 验证。
- 资源/并发：单次 `await`，无 fd/连接/锁泄漏，无 race。
- 文件规模：connector.ts 118 / manifest.json 43 / test 271，均低于阈值（400/600）。
- 死代码：`void main;`（`:118`）为连接器运行时约定（见 Round 1 评审依据），非 no-op 错误。

## 结论

- 前轮 finding 复核：f001 已修，修复彻底，死代码已清除，AC 三种 unknown 触发路径（缺失/非数/≤0）均有实现与测试支撑。
- 本轮新发现：0 条。
- 总体判断：Round 1 指出的 spec AC 违反已正确修复，修复过程未引入新问题；其余维度（manifest 字段、observation 映射、period/reset_at、零用量、错误传播、文件规模、复杂度）均合规。

verdict: PASS
