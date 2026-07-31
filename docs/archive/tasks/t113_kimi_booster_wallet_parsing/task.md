---
tid: "t113"
slug: "kimi_booster_wallet_parsing"
title: "Kimi connector 解析 boosterWallet/totalQuota/membership"
status: "done"
branch: "t113_kimi_booster_wallet_parsing"
worktree: ""
review_level: "full"
diff_anchor: "b9321581fa2bf6e13c994e28b898a5f5ae06f4a9"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task t113_kimi_booster_wallet_parsing

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 2026-07-26 start。diff_anchor `b932158`（t112 HEAD），分支 `t113_kimi_booster_wallet_parsing`。
- 字段结构（来自 `vendors/KimiCodeBar/macOS/KimiCodeBar/KimiCodeBarQuotaService.swift`）：`boosterWallet`/`totalQuota`/`user` 均为 `/coding/v1/usages` 响应顶层字段，非嵌套于 `usage`。所有数值字段为字符串，需 Number 解析。
- boosterWallet：`status` 仅 `STATUS_ACTIVE`/`STATUS_ENABLED`（uppercase）算启用，此时 `balance.amountLeft` 单位 1e-8 元（`315250700 = ¥3.15`）；未启用时 `amountLeft` 是误导值（月度上限−月度消费），显式返回 0。`booster_balance_yuan` helper 封装：clamp 下限 0，`amountLeft / 100_000_000`。
- totalQuota：无 `used` 字段，`used = max(0, limit - remaining)`，display_style percent。
- user.membership.level：装饰到 `account_label`（`Kimi（${level}）`），所有 observation 携带；无 level 时回退 `Kimi`。不新增只读 metric（按现有 provider 惯例，label 携带即可在面板体现会员身份）。
- display_style 取值：`ObservationDisplayStyle` 枚举仅 `percent`/`ratio`（无 `number`）。booster 余额复用 t097「ratio 无 limit 显示原值」行为（display_style ratio + limit=0），与 getoneapi/tikhub 余额 connector 一致。
- cycleDurationMs：booster/total_quota 用 30d（MONTH_CYCLE_MS）作为月周期占位；两者均无 reset_at（响应未返回）。
- 验证：`pnpm test` 1721 passed / 166 files；`pnpm typecheck` 仅 1 pre-existing 错误（`tests/unit/core/storage/write-json.test.ts:23`，t111 遗留）；改动文件 ESLint 0 错误。
- 顺带修 t112 测试遗留 TS4111（`oauth_device_form.test.tsx` secrets 的 index signature 访问改 bracket）。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 零 finding

两轴均 0 finding 时写：「Round 1 零 finding，未进处置表。」不必建表。

### Round 1 (2026-07-26 00:50 UTC+8)

| finding_id     | severity | status | rationale                                                                                                                                                 | fix_ref                                                                     |
| -------------- | -------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| t113_code_f001 | minor    | 已修   | oauth_device_form.test.tsx 的 TS4111 bracket 修复属 t112 遗留，混入 t113 违反精准修改边界；已 `git checkout HEAD --` revert，TS4111 回到 t112 待独立 task | tests/unit/renderer/components/forms/oauth_device_form.test.tsx（reverted） |
| t113_test_f001 | minor    | 已修   | 补 STATUS_ENABLED 启用分支独立用例（与 STATUS_ACTIVE 并列白名单）                                                                                         | tests/integration/connector/kimi-connector.test.ts:250-278                  |

### Round N (YYYY-MM-DD HH:MM UTC+8)

（有 finding 时用本表；每条 finding 一行。）

| finding_id     | severity                 | status | rationale | fix_ref   |
| -------------- | ------------------------ | ------ | --------- | --------- |
| t113_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t113` 查，不在此记。

### 验收标准勾选

- [x] 加油包启用时余额正确显示（元，两位小数）。
- [x] 加油包未启用时余额显示 0，不显示误导值。
- [x] 总配额与会员等级字段正确解析。
- [x] `pnpm test` 全绿。

### Reviewer verdict

- Round 1 code：FAIL（f001 minor，TS4111 混入 t112 遗留，已 revert）
- Round 1 test：FAIL（f001 minor，STATUS_ENABLED 分支未覆盖，已补）
- Round 2 code：PASS
- Round 2 test：PASS

### 遗留

- 无本 task 遗留。`oauth_device_form.test.tsx` 的 TS4111（t112 引入的 index signature dot 访问）经本 task revert后回到 t112，需独立 task 修。

### 结果摘要

- Kimi connector 解析 boosterWallet（1e-8 元换算、status 启用门 STATUS_ACTIVE/STATUS_ENABLED、未启用返 0）、totalQuota（limit-remaining 推导、percent）、user.membership.level（装饰 account_label）。
- 测试：kimi-connector.test.ts 16 用例（新增 booster 启用/未启用/STATUS_ENABLED、totalQuota percent、membership）。`pnpm test` 1722 passed / 166 files；`pnpm typecheck` 仅 pre-existing（write-json，t111 遗留）+ t112 遗留 TS4111，均非本 task 引入。
