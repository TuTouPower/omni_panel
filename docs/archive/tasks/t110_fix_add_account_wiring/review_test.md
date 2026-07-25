# Task review t110（reviewer_focus: 测试）

- task：`t110_fix_add_account_wiring`
- spec：`docs/tasks/t110_fix_add_account_wiring/spec.md`
- diff_anchor：`12fea92b6624ecdc563580667609f77df9b8e239`
- target：`git diff 12fea92b6624ecdc563580667609f77df9b8e239`
- round：1
- reviewed_at：2026-07-25 18:30 UTC+8

## Findings

### t110_test_f001 - 测试名称未随实现更新，描述已废弃的“unsupported placeholder”行为

- 严重度：minor
- 位置：`tests/unit/renderer/components/add_account_dialog.test.tsx:262`
- 问题：该测试命名为 `"disables save for unsupported cpa_mgmt placeholder"`，但当前实现已将 `cpa_mgmt` 从占位 unsupported 改为由 `CpaMgmtForm` 处理（`AddAccountDialog.tsx` 中 `form_handles_save` 包含 `cpa_mgmt`，且渲染 `<CpaMgmtForm />` 而非 `<AuthPlaceholder />`）。测试断言实际验证的是 CpaMgmtForm 在密钥未输入时禁用保存按钮，而非“不支持”的占位行为。名称与当前实现不符，会误导后续维护者认为 cpa_mgmt 仍是不支持的占位状态。
- 建议：将测试名改为 `"disables CpaMgmtForm save until management key is entered"` 或类似描述，以反映新的真实意图；若该行为已在 `cpa_mgmt_form.test.tsx` 中覆盖，也可考虑删除此处的冗余断言。

## 结论

- 前轮 finding 复核（Round 2 才写）：无
- 本轮新发现：1 条（minor）
- 总体判断：测试整体覆盖了 spec 的 AC：CPA/Exa 独立表单渲染与参数、SettingsView 精确匹配 source 与 displayName 保存、E2E 四个厂商添加流程均有所体现。仅发现一条测试名称 stale 的 minor 问题。

verdict: FAIL

## Round 2 (2026-07-25 18:37 UTC+8)

### 前轮 finding 复核

- **t110_test_f001 - 测试名称未随实现更新，描述已废弃的“unsupported placeholder”行为**
    - 状态：已修
    - 说明：`tests/unit/renderer/components/add_account_dialog.test.tsx` 中该测试已重命名为 `"disables CpaMgmtForm save until management key is entered"`，与当前实现一致，不再误导维护者认为 `cpa_mgmt` 仍是不支持的占位状态。

### 本轮新发现

#### t110_test_f002 - AddAccountDialog 单元测试未断言 `source_instance_id` 透传

- 严重度：important
- 位置：`tests/unit/renderer/components/add_account_dialog.test.tsx:94-110`（exa 双字段保存测试）
- 问题：该测试验证 Exa 保存时 `secrets`、`parameter_values`、`auth_method` 正确，但未断言 `source_instance_id` 是否被正确设置为用户所选 connector 的 `instanceId`。`source_instance_id` 是本 task 修复 CPA 误匹配 deepseek 的核心机制；`AddAccountDialog.tsx` 的 `handle_form_save` 中通过 `selected_connector.instanceId` 为其赋值。若该赋值逻辑被误删或回归，本单元测试仍会通过，而 `SettingsView` 将因缺少 `source_instance_id` 无法精确匹配源插件，导致 bug 复发。同文件的 CPA 测试 `"disables CpaMgmtForm save until management key is entered"` 也未点击保存验证该参数。
- 建议：在 exa 保存断言中追加 `expect(saved.source_instance_id).toBe("exa-1")`（或对应测试插件的 instanceId），确保 AddAccountDialog 到 SettingsView 的关键参数透传被单元测试覆盖。

### 本轮结论

- 前轮 finding 复核：f001 已修
- 本轮新发现：1 条（important）
- 其他说明：E2E 测试 `tests/e2e/electron/add_account.spec.ts` 与两个新增表单单元测试 `tests/unit/renderer/components/forms/cpa_mgmt_form.test.tsx`、`tests/unit/renderer/components/forms/exa_service_key_form.test.tsx` 当前为 untracked，未出现在 `git diff` 中；本次复核已直接阅读这些文件并纳入覆盖评估。
- 总体判断：除 f002 的关键透传参数未覆盖外，其余 AC（CPA/Exa 独立表单、displayName 保存、E2E 四个厂商流程）均有测试覆盖。

verdict: FAIL

## Round 3 (2026-07-25 22:44 UTC+8)

### 前轮 finding 复核

- **t110_test_f001 - 测试名称未随实现更新，描述已废弃的“unsupported placeholder”行为**
    - 状态：已修
    - 说明：`tests/unit/renderer/components/add_account_dialog.test.tsx:263` 处该测试已重命名为 `"disables CpaMgmtForm save until management key is entered"`，且后续补充了保存后断言，与当前实现一致。

- **t110_test_f002 - AddAccountDialog 单元测试未断言 `source_instance_id` 透传**
    - 状态：已修
    - 说明：exa 保存测试 (`tests/unit/renderer/components/add_account_dialog.test.tsx:112`) 已追加 `expect(saved.source_instance_id).toBe("exa-1")`；cpa 保存测试 (`tests/unit/renderer/components/add_account_dialog.test.tsx:298`) 已追加 `expect(saved.source_instance_id).toBe("cpa-1")`。

