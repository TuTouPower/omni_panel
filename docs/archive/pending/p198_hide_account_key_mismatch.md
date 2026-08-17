# p198 SettingsView hide_account 写 accountId、消费方读 accountKey，主面板隐藏永不生效

- 现象：隐藏账号 override 写入键与消费键契约错配（写 `accountId`，读 `accountKey`）；设置侧 UI 显示"已隐藏"、主面板照常显示该账号，静默失效。
- 影响：隐藏操作持久化成功但主面板（`use_popup_derived.ts:56-58` 经 `apply_account_overrides` 过滤）仍显示该账号。
- 根因（产品缺陷）：`hide_account`（SettingsView.tsx:195）把 `item.accountId`（如 CPA 子账号 `auth-a` 或直连 `deepseek`）写入 `config.accountOverrides.hidden[provider]`；唯一消费方 `apply_account_overrides`（`src/renderer/lib/provider-usage.ts:346`）按 `account.id`（=`accountKey`，provider-usage.ts:188-193 定义：gateway 为 `sourceInstanceId|label|accountLabel`，直连为 `sourceInstanceId|accountId`）过滤；两键永不相交。settings 侧 UI 按裸 `accountId` 判定隐藏态（accounts_list.tsx:147-150），因此 UI 与主面板结果矛盾。
- 测试缺口：两侧单测各锁各的语义（tests/unit/renderer/account-overrides.test.ts:21-33 写入裸 id；tests/unit/renderer/provider-usage.test.ts:796-801 用复合 key 过滤），无端到端用例覆盖真实隐藏流程；应补「hide_account → apply_account_overrides → 主面板过滤」链路用例。
- 线索：docs/reviews/review_20260813_114911/review_intensive.md 第 14 行
- 来源：review_20260813_114911/review_intensive
- 处理：26c2a611
