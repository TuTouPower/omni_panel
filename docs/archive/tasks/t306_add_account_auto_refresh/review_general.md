# Task review t306（reviewer_focus: 通用）

- task：`t306_add_account_auto_refresh`
- spec：`docs/tasks/t306_add_account_auto_refresh/spec.md`
- diff_anchor：`244419d4e0914d21549873e6a24658bd27edf6ed`
- target：`git diff 244419d4e0914d21549873e6a24658bd27edf6ed`
- round：1
- reviewed_at：2026-08-11 16:10 UTC+8

## Findings

### t306_gen_f001 - 既有测试行被意外合并 + 文件末尾丢换行

- 严重度：minor
- 锚点：风格/格式；非 AC。同时违反「精准修改」——改动与任务无关的既有代码
- 位置：`tests/unit/renderer/views/settings_view_accounts.test.tsx:241`、`:383`
- 问题：diff 将既有测试 `it("duplicates CPA source by exact manifest id and saves displayName", async () => {` 与下一行 `current_config = {` 合并为同一行；文件末尾 `});` 后丢失换行符（`\ No newline at end of file`）。两处均为本 task diff 新增的格式退化（锚点版本 `git show 244419d4...` 中这两处正常），与任务内容无关，属编辑误伤。`pnpm exec prettier --check tests/unit/renderer/views/settings_view_accounts.test.tsx` 对该文件报格式问题（注：该文件在锚点版本即因 4 空格缩进整体不合 prettier，为 pre-existing；行合并与末尾换行是新增退化，但未新增 CI 失败面）。
- 建议：恢复 `it(...)` 与 `current_config = {` 分行，补文件末尾换行。

### t306_gen_f002 - 普通新建路径未补 connector.refresh 集成断言（测试策略未完全落实）

- 严重度：minor
- 锚点：spec 上下文区「测试策略」声明「补集成断言 connector refresh 被调用」；AC-003 已满足，不 blocking
- 位置：`tests/unit/renderer/hooks/use_connector_catalog.test.ts:70-79`
- 问题：测试策略写明普通新建要「补集成断言 connector refresh 被调用」，实际改动仅将既有断言第 7 参 `false`→`true`（断言 `savePluginSettings` 收到 `refresh_after_save=true`）。刷新执行链（`savePluginSettings` 内 `refresh_after_save=true` → `trigger_background_refresh` → `connector.refresh`）由编辑路径既有测试覆盖（`tests/unit/renderer/views/settings_view.test.tsx:125`「does not await connector.refresh during save」），功能完整；但 SettingsView 级「新建保存后 connector.refresh 被调用」的集成断言未补，与已批准测试策略不符。
- 建议：在 `settings_view_accounts.test.tsx` 补一条「添加账号保存后 `connector.refresh(新 instanceId)` 被调用」断言；或认为参数断言已足够，在 task.md 处置表记录理由。

## 结论

### AC 复验方式

- AC-001（普通添加保存成功后自动触发该账号用量采集）：`re_verified`。`src/renderer/hooks/use_connector_catalog.ts:67` 第 7 参 `refresh_after_save` 改 `true`，与编辑路径（`SettingsView.tsx:345` 默认 `true`）一致；`SettingsView.tsx:370-372` 在 `refresh_after_save=true` 时 `trigger_background_refresh(instanceId)`。单测 `use_connector_catalog.test.ts:77` 断言第 7 参 `true`，实测通过。
- AC-002（复制账号成功后自动触发新实例用量采集）：`re_verified`。`SettingsView.tsx:584-588` `onDuplicate` 取 `duplicate` 返回值 `result.instanceId` 后调 `trigger_background_refresh`；`duplicate` 返回类型 `{ instanceId }`（`use-config.ts:16`、`ipc.ts:547`）与 mock（`settings_view_test_utils.ts:6-10` 返回 `deepseek-2`）一致。新测试 `settings_view_accounts.test.tsx:364-382` 断言 `connector.refresh("deepseek-2")`，实测通过。
- AC-003（相关测试全绿）：`re_verified`。实跑 `pnpm vitest run tests/unit/renderer/hooks/use_connector_catalog.test.ts tests/unit/renderer/views/settings_view_accounts.test.tsx`，18/18 通过；新建路径刷新断言（第 7 参 `true`）与复制路径刷新断言（`refresh_spy`）均在。

