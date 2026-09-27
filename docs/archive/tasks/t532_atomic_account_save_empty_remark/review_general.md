# Task review t532（reviewer_focus: 通用）

- task：`t532_atomic_account_save_empty_remark`
- spec：`docs/tasks/t532_atomic_account_save_empty_remark/spec.md`
- diff_anchor：`1dbafa5858cee62fee3bd84949d4dc93f5e8e495`
- target：`git diff 1dbafa5858cee62fee3bd84949d4dc93f5e8e495`
- round：1
- reviewed_at：2026-09-27 12:05 UTC+8

## Findings

无（clean review）。

7 视角正交核查结果：

- **规格合规**：AC-001～AC-006 全部闭环落地；范围未偏航（未触碰爬虫/抓取/调度引擎）；清空备注持久化留空与展示层动态回退职责划分严格。
- **实现正确性**：
    - `SettingsForm.tsx:106-111, 417-423` 将备注输入框设为受控绑定并监听 `displayName` prop 变化，保证二次打开或切换账号时输入框状态与外部配置同步；
    - `SettingsForm.tsx:350` 与 `SettingsView.tsx:360-370` 在清空或纯空白输入时，解构剔除原 `displayName` 键并在 falsy 下展开空对象 `{}`，确保落盘配置彻底无 `displayName` 属性，不保留旧值、不自动回填厂商名；
    - `AccountDialog.tsx:74-82` 编辑模式下副标题当 `pluginName` 裁切后为空时，回退到 `PROVIDER_LABELS[pluginInfo.activeProviders[0]]` 或原始厂商 key，杜绝中点、空白或未定义展示；
    - `SettingsForm.tsx:218-245` 通过 `label_map_payload`、集合比对 `has_hidden_changes` 及 `has_force_percent_change` 精准收集变更，并以 `SaveAccountOptions` 打包提交。
- **安全审视**：无外部命令注入或未转义 HTML 渲染；凭证继续走独立 `saveSecrets` IPC 通道；无敏感字段明文落地或泄露。
- **契约·类型·Breaking**：`SaveAccountOptions` 与 `SettingsFormProps.onSave` 扩展参数均设为可选，向后兼容现有调用方；无 breaking change。
- **性能与资源**：原先的 2～4 次级联写盘归一为 1 次原子保存事务，避免多轮 IPC 与重入刷新抖动。
- **架构与可维护性**：
    - `SettingsView.tsx:350` 优先引用 `configRef.current`，彻底切断组件渲染闭包中的陈旧配置快照（stale closure）；
    - `SettingsView.tsx` 中向 `AccountDialog` 传递的 `onSaveLabelMap`、`onSaveHiddenLabels`、`onForcePercentChange` 独立保存回调已彻底移除，从接口和架构根源杜绝二次写盘。
- **健壮性与可观测**：保存错误阶段区分（`account_saved` 标识）保持完整，异常路径不吞错。
- **测试可信与覆盖**：
    - `settings_view_accounts.test.tsx:410-482` 补齐端到端真实交互集成测试（点击导航 -> 编辑 -> 清除输入框 -> 保存），断言 `save` 调用次数严格为 1，且落地 `displayName` 为 `undefined`；
    - `settings_form.test.tsx:11-18, 1157-1201` 修复 `SaveHandler` 声明缺失参数并断言空备注提交时派发空串且不触发子保存；
    - `settings_view.test.tsx:170-223` 依约定移除锁定旧 bug 覆盖行为的失效测试，替换为断言接口地址与标签映射在单次事务中完整保存的新用例；
    - 套件无恒真断言、无 `.skip`、无弱化断言。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：重构彻底消除了 `SettingsForm` 与 `SettingsView` 之间的离散级联写盘与陈旧闭包写回缺陷，数据层彻底留空、展示层动态回退均有真实断言保护，类型系统与单测/集成测试均健全，无未解决 blocking finding。
- 系统性 follow-up：无

### AC 复验方式

- AC-001（清空备注持久化配置无 displayName 且不填厂商名）：`re_verified`——`SettingsView.tsx:360-370` 解构排除原属性并在空串时展开 `{}`；`settings_view_accounts.test.tsx:479-481` 断言落地配置中 `target_plugin?.displayName` 为 `undefined`。
- AC-002（单次原子保存，不触发连续竞争写盘与陈旧闭包覆盖）：`re_verified`——`SettingsForm.tsx:237-245` 打包 `atomic_options` 单次提交；`SettingsView.tsx:350, 434` 基准配置取 `configRef.current` 且单次 `save_config`；`settings_view_accounts.test.tsx:473-475` 与 `settings_view.test.tsx:206-222` 断言 `save` 调用次数为 1。
- AC-003（账号列表与编辑弹窗空备注动态回退厂商名）：`re_verified`——`AccountDialog.tsx:78-82` 空值回退 `fallback_vendor_name`；`AccountRow.tsx:97-100` 空值不渲染中点和备注；`account_dialog.test.tsx:62-65` 断言 `pluginName: ""` 时渲染厂商名 "DeepSeek"。
- AC-004（已有自定义备注正常展示，未设置展示厂商名）：`re_verified`——`account_dialog.test.tsx:67-70` 验证自定义备注正常渲染；`AccountRow.tsx` 与 `provider-usage.ts:131-135` 保持既有展示优先级。
- AC-005（补齐端到端真实交互集成测试）：`re_verified`——`settings_view_accounts.test.tsx:410-482` 真实触发 UI 交互，验证 `expect(save).toHaveBeenCalledTimes(1)` 且 `target_plugin?.displayName` 为 `undefined`；测试执行绿灯。
- AC-006（补强表单单测并修复参数类型声明）：`re_verified`——`settings_form.test.tsx:11-18` 补齐 `displayName` 与 `options`；行 1157-1201 断言表单清空备注提交时派发统一负载且不触发 `onSaveHiddenLabels`；测试执行绿灯。

coverage = 6 / 6 (100%)

reviewed_scope: b55fe0318f147092

verdict: PASS