### 本轮新发现

#### t110_test_f003 - AddAccountDialog 非 exa/cpa 保存路径未断言 `source_instance_id` 透传

- 严重度：important
- 位置：`tests/unit/renderer/components/add_account_dialog.test.tsx`：
    - `"renders apikey form and saves API_KEY for poll connectors without auth descriptor"`（line 40-70）
    - `"renders session form and saves SESSION_COOKIE for session-source connectors"`（line 115-156）
    - `"renders OAuth device form for grok and saves after polling succeeds"`（line 158-202）
    - `"renders web login form for opencode_go and saves cookie on success"`（line 204-239）
    - `"renders local scan form and auth_method local_cli for local source"`（line 301-333）
- 问题：本 task 在 `AddAccountDialog.tsx` 的 `handle_save`（apikey / session / local_cli）与 `handle_form_save`（oauth_device / web_login / cpa_mgmt / exa）中均新增了 `source_instance_id: selected_connector.instanceId` 透传逻辑，且该参数是 `SettingsView` 精确匹配源插件的核心依据。Round 2 仅在 exa/cpa 两个表单路径补了断言，其余保存路径的测试仍然只验证 `secrets` / `auth_method` / `vendor_id`，未断言 `source_instance_id`。若 `handle_save` 或 `handle_form_save` 中的透传逻辑被误删或回归，这些路径的单元测试仍会全部通过，而 `SettingsView.onAddAccount` 因缺少 `source_instance_id` 会记录 warn 并直接返回，导致对应厂商的添加账号功能静默失败。
- 建议：在至少一条 `handle_save` 路径（如 apikey DeepSeek）和一条 `handle_form_save` 非 exa 路径（如 grok oauth_device 或 opencode_go web_login）的保存断言中追加 `expect(saved.source_instance_id).toBe("<对应 instanceId>")`，以覆盖通用透传逻辑。

### 结论

- 前轮 finding 复核：f001 已修，f002 已修。
- 本轮新发现：1 条（important）。
- 其他说明：E2E `tests/e2e/electron/add_account.spec.ts` 四个厂商流程、新增 `CpaMgmtForm` / `ExaServiceKeyForm` 单元测试、`SettingsView` CPA source 精确匹配与 `displayName` 保存测试均正常；未再发现恒真断言、`.skip`、mock 误用等危险模式。
- 总体判断：`source_instance_id` 透传的新 contract 在 `AddAccountDialog` 中除 exa/cpa 外仍未被测试覆盖，存在回归风险；其余 AC 测试覆盖充分。

verdict: FAIL

## Round 4 (2026-07-25 22:49 UTC+8)

### 前轮 finding 复核

- **t110_test_f001 - 测试名称未随实现更新，描述已废弃的“unsupported placeholder”行为**
    - 状态：已修
    - 说明：`tests/unit/renderer/components/add_account_dialog.test.tsx:263` 处测试名已改为 `"disables CpaMgmtForm save until management key is entered"`，与当前实现一致。

- **t110_test_f002 - AddAccountDialog 单元测试未断言 `source_instance_id` 透传**
    - 状态：已修
    - 说明：exa 保存测试 (`tests/unit/renderer/components/add_account_dialog.test.tsx:112`) 已追加 `expect(saved.source_instance_id).toBe("exa-1")`；cpa 保存测试 (`tests/unit/renderer/components/add_account_dialog.test.tsx:298`) 已追加 `expect(saved.source_instance_id).toBe("cpa-1")`。

- **t110_test_f003 - AddAccountDialog 非 exa/cpa 保存路径未断言 `source_instance_id` 透传**
    - 状态：已修
    - 说明：当前 diff 中所有保存路径均已追加 `source_instance_id` 断言：
        - apikey DeepSeek：`tests/unit/renderer/components/add_account_dialog.test.tsx:70`
        - session MiMo：`tests/unit/renderer/components/add_account_dialog.test.tsx:156`
        - oauth_device Grok：`tests/unit/renderer/components/add_account_dialog.test.tsx:203`
        - web_login OpenCode Go：`tests/unit/renderer/components/add_account_dialog.test.tsx:240`
        - local_cli Claude：`tests/unit/renderer/components/add_account_dialog.test.tsx:333`
    - 连同 f002 已修的 exa/cpa 路径，`AddAccountDialog` 的所有保存分支均覆盖了 `source_instance_id` 透传。

### 本轮新发现

无。

### 扫描说明

- 危险模式：未再发现 `.skip` / `.only` / `eslint-disable` / `@ts-ignore` / 恒真断言 / 弱化断言 / mock 被测逻辑 等模式。
- AC 覆盖：
    - cpa 独立表单：`add_account_dialog.test.tsx` + `cpa_mgmt_form.test.tsx` + E2E + `settings_view.test.tsx`
    - exa 双字段：`add_account_dialog.test.tsx` + `exa_service_key_form.test.tsx` + E2E
    - displayName 保存：`settings_view.test.tsx` 新测例 + E2E
    - E2E 四个厂商流程：`tests/e2e/electron/add_account.spec.ts` 已覆盖 grok / opencode_go / exa / cpa
- `source_instance_id` 透传 contract 已在所有单元测试保存路径中覆盖，回归风险已消除。

### 结论

- 前轮 finding 复核：f001 已修，f002 已修，f003 已修。
- 本轮新发现：0 条。
- 总体判断：测试可信、AC 覆盖完整，无新增问题。

verdict: PASS
