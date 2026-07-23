# Task spec

## 背景

review_20260723_opus：P5 阈值未集中化；I3（`connectors/claude/connector.ts:85,104`）已用 `pct()` 算百分比却未应用 90/75 阈值，status 硬编码；I4（`connectors/firecrawl/connector.ts:77`）`status:"normal" as const` 写进 base，credits/tokens 用尽仍 normal；codex（`:122`）`limit=null` 时无法算阈值却标 normal；cpa（`:43-47`）`to_pct` 缺失误报 0%→normal。conventions（percent 90/75、ratio 0.9/0.75、余额反向）未在连接器统一实现。

## 范围

- 抽共享阈值 helper（`status_for_pct(used,limit)` / `status_for_ratio(used,limit)` / `status_for_balance(balance,limit)`），统一注入 ctx 或共享模块（与 t053 mimo 修复协同，t053 内联的 helper 本 task 抽出共享）。
- claude：应用 `status_for_pct`（5h/周窗口）。
- firecrawl：`status_for_ratio(used, limit)`。
- codex：`limit=null` → status `unknown`（不误报健康）。
- cpa：`utilization` 缺失返回 null 跳过 status（不误报 0% normal）。

## 非范围

- 不动 mimo balance（t053 负责）；不动 kimi/opencode_go cycleDurationMs（t056）。

## 验收标准

- [ ] 共享阈值 helper 抽出，单测覆盖三函数边界。
- [ ] claude/firecrawl status 按阈值（达上限 critical/warning）。
- [ ] codex limit=null → unknown。
- [ ] cpa utilization 缺失 → null（跳过 status，不标 normal）。
- [ ] 现有连接器测试全绿，无回归。

## 依赖与约束

- 与 t053（mimo C2）共享 `status_for_balance`；执行顺序 t053 先或本 task 统一抽出，二者协同不冲突。
