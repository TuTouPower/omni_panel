# Task review t112（reviewer_focus: 测试）

- task：`t112_kimi_oauth_device_code`
- spec：`docs\tasks\t112_kimi_oauth_device_code\spec.md`
- diff_anchor：`994139c7257b370cb6c0f0a7f91ab1012710586d`
- target：`git diff 994139c7257b370cb6c0f0a7f91ab1012710586d`
- round：3
- reviewed_at：2026-07-26 00:50 UTC+8

## Round 1/2 finding 复核

### t112_test_f001 - OAuthDeviceForm 未测 vendor="kimi" 路径（已修，Round 2 复核延续）

- 位置：`tests/unit/renderer/components/forms/oauth_device_form.test.tsx:211-274`
- 复核：Round 2 已判已修，无回退。`userEvent.click("开始登录")` 真实触发，断言 `kimi.login_start` / `login_poll("kimi-inst-1", "kimi-dc", 5, number)` / `on_save` 收到 3 个 secret（`OAUTH_TOKEN` / `OAUTH_REFRESH_TOKEN` / `OAUTH_EXPIRES_AT`），`toEqual({...})` 严格匹配。

### t112_test_f002 - get_login_status 缺 has_token=true 且 can_refresh=false 分支用例（已修，Round 2 复核延续）

- 位置：`tests/unit/auth/kimi_oauth_manager.test.ts:312-330`
- 复核：Round 2 已判已修，无回退。仅 set `OAUTH_TOKEN` + `OAUTH_EXPIRES_AT`，断言整个 status `toEqual({ has_token: true, can_refresh: false, expires_at: String(future) })`。

### t112_test_f003 - auto-refresh 调度关键路径覆盖不足（已修）

- 位置：`tests/unit/auth/kimi_oauth_manager.test.ts:521-606`（新增 3 个用例）
- 复核：Round 2 建议 3 项最小修补全部落实，且为真实行为断言，非危险模式：
    1. **schedule_retry 退避重试**（`tests/unit/auth/kimi_oauth_manager.test.ts:521-549`）：expires_at 设为过去（`Date.now() - 1`）→ 首次 refresh 返回 `temporarily_unavailable`（非终端）→ 推进 60s 后第二次 refresh 被调度，`expect(refresh_count).toBe(2)` 验证重试真发生。成功路径也走到 `refresh_now:490` 的 `retry_failure_counts.delete`，state 清理隐性覆盖。
    2. **terminal invalid_grant 停止重试并清 token**（`tests/unit/auth/kimi_oauth_manager.test.ts:551-579`）：始终返回 `invalid_grant` → 首次 refresh 后推进 120s，`expect(refresh_count).toBe(1)` 验证无重试；`vault.get("...:OAUTH_TOKEN"/":OAUTH_REFRESH_TOKEN")` 均 `toBeNull()` 验证 token 被清。
    3. **shutdown 取消定时器**（`tests/unit/auth/kimi_oauth_manager.test.ts:581-606`）：`start_auto_refresh` 后推进 500ms（timer 未 fire），调 `shutdown()`，再推进 10s，`expect(refresh_count).toBe(count_after_shutdown)` 验证 timer 真被取消（若未取消则 count 会变 1，断言失败）。非恒真。
- 弱化检查：三例均行为级断言（计数 / vault 状态），无 `toBeDefined` / `toBeTruthy` / 存在性冒充；无 `.skip` / `@ts-ignore` / mock 自身逻辑。
- Round 2 finding 问题段提到的其余路径（reconcile add 分支、rotated token 后重新规划、stop_auto_refresh 直接调用）：
    - reconcile add：现有 `auto-refreshes at expires_at minus the refresh margin`（`tests/unit/auth/kimi_oauth_manager.test.ts:461-492`）以 `reconcile_auto_refresh(["kimi-inst-auto"])` 起步并断言 refresh 实际触发，已等价覆盖 add 分支（若循环漏写或条件反转该测试会报警）。Round 2 当初担心实可由该测试消解。
    - rotated token 后重新规划：`schedule_retry retries...` 用例成功路径走到 `refresh_now` 末尾的 `schedule_auto_refresh_if_enabled`（`kimi_oauth_manager.ts:450`），隐性覆盖。
    - `stop_auto_refresh` 直接 API：仍无专门用例，但 `reconcile_auto_refresh stops refresh for removed instances`（`tests/unit/auth/kimi_oauth_manager.test.ts:494-519`）通过 reconcile remove 间接走到 stop_auto_refresh 内部。
- 结论：Round 2 finding 列出的「建议最小集」3 项全部落实；剩余分支（`MAX_REFRESH_RETRIES > 10` give-up、stop_auto_refresh 直测）为状态管理内部边角，简化版实现（无 mutation tail / generation / in-flight coalesce）下不构成 finding。

## Findings

无。

## 结论

- 前轮 finding 复核：
    - t112_test_f001 / f002：Round 2 已判已修，本轮延续，无回退。
    - t112_test_f003：Round 2 建议的 3 个最小用例（schedule_retry 退避 / terminal 停止重试并清 token / shutdown 取消 timer）全部新增且为真实行为断言；已修。
- 本轮新发现：0 条。
- 总体判断：核心 OAuth 主路径（device-code 轮询 / token 旋转 / refresh 省略 refresh_token / invalid_grant 清 token / logout / cancel）测试可信，4 条 AC 均有行为级证据；auto-refresh 调度在简化版实现下覆盖充分（初始调度 / 成功旋转 / 非终端重试 / 终端停止 / shutdown 取消均有真实断言，reconcile add/remove 与 stop_auto_refresh 经现有用例间接覆盖）。剩余状态管理边角（`MAX_REFRESH_RETRIES` give-up 分支、stop_auto_refresh 专门用例）不构成 finding。

verdict: PASS
