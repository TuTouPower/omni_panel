# Task review t159（reviewer_focus: 代码）

- task：`t159_fix_grok_oauth_binding_billing_parse`
- spec：`docs\tasks\t159_fix_grok_oauth_binding_billing_parse/spec.md`
- diff_anchor：`89bc31f9350241ad48039678bec1477691fc97bf`
- target：`git diff 89bc31f9350241ad48039678bec1477691fc97bf`
- round：1
- reviewed_at：2026-07-28 05:08 UTC+8

## Findings

### t159_code_f001 - Preload 实现文件已超行数阈值仍继续增长

- 严重度：minor
- 位置：`src/preload/index.ts:328`
- 问题：文件物理行数为 533，超过实现源码 400 行的 minor 阈值；本 task 在该文件净增 1 行，且 diff 未说明不可拆的硬约束。
- 建议：将 Grok/Kimi OAuth preload 方法或路由 API 组抽到独立模块，保留本文件负责组装和 `contextBridge` 暴露。

### t159_code_f002 - 添加账号对话框已超行数阈值仍继续增长

- 严重度：minor
- 位置：`src/renderer/components/AddAccountDialog.tsx:28`
- 问题：文件物理行数为 412，超过实现源码 400 行的 minor 阈值；本 task 在该文件净增 1 行，且 diff 未说明不可拆的硬约束。
- 建议：将账号创建参数类型及 OAuth 专用流程，或独立的认证表单选择逻辑抽出，令对话框保留编排职责。

### t159_code_f003 - IPC 共享类型文件已超行数阈值仍继续增长

- 严重度：minor
- 位置：`src/shared/types/ipc.ts:240`
- 问题：文件物理行数为 468，超过实现源码 400 行的 minor 阈值；本 task 在该文件净增 7 行，且 diff 未说明不可拆的硬约束。
- 建议：将 OAuth device-code 登录结果及相关 API 类型移入按领域划分的共享类型模块，再由 IPC 契约按需导入。

## 结论

- 前轮 finding 复核（Round 2 才写）：不适用。
- 本轮新发现：3 条。
- 总体判断：OAuth token 迁移、secret 白名单与 Grok billing 无权益分支的实现符合 spec；3 个触及实现源码文件违反本任务代码 reviewer 提示词的文件过大标准。

verdict: FAIL

## Round 2 (2026-07-28 05:37 UTC+8)

### t159_code_f004 - 临时 OAuth 凭证清理失败被吞没

- 严重度：important
- 位置：`src/renderer/hooks/use_connector_catalog.ts:83`
- 问题：正式实例的 secrets 已保存后，清理临时 instance OAuth token 的 `logout` 异常被 catch 后仅记录日志，函数仍返回成功。此路径未满足 spec「成功迁移后清理临时 instance id 下 OAuth token」的不变量。
- 建议：将临时凭证清理纳入迁移成功条件；清理失败时显式失败并采用可重试或回滚正式凭证的策略，不能把残留凭证的迁移报告为成功。

## 结论（Round 2）

- 前轮 finding 复核：`t159_code_f001` 已修（`src/preload/index.ts` 当前 469 行，但相对 anchor 净删 63 行，OAuth API 已移至 90 行独立模块）；`t159_code_f002` 已修（当前 402 行，但相对 anchor 净删 9 行，参数类型已移至独立模块）；`t159_code_f003` 已修（当前 451 行，但相对 anchor 净删 10 行，OAuth 结果类型已移至独立模块）。三者均不再满足「超阈值且本 task 净增」条件。
- 本轮新发现：1 条。
- 总体判断：前轮文件膨胀问题已修复；临时 OAuth token 删除失败仍会被当作添加账号成功，违反临时凭证清理验收标准。

verdict: FAIL

## Round 3 (2026-07-28 13:52 UTC+8)

## Findings

- 无。

## 结论

- 前轮 finding 复核：`t159_code_f001`、`t159_code_f002`、`t159_code_f003` 已修，触及文件均相对 diff anchor 净删，故不再满足文件过大 finding 条件。`t159_code_f004` 已修：`src/renderer/hooks/use_connector_catalog.ts:70-80` 对临时 OAuth namespace 的 `logout` 采用 `await` 且未捕获；preload `invoke` 会将 main-process 的 `{ ok: false }` 变为 rejection（`src/preload/index.ts:45-54`），调用方只在 `create_instance_and_save` 正常返回后切换至编辑态（`src/renderer/views/SettingsView.tsx:542-553`）。因此清理失败会回传至 `DeviceLoginSection` 的保存失败提示，不能被报告为账号添加成功。
- 本轮新发现：0 条。
- 总体判断：OAuth token 正式实例迁移、临时凭证清理失败处理、secret 白名单及 Grok billing 无权益分支符合 spec；未发现修复引入新的实现正确性问题。聚焦回归测试 4 文件、26 项通过。

verdict: PASS
