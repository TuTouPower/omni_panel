# OmniUsage 任务清单

> 全部任务已归档至 `docs/archive/tasks_history.md`。

---

## 1. [改造计划] CPA 标签映射按服务分开

**状态**：计划已出，待实施。

**需求**：
"cpa 的标签映射设置要按照 claude codex gemini 分开。就是既可以在数据源设置 cpa 里面一起设置，也可以在账号设置里面分开设置"

即：CPA 标签映射需要支持按 AI 服务（claude/codex/gemini/...）分开配置。用户可以在数据源设置 → CPA 页面统一设，也可以在单个账号设置里分别设。

**改造概要**：

- 新增 `providerLabelMaps` 配置字段（`src/shared/types/config.ts`）
- 在 CPA 设置页每个 provider 组旁加标签映射按钮（`src/renderer/components/CpaConnectorSettings.tsx`）
- 复用现有 `LabelMapDialog`，增加 `save_target: "account" | "provider"` 区分（`src/renderer/views/SettingsView.tsx`）
- 标签合并优先级：账号级 > 服务级 > 全局级（`src/renderer/components/ProviderAccountList.tsx`）
- 涉及约 9 个文件，详见完整改造计划。

**测试覆盖**：实施时添加：

- `providerLabelMaps` 配置读写测试
- CPA 设置页标签映射按钮渲染测试
- 三级标签合并优先级测试

---

## 2. [次要] MiMo Cookie 格式自动补全

**状态**：待实施。

**文件**：`assets/plugins/mimo-usage-plugin.ts:86-88`

用户只粘贴裸 token（如 `abc123`）而非完整格式（`api-platform_serviceToken=abc123`）会导致 401。保存或请求前 normalize Cookie——不含 `=` 时自动补全为 `api-platform_serviceToken=<value>`。

---

## 3. 已完成

- [x] MIMO 登录获取不到数据（根因 #1 #2 已修复，测试已补）
- [x] 用量卡片红框（已从 ProviderCard/ProviderAccountRow 移除 critical → alert 逻辑）
