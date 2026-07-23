# Task review t061（reviewer_focus: 代码）

- task：`t061_renderer_small_fixes`
- spec：`docs\tasks\t061_renderer_small_fixes\spec.md`
- diff_anchor：`cac13374793b0b2a3f0c5a5a7f69ac9e9fb7e4e3`
- target：`git diff cac13374793b0b2a3f0c5a5a7f69ac9e9fb7e4e3`
- round：1
- reviewed_at：2026-07-23 19:51 UTC+8

## Findings

无。

## AC 覆盖核对

- **AC1（pending/loading/unknown 显示「未连接」非「正常」）**：`src/renderer/components/AccountRow.tsx:39-41` 在 `auth` 分支之后、默认「正常」返回之前插入 `unknown` 分支，返回 `{ text: "未连接", color: "var(--text-3)", severity_class: "" }`。`var(--text-3)` 与 disabled 分支（`AccountRow.tsx:31`）同色，语义一致（灰/弱化）。`src/renderer/views/SettingsView.tsx:188-193` `map_status` 把 pending/loading/未匹配值统统映射为 `unknown`，再经 `AccountRow` 解析为「未连接」，链路闭合。
- **AC2（SettingsForm 保存失败显示错误）**：`src/renderer/components/SettingsForm.tsx:256-261` 在 `.then(...)` 之后 `.finally(...)` 之前补 `.catch`，捕获 `onSave` 或 `.then` 内 `await onSaveLabelMap` / `await onForcePercentChange` 的抛错；`SettingsForm.tsx:604-608` 渲染 `<span role="alert">{saveError}</span>` 显示给用户。
- **AC3（单测覆盖）**：`tests/unit/renderer/components/account_row.test.tsx:6-18` 覆盖 `status="unknown"`；`tests/unit/renderer/components/settings_form.test.tsx:106-115` 覆盖 onSave reject 路径，断言 `role="alert"` 文本。（测试层细节归 test reviewer。）

## 关键正确性检查

- **saving 重置一致性**：`.finally` 块（`SettingsForm.tsx:262-265`）在 catch 与 then 路径都会执行，`setSaving(false)` 无条件（仅受 `mounted_ref` 守卫），不会因 catch 路径而卡在「保存中」。
- **saved 状态不被误置**：`setSaved(true)` 位于 `.then` 回调末尾（`SettingsForm.tsx:249`），任何前置 `await` 抛错都会跳过本行直达 `.catch`；不会出现「已保存」与错误同时显示。
- **错误残留清除**：每次开始保存 `SettingsForm.tsx:221` 执行 `setSaveError(null)`，不会把上一次失败信息带到新一次保存。
- **mount 守卫对称**：`.then`、`.catch`、`.finally` 三处 setState 都被 `mounted_ref.current` 包裹（`SettingsForm.tsx:245, 251, 258, 263`），与现有模式一致，避免卸载后 setState 警告。
- **`.then` 为 async**：`SettingsForm.tsx:230` `.then(async () => {...})` 使内部 `await` 抛错能被外层 `.catch` 接住，链路语义正确。
- **mounted_ref 与现有代码复用**：未新增重复 ref，复用 `SettingsForm.tsx:89` 既有 `mounted_ref`。
- **unknown 分支位置**：放在 `auth` 之后，不受 `enabled` 条件干扰（`!enabled || status==="disabled"` 在 line 30 已拦截），仅对 `enabled=true && status="unknown"` 生效，与 spec「未连接账号被误标正常」场景对应。

## 代码质量

- **DRY**：无重复块；catch 处理与 CpaConnectorSettings 形似但语义不同（前者透传错误消息、后者固定「保存失败」），不构成可抽象的重复。
- **错误处理**：catch 内 `err instanceof Error ? err.message : String(err)`（`SettingsForm.tsx:257`）稳妥处理非 Error 抛值。
- **命名**：`saveError` 与现有 `saving`/`saved` 一致。
- **文件大小**：`SettingsForm.tsx` 613 行（>400 minor 阈值）。本 task 净增约 13 行，按规则形式上触发 minor。但 spec 非范围明确「不重构 SettingsForm 保存逻辑」，小修任务增 13 行属合理工作集，不构成可信问题；按「禁止凑数」原则不升级为 finding。
- **CSS class `ad-error`**：`globals.css` 未见定义。错误文本仍由 `<span role="alert">` 正常渲染（浏览器默认样式），功能不受影响；与 `CpaConnectorSettings.tsx:383` 使用 inline `style={{color:"var(--red)"}}` 的做法不一致属样式偏好差异，spec 未要求错误样式美化，不构成 finding。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：0 条。
- 总体判断：两处改动（I12 unknown 分支、I13 catch+错误显示+saving 重置）均正确实现 spec AC，状态机一致，mount 守卫对称，测试覆盖到位；无明显正确性、安全性或质量问题。

verdict: PASS
