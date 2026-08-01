# Task review t181（reviewer_focus: 测试）

- task：`t181_e2e_remove_conditional_skip`
- spec：`docs/tasks/t181_e2e_remove_conditional_skip/spec.md`
- diff_anchor：`ed238e9d2e3a011c784f4db1a5820097b640b83c`
- target：`git diff ed238e9d2e3a011c784f4db1a5820097b640b83c`
- round：1
- reviewed_at：2026-08-01 08:01 UTC+8

## 验证事实

- 仓库根 `D:/Dev/Code/omni_usage_t181`，HEAD == diff_anchor（工作区相对 diff）。
- `MOCK_FIXTURE=synthetic npx playwright test --project=web`（5 个受影响 spec）→ 9 passed。
- `MOCK_FIXTURE=synthetic npx playwright test --project=web`（全量）→ 48 passed, 0 failed, 0 skipped。与 task.md 自述一致，AC3「既有通过用例不受影响」成立。
- 6 处条件 skip 逐条核对（account_error_badge×2、multi_account×1、opencode_go×1、settings_provider_accounts×1、popup_card_states×1）：全部由 `test.skip` 守卫改为无条件直接断言，且 `tests/e2e/web/` 下已无任何 `.skip` / `.only` / `test.skip` 残留。

## Findings

### t181_test_f001 - 注释误标 gen_synthetic 职责；重生成会静默破坏手工 fixture 条目

- 严重度：minor
- 锚点：测试策略（AC2 的 fixture 可持续性）；非 AC 行为缺陷
- 位置：`tests/e2e/web/account_error_badge.spec.ts:7-9`、`tests/e2e/web/opencode_go_usage.spec.ts:9-10`、`tests/e2e/web/multi_account.spec.ts:34-37`
- 问题：三条注释把 fixture 内容归因到生成器，与实际不符。`scripts/e2e/gen_synthetic.mjs`（94 行）只做三件事：复制 real 前 3 个 instance 并脱敏、追加一个 enabled+failed 的 `failed_real` connector、复制全部 trend 条目——它**不**注入 `item.error`（`gen_synthetic.mjs` 全文无 `error` 写入逻辑），也**不**补 opencode_go connector。当前 `synthetic.json` 的 KIMI items `error` 字段与 opencode_go connector（2 workspace）均为手工编辑（task.md「备注」已如实声明）。注释却写「gen_synthetic 把该错误注入其 items」「synthetic fixture 由 gen_synthetic 补充 opencode_go connector」，会误导后续维护者以为 `pnpm e2e:gen-synthetic` 可持续产出这些数据。失败场景：任何人重跑 `e2e:gen-synthetic`，手工 `error` 注入与 opencode_go connector 被覆盖，`account_error_badge.spec.ts`（`.error-badge` 无数据 → 红）与 `opencode_go_usage.spec.ts`（tab 不可见 → 红）在 CI 静默失败，而注释声称生成器负责这部分数据、不会有人想到手工条目丢失。另：`multi_account.spec.ts` 的 `toHaveCount(1)` 依赖 KIMI 恰为 `failed_real`（gen_synthetic 只保证「任一 failed connector」，不保证是 kimi provider），同属再生脆弱性。
- 建议：将三处注释改为「synthetic.json 手工补充（gen_synthetic 不产出，重生成会覆盖，需另行持久化）」，或在 `docs/blueprint/testing.md` fixture 策略小节记录该手工-生成混合来源；持久化修复另立 follow-up（见结论）。

## 结论

- 前轮 finding 复核：无（Round 1）
- 改测方向复核：无「迁就实现」的改测。
    - `account_error_badge` 由「展开 overview 卡断言 badge」改为「切 Kimi tab 断言 badge」：`.error-badge` 只渲染在 ProviderAccountRow（provider tab 层，`ProviderAccountRow.tsx:144`），overview 卡走 `ProviderCardOverview`（UsageBarList），从未渲染过该 badge——原测试交互前提错误（守卫恒触发、测试恒 skip）。改写后断言链（fixture item.error → provider-usage `to_period` error → `buildAccountErrors` → row `error` prop → badge DOM）为真实生产逻辑经 UI 全链路验证，断言强度不变（visible + title 非空 + 采集失败 文案），属修正目标层而非弱化。
    - `multi_account` / `opencode_go` / `popup_card_states` / `settings_provider_accounts`：仅删守卫、断言原样或等价强化（`isVisible().catch` → `expect().toBeVisible()`，3s 探测+skip → 15s 直接断言），无一例把预期改成当前实现输出。
- 本轮新发现：1 条（minor）
- 未进表的提示：
    - `multi_account.spec.ts` 强校验（KIMI card `toHaveCount(1)`）在 synthetic 下是 1 connector → 1 card，合并语义仅 real fixture（3→1）真正触发；注释已如实说明，`toHaveCount(1)` 仍非恒真（多卡退化会红），不阻断。如需 synthetic 也真合并语义，需 fixture 含多个 kimi connector——超出本 task 范围。
    - `settings_provider_accounts.spec.ts` 的 `count() >= 1` 与前面 `first().toBeVisible()` 重复，属冗余不属错误。
    - `synthetic.json` 为全文件重写（3358 行 diff），以全量 48 passed 作为既有用例未受损的证据；结构键与原格式一致。
    - AC1/AC2/AC3 均成立：6 处 skip 逐条处置为「补 fixture 可跑」；synthetic 下受影响 9 用例全过；无遗留 silent skip（全量 0 skipped），无需 real fixture 的显式 skip 场景。
- 总体判断：6 处条件 skip 处置正确，改写的断言真实验证目标行为（无弱化、无恒真、无跳过残留），AC1/AC2/AC3 覆盖成立；仅 1 条 minor 注释/再生脆弱性，不阻断。
- 系统性 follow-up：建议 task——「gen_synthetic 持久化 KIMI items error + opencode_go connector 手工条目」（slug `e2e_gen_synthetic_persist_hand_entries`），避免 `pnpm e2e:gen-synthetic` 重生成破坏 account_error_badge / opencode_go_usage / multi_account 用例；task.md 已记录该限制，无既有 tid 对应。

verdict: PASS
