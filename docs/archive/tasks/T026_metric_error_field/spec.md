# Task spec

## 背景

多账号 provider 下单个账号报错，概览显示整个 provider 笼统错误（`PopupView providerErrors` 存第一个 failed connector snapshot.error 覆盖 provider），多账号 tab 也看不到具体哪个账号错。根因：`MetricRecord` 无 per-account error 字段，connector script 部分失败时 error 信息丢失。

## 范围

- `src/shared/schemas/plugin-output.ts`：`usageItemSchema` 加 `error: z.string().optional()`（MetricRecord per-account error message）；`export` usageItemSchema（单测用）。
- `src/shared/schemas/observation.ts`：不改（observation_status 保持 normal/warning/critical/unknown）。
- `src/renderer/lib/provider-usage.ts`：`build_provider_usage_groups` / overview periods 自动透传 MetricRecord.error（无需改动，MetricRecord 带 error 直接进 periods）。
- `src/renderer/views/PopupView.tsx`：新增 `accountErrors`（Map accountId → {error, provider, accountLabel}），从 `snapshot.items[].error`（MetricRecord.error）构建，传给 ProviderAccountList/ProviderCard。
- `tests/unit/metric_record_error.test.ts`（新）：MetricRecord schema parse 含 error 通过 + 无 error 向后兼容。

## 非范围

- 不改 ProviderAccountRow UI（T027）
- 不改 observation_status_schema（保持 normal/warning/critical/unknown）
- 不改 connector scripts（T028）

## 验收标准

- [ ] MetricRecord 含可选 `error` 字段（schema parse 通过）
- [ ] PopupView accountErrors 从 MetricRecord.error 构建
- [ ] ProviderAccountList 收到 accountErrors（传给 ProviderAccountRow props，T027 用）
- [ ] `pnpm test` 全绿
- [ ] `pnpm typecheck` 过

## 依赖与约束

- T027（UI）+ T028（connector script）后置；T026 只 data model + 透传
