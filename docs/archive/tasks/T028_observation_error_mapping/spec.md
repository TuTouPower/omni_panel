# Task spec

## 背景

T026 MetricRecord.error 字段已加，T027 badge UI 就绪但 skip（数据无）。connector runtime 已收集 `failed_accounts`（`ctx.report_failed_account`），refresh-service 记 `last_error` 到 stale observation（L284），observation-store 存 `last_error`。但 `observation_to_metric_record`（observation-mapping.ts）不传 `last_error` → MetricRecord.error。per-account error 数据在 observation 但不到 renderer。

## 范围

- `src/main/core/scheduler/observation-mapping.ts`：`observation_to_metric_record` L48 后加 `...(obs.last_error != null && { error: obs.last_error })`（Observation.last_error → MetricRecord.error）。
- `tests/unit/observation_mapping_error.test.ts`（新）：observation_to_metric_record error 字段映射（last_error 有值 → MetricRecord.error，last_error null → 无 error）。
- `tests/e2e/web/account_error_badge.spec.ts`：移除 skip（T028 data 通，KIMI stale observation last_error 有值 → badge 可见）。

## 非范围

- connector 脚本 per-account `report_failed_account` 改进（当前已有机制，脚本改法后置 T029）
- observation-store schema 不变（已有 last_error）

## 验收标准

- [ ] observation_to_metric_record error 映射正确（单测绿）
- [ ] `pnpm test` 全绿
- [ ] `pnpm test:e2e:web` account_error_badge case pass（非 skip）
- [ ] `pnpm typecheck` 过

## 依赖与约束

- 依赖 T026 MetricRecord.error + T027 badge UI
- KIMI stale observation（synthetic/real fixture）已有 last_error（refresh-service L284 赋值）
