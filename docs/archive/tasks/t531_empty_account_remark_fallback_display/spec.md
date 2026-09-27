# Task spec

## 背景

当前在添加账号时，如果用户未在「备注（显示用）」输入框填写任何内容，`AddAccountDialog` 会兜底使用厂商显示名（`vendor_label`，如 "DeepSeek"、"OpenAI"）作为 `account_name` 并最终持久化写入插件配置的 `displayName`。这导致底层配置的备注字段被无意义的厂商名污染，且在设置页列表等展示位置出现冗余的重复展示（例如 "DeepSeek · DeepSeek" 或无法识别该账号其实未设置个性化备注）。

用户需求要求：

1. 本地 CLI 授权扫描到邮箱时的自动预填能力继续保留。
2. 去除未填备注时的厂商名兜底写入逻辑，若未填备注则保持留空。
3. 展示层若遇到账号备注为空，动态回退显示厂商名字，保证界面显示完整友好。

## 契约区

### 范围

- 修改添加账号表单收集与保存逻辑：
    - `AddAccountDialog.tsx` 及 `src/renderer/components/forms/` 下的各类表单（`ApiKeyForm`、`SessionForm`、`GrokBotPkceForm`、`ExaServiceKeyForm`、`OAuthDeviceForm`、`CpaMgmtForm`、`WebLoginForm`）：当 `account_name` 为空或纯空白时，不再回退到厂商名/vendor_label，直接传递空字符串。
    - `use_connector_catalog.ts` / `SettingsView.tsx`：当 `params.account_name` 为空时，不向插件配置写入 `displayName`（或者将其设为 undefined / 移除）。
- 保留 `form_registry.tsx` 中本地 CLI 授权扫描到邮箱时自动为未填备注输入框预填邮箱的行为。
- 检查并完善展示层（如 `accounts_list.tsx`、`AccountRow.tsx`、`CpaCard.tsx`、`accounts_section.tsx`、`provider-usage.ts`）：当 `displayName` 为空时，展示层动态回退显示厂商名称。
- 补齐相关单测与回归测试。

### 非范围

- 不修改现有已保存的配置数据迁移（存量历史数据由用户自行维护或重命名）。
- 不改动账号名称之外的凭据、端点或定时器逻辑。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：在添加账号时（包含 API Key、Session、OAuth、WebLogin、CPA 等各类表单），若用户未输入备注（留空或纯空白），调用保存时传递的 `account_name` 为空字符串，插件配置中不包含或不设置厂商名称作为 `displayName`。
- [ ] AC-002：在添加账号时，若用户输入了自定义备注（如 "工作账号"），保存时传递并持久化该备注（trim 后）。
- [ ] AC-003：本地 CLI 授权扫描到邮箱且用户未输入备注时，继续保留自动将邮箱预填到备注输入框的能力；以预填邮箱保存时 `account_name` 记录该邮箱。
- [ ] AC-004：在展示层（设置页账号列表 `accounts_list.tsx`、`AccountRow.tsx`、`CpaCard.tsx` 等），若账号备注（`displayName`）未设置或为空，动态回退展示厂商名称（如展示厂商名 `DeepSeek`、`OpenAI`、`CPA`），不展示空白、`undefined` 或重复的厂商名（如避免出现 `DeepSeek · DeepSeek`）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试。AC-001～AC-004 走 vitest/jsdom 单元测试，分别针对 `AddAccountDialog`、各类子表单组件、`use_connector_catalog` 以及账号列表展示组件进行断言。

## 上下文区

- 来源：用户明确需求（2026-09-27 口述：自动预填邮箱保留，兜底使用厂商名称去掉，未填备注在其他地方显示时动态显示厂商名字，备注保持留空）。

### 有意不测

- 存量历史配置中已被写入 `displayName: "DeepSeek"` 的旧文件自动清洗：本 task 不做自动数据迁移，不在测试范围。

### 测试策略

- 针对 `AddAccountDialog.tsx` 及各个添加账号表单，编写/更新测试验证未填备注时保存参数 `account_name` 为 `""`。
- 针对 `use_connector_catalog.ts` / `savePluginSettings`，验证 `account_name` 为空时插件配置不包含 `displayName`。
- 针对 `AccountRow.tsx` / `VendorCard.tsx` / `CpaCard.tsx` / `accounts_list.tsx`，验证 `displayName` 为空时展示层正常显示厂商名且不出现重复。
- 保持 `form_registry.tsx` 本地 CLI 扫描预填邮箱用例通过。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：个别调用点可能依赖 `info.displayName` 非空判断来展示账号名。
- 回退：在展示层 helper 中统一收口 `displayName || vendor_name` 逻辑，确保无非空假设崩溃。

### 依赖与约束

- 无前置依赖。

### Finalization 时更新的 blueprint

- 无。
