# Task plan

## 步骤与验证

1. 红：
    - config schema 单测（`upcomingResetWatched` 结构 + 旧 `upcomingResetOff` 迁移不报错 + watched 默认空）。
    - `collect_upcoming_resets` 单测（watched 空→[]；watched+阈值→对应 period 进面板；非 watched→不进；`UpcomingResetItem.rawLabel`）。
    - metric 行 toggle 组件测（默认关、点击写 watched）。
      → 验证：失败。
2. 绿（数据层）：`config.ts`（去 `upcomingResetOff`、加 `upcomingResetWatched` + zod + 迁移）、`account-overrides.ts`（watched 读写 helper）、`provider-usage.ts`（`collect_upcoming_resets` 过滤改 watched + `UpcomingResetItem.rawLabel`）。
   → 验证：步骤 1 数据/逻辑测试通过。
3. 绿（UI）：主面板 period/metric 行 toggle icon（写 watched）+ 移除 t041 account 级 icon 按钮 + SettingsView 账号按钮清理。
   → 验证：步骤 1 组件测通过。
4. 黑盒：`pnpm test` 全量 + typecheck/lint。
   → 验证：通过。
5. 双审 + 收尾。

## 风险与回退

- 风险：period/metric 行渲染位置需定位（VendorCard / AccountRow / PopupView），raw_label 需在渲染处可用，与 `collect_upcoming_resets` 内 `period.raw_label` 一致。
- 风险：旧用户 `upcomingResetOff` 配置丢失（用户已确认废弃接受）。
- 风险：metric 行 toggle 与现有 period 行布局/交互冲突。
- 回退：revert config / account-overrides / provider-usage / UI 改动，恢复 account 级 off。

## Finalization 时更新的 blueprint

- `docs/specs/config-store.md`：`AccountOverrides` 字段（`upcomingResetOff` → `upcomingResetWatched`，默认空=全关）。
- `docs/specs/ui-views-web.md`：即将重置监控入口改主面板 metric 行 toggle，account 级 icon 移除。
- `docs/specs/upcoming-reset.md`（若有）：过滤粒度 account → metric、默认语义反转。
