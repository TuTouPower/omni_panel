# Task spec

## 背景

用户在设置页编辑已有账号（如 DeepSeek、OpenCode Go、Grok Bot 等），将备注清空后保存，底层配置中的 `displayName` 仍被旧厂商名写回。根因是 `SettingsForm.tsx` 在 `onSave` 成功后无条件触发 `onSaveHiddenLabels`，且 `SettingsView.tsx` 中 `onSaveHiddenLabels`（及 `onSaveLabelMap`、`onForcePercentChange`）解构引用了组件渲染闭包中的旧 `config`（而非 `configRef.current`），引发连续二次写盘竞态并由陈旧快照将刚刚清空的备注覆盖回旧值。同时，用户要求保持数据层与展示层职责分离：用户设空备注时底层数据坚决留空（不写厂商名），仅展示层在备注为空时动态回退展示厂商名。

现有测试套件之所以此前漏过此问题，是因为单测（`settings_form.test.tsx`）过度隔离 Mock（仅注入单一简单 mock 回调，完全未注入级联保存回调；类型定义甚至缺失 `displayName` 参数），且集成测试（`settings_view_accounts.test.tsx`）只测了新建账号与复制账号，完全缺乏“打开已有账号编辑弹窗 -> 清空备注 -> 点击保存 -> 验证落地配置”的真实端到端闭环断言。本次任务必须在修复生产代码的同时，补齐这两层测试防线。

## 契约区

### 范围

- 架构治理：将 `SettingsForm` 与 `SettingsView` 之间的离散级联保存重构为单一提交事务，消除表单提交后无条件触发的连续多次写盘。
- 状态闭包修复：`SettingsView` 中保存账号配置时统一基于 `configRef.current` 最新快照更新，杜绝 stale closure 覆盖。
- 数据层清空备注保证：当用户在设置页将备注清空保存时，对应插件配置中的 `displayName` 彻底移除/不设置，不向配置写回厂商名。
- 展示层动态回退：各展示位（账号列表卡片、编辑弹窗副标题、用量面板卡片）当 `displayName` 未设置或为空时动态回退展示厂商名。
- 测试防线补强与坏味道整改：
    - `tests/unit/renderer/components/settings_form.test.tsx`：修正虚假类型声明（补齐缺失的 `displayName` 参数），覆盖清空备注保存时单次提交的 payload 规范性，断言消除冗余连续子保存。
    - `tests/unit/renderer/views/settings_view_accounts.test.tsx`：新增真实链路集成测试，从列表点击编辑按钮打开弹窗，清空输入框，点击保存，断言单次原子写盘且落地配置中无 `displayName`。

### 非范围

- 不改动账号认证逻辑、网络代理与抓取调度服务。
- 不修改存量配置中已有有效自定义备注的历史数据。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：在设置页编辑已有账号并将备注清空（或输入纯空白字符）后点击保存，持久化配置中对应插件的 `displayName` 字段被彻底移除或不设置，不保留旧值，也不自动填入厂商名。
- [ ] AC-002：设置页编辑账号弹窗点击保存时，表单相关配置项（含插件配置、隐藏标签、标签映射等）由单次保存完成提交，不触发连续竞争写盘与陈旧闭包覆盖。
- [ ] AC-003：在设置页账号列表与编辑弹窗中，当账号备注为空时，展示层动态回退展示厂商名，不展示空白、中点或未定义字符串。
- [ ] AC-004：在展示层（用量面板与设置页），已有自定义备注的账号依然正常展示自定义备注，未设置备注的账号展示厂商名。
- [ ] AC-005：在 `tests/unit/renderer/views/settings_view_accounts.test.tsx` 中补齐端到端真实交互集成测试，验证“已有自定义备注账号 -> 打开编辑弹窗 -> 清除备注 -> 保存”，`config.save` 接收到的最终配置中该插件无 `displayName` 且全过程仅触发一次写盘调用。
- [ ] AC-006：在 `tests/unit/renderer/components/settings_form.test.tsx` 中补强单测并修复参数类型声明，断言表单清空备注提交时所派发的统一负载中 `displayName` 规范为空（不含厂商名），且不触发无意义的子保存回调。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试。AC-001～AC-006 走 vitest/jsdom 单元与集成测试，分别覆盖 `SettingsView` 编辑保存链路、`SettingsForm` 提交逻辑、展示层组件以及两套新增测试用例自身。

## 上下文区

- 来源：`p265`（2026-09-27 核实）

### 有意不测

- 外部进程并发修改 `config.json` 触发 CONFLICT 的场景：由既有 `configStore` 冲突控制测试覆盖，不在本任务重复测试。

### 测试策略

- 集成测试（`settings_view_accounts.test.tsx`）：
    - 挂载包含已有自定义备注（如 `"工作账号"` 或 `"Grok Bot"`）的真实 `SettingsView`。
    - 模拟用户真实点击列表对应账号的“编辑”按钮打开 `AccountDialog`。
    - 获取并清空备注输入框（`display-name-input`），点击“保存”按钮。
    - 断言 `window.usageboard.config.save` 仅被调用一次，其 payload 中该插件对象彻底无 `displayName` 键。
    - 断言关闭弹窗后列表上该账号仅展示厂商名，无中点与旧备注。
- 表单测试（`settings_form.test.tsx`）：
    - 修复 `SaveHandler` 类型声明，补齐 `displayName`。
    - 验证表单提交时打包完整 payload，不重复无条件调用子保存。
- 门禁回归：
    - 运行 `pnpm test` 全量 337+ 测试文件全部通过，包括新增的 AC-005、AC-006 断言。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：若个别表单子项未正确合入统一 payload，可能导致子设置项漏保存。
- 回退：严格按照 `SettingsForm` 当前全部配置收集字段完整打平，并由单测断言全部字段的存在性。

### 依赖与约束

- 无前置依赖。

### Finalization 时更新的 blueprint

- 无。