coverage = 3 / 3

### 其他

- 前轮 finding 复核（Round 1）：无
- 本轮新发现：2 条（均 minor）
- 未进表的提示：无
- 总体判断：两条修复路径实现正确且与编辑保存行为一致，测试断言触达可观察行为（`refresh` 实调、参数精确断言），AC-001/002/003 均有真实断言且实测全绿；仅 2 条 minor（格式误伤、测试策略局部未落实），不阻断。
- 系统性 follow-up：无

reviewed_scope: 5acc5f6345cbfcc6
verdict: PASS

## Round 2 (2026-08-11 16:10 UTC+8)

- round：2
- reviewed_at：2026-08-11 16:18 UTC+8

### 前轮 finding 复核

- t306_gen_f001（既有测试行误合并 + 文件末尾丢换行）：**已修**。以 diff 与当前文件为准：`tests/unit/renderer/views/settings_view_accounts.test.tsx:241-242` 已恢复 `it("duplicates CPA source by exact manifest id and saves displayName", async () => {` 与 `current_config = {` 分行，与锚点版本 `git show 244419d4...:tests/unit/renderer/views/settings_view_accounts.test.tsx:241-242` 逐字一致，diff 中该合并 hunk 已消失；文件末尾经 `od -c` 确认以 `\n` 结尾，`git diff 244419d4... --check` 无 whitespace 错误。行合并与丢换行两项均消除。
- t306_gen_f002（普通新建路径未补 connector.refresh 集成断言）：**已修**。新增用例 `settings_view_accounts.test.tsx:312-333`「t306: new account save triggers background refresh for the created instance」：render 前以 `refresh_spy` 替换 `window.usageboard.connector.refresh`，走真实 UI 链（点「添加」→ 选 CPA Manager → 输密钥 → 点「添加账号」提交），`vi.waitFor` 断言 `refresh_spy` 以 `"deepseek-2"`（mock `createInstance` 返回的新 instanceId）被调用。执行链 `onAddAccount` → `create_instance_and_save` → `savePluginSettings(..., refresh_after_save=true)`（`use_connector_catalog.ts:67`）→ `trigger_background_refresh` → `connector.refresh("deepseek-2")`（`settings-view/lib.ts:63-72`）全部为真实生产代码，非 mock 被测逻辑；`base_config` 无 `deepseek-2` 实例，无其它 effect 会以该 id 触发 refresh，无伪通过路径。若 `refresh_after_save` 仍为 `false` 或刷新链断开，`refresh_spy` 永不被调，断言超时失败——测试真实守卫 AC-001。与 spec 测试策略「断言保存后刷新新 instanceId；补集成断言 connector refresh 被调用」逐条对应。

### 本轮新发现

- 0 条。修复过程未引入新问题：`git diff --check` 干净；新增用例无 `.skip` / `.only` / 恒真断言 / mock 误用；用例风格与既有测试一致（userEvent + vi.waitFor + 中文注释）；未触碰无关既有代码。

### 结论

- AC 复验方式（本轮更新）：AC-001 新增独立集成断言（`settings_view_accounts.test.tsx:312-333`，`refresh_spy` 实调 `"deepseek-2"`）；AC-002 沿用 Round 1 复制路径断言；AC-003 实跑 `pnpm vitest run tests/unit/renderer/hooks/use_connector_catalog.test.ts tests/unit/renderer/views/settings_view_accounts.test.tsx`，2 文件 19/19 通过（Round 1 为 18，+1 即 f002 新用例）。三条 AC 均 `re_verified`。coverage = 3 / 3。
- 总体判断：Round 1 两条 minor 均以 diff 与实跑核实真修，无未解决 critical / important，无新问题，PASS。
- 系统性 follow-up：无

reviewed_scope: 5acc5f6345cbfcc6
verdict: PASS
