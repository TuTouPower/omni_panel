# p265 设置页修改账号备注为空保存后被陈旧闭包写回旧厂商名

- 现象：在设置页编辑账号将备注修改为空后点击保存，配置中的备注（displayName）再次被写回旧厂商名。
- 影响：用户无法将已有账号备注设为空；底层配置被陈旧快照反向覆盖污染。
- 根因：
    1. `SettingsForm.tsx` 的 `perform_save` 保存账号配置 `await onSave` 后，无论 `hiddenLabels` 是否变更，均无条件调用 `await onSaveHiddenLabels`。
    2. `SettingsView.tsx:661` 的 `onSaveHiddenLabels`（及 `onSaveLabelMap`、`onForcePercentChange`）直接解构渲染闭包中的旧 `config`（而非 `configRef.current`），第二次写盘直接将第一次保存已清空备注的配置覆盖回旧值。
    3. 数据与展示层职责分离契约：数据层空备注保持留空（不写厂商名），仅展示层在备注为空时动态回退厂商名。
    - 已确认同类位点：
        - `SettingsView.tsx:661` `onSaveHiddenLabels` 闭包 `config` 引用。
        - `SettingsView.tsx:626` `onSaveLabelMap` 闭包 `config` 引用。
        - `SettingsView.tsx:688` `onForcePercentChange` 闭包 `config` 引用。
        - `SettingsForm.tsx:224` `onSaveHiddenLabels` 无变更无条件连续触发保存。
- 测试缺口：现有单测仅覆盖添加账号单次保存，未覆盖编辑账号表单保存后级联保存隐藏标签时的闭包状态一致性。应在 `tests/unit/renderer/views/settings_view_accounts.test.tsx` 补充编辑账号设空备注并级联保存隐藏标签的完整测试断言。
- 线索：`.scratch/repro_stale_config.test.ts` 模拟双次写盘；用户日志 `app-2026-09-27.log:3262-3337` 证实 10:26 分保存 GROK_BOT 与 OPENCODE_GO 时紧随两次 `Saving config`。
- 处理：t532
