# Task review t122（reviewer_focus: 代码）

- task：`t122_split_settings_view`
- spec：`docs/tasks/t122_split_settings_view/spec.md`
- diff_anchor：`847e43beeb0ce3382923526c90cd3c1e7d809599`
- target：`git diff 847e43beeb0ce3382923526c90cd3c1e7d809599`
- round：1
- reviewed_at：2026-07-26 18:20 UTC+8

## Findings

### t122_code_f001 - GeneralSection 重复计算 interval_label

- 严重度：minor
- 位置：`src/renderer/views/settings-view/sections/general_section.tsx:46-48`
- 问题：`GeneralSection` 从 `config.globalRefreshIntervalSeconds ?? 300` 重新计算 `interval_label`（`refresh_seconds_to_label(globalIntervalSeconds)`），而父级 `SettingsView` 在 line 213+234 已做完全相同的计算。虽然两者使用相同默认值和转换函数当前输出一致，但若未来 `refresh_seconds_to_label` 的映射关系或默认值变更，两处不同步会导致行为不一致。
- 建议：通过 props 传入 `interval_label`，与 `AccountsSection`、`DataSection` 等已通过 prop 接收的模式保持一致。或将 `interval_label` 计算下沉到只在需要的 section 内做一次（目前 GeneralSection 不接收该 prop，但 AccountsSection 已接收）。

### t122_code_f002 - AccountDialog 跨层导入 views 模块常量

- 严重度：minor
- 位置：`src/renderer/components/AccountDialog.tsx:8`
- 问题：`AccountDialog`（components 层）导入 `session_meta` 来自 `src/renderer/views/settings-view/lib`（views 层）。components 依赖 views 层常量形成反向依赖，不符合一般层级规则（views 可依赖 components，反之不应）。`session_meta` 是与设置视图无关的连接器会话元数据，更自然的归属是 `src/renderer/lib/` 或 `src/shared/`。
- 建议：将 `session_meta` 移至 `src/renderer/lib/` 或 `src/shared/` 下的通用模块，消除 components→views 的反向依赖。此为纯重构任务的遗留层间耦合，不影响运行时行为。

### t122_code_f003 - accounts_section.tsx 超文件大小 minor 阈值

- 严重度：minor
- 位置：`src/renderer/views/settings-view/sections/accounts_section.tsx`（436 行，新文件）
- 问题：conventions 定义实现源码文件 400 行为 minor 阈值。本 task 新建该文件即达 436 行，超过 minor 线。其中 `AccountsList` 内部组件（line 211-436）占约 225 行，承载了 CPA 数据源的详细渲染逻辑，可考虑进一步拆分。
- 建议：将 `AccountsList` 提取为独立文件（如 `accounts_list.tsx`），使 `accounts_section.tsx` 专注 AccountsSection 的顶层编排。当前未达 important 阈值（800），不阻塞。

## 结论

- 本轮新发现：3 条（均为 minor）
- **AC 覆盖**：
    - AC1（SettingsView 降至 800 行以下）：724 行，达标。
    - AC2（子组件/hook 正确 import、无重复定义）：所有 15 个抽出文件均被 SettingsView 或 section 子组件正确 import，未发现重复定义。
    - AC3（pnpm typecheck）：报错仅在 `src/scripts/update_release_notes/__tests__/old_parser.test.ts`（非本 task 改动范围，pre-existing），本 task 引入文件无类型错误，通过。
    - AC4（pnpm test 全绿）：不在 code reviewer 职责范围（test reviewer 验证），此处不判。
    - AC5（行为零变化）：逐文件比对 diff，确认全部为文件搬迁 + import 路径调整 + 必要的 props 类型导出。`create_instance_and_save` 提取后返回值变化（void → null/object）由调用方 `if (result)` 守护，manifest_id 缺失时行为与原 inline 逻辑一致。无逻辑改动。
- **不偏航**：新增 `TitleBar` 组件未在 spec 预估范围内，但从 SettingsView JSX 提取的同名元素，属于合理拆分，偏离极小。
- **不自由发挥**：未发现 spec 之外的功能添加或顺手改进。
- **文件大小**：`accounts_section.tsx` 436 行（新文件），超过 minor 阈值 400（见 f003）。其余文件均在阈值内。均未达 important 800 行阈值。
- **总体判断**：纯机械拆分执行干净，无行为变化。3 条 minor 均不影响运行时正确性，但 finding 数 > 0，按 verdict 规则判 FAIL。

verdict: FAIL

## 撤回记录

### t122_code_f001 撤回

- 撤回人：review coordinator（主 agent）
- 撤回时间：2026-07-26 18:25 UTC+8
- 理由：interval_label 重复计算在原 SettingsView.tsx 中已存在（line 213/234），拆分是机械搬迁，未引入新逻辑。
