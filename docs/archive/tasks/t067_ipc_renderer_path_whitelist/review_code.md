# Task review t067（reviewer_focus: 代码）

- task：`t067_ipc_renderer_path_whitelist`
- spec：`docs\tasks\t067_ipc_renderer_path_whitelist/spec.md`
- diff_anchor：`6f0801a46a4499d0321476155168e0049491034b`
- target：`git diff 6f0801a46a4499d0321476155168e0049491034b`
- round：1
- reviewed_at：2026-07-24 01:35 UTC+8

## Findings

### t067_code_f001 - spec AC「helpers 签名改 + 全 IPC 适配」未实现，改用模块级全局可变状态

- 严重度：important
- 位置：`src/main/ipc/helpers.ts:17-29`、`src/main/index.ts:118`
- 问题：
    - spec AC（`spec.md:13`）原文：「非 rendererIndexPath 的 file:// 拒；**helpers 签名改 + 全 IPC 适配** + 测试。」实现把 `assert_valid_sender` 签名保持不变，改在 `helpers.ts` 加模块级 `let renderer_index_pathname: string | null` + `set_renderer_index_path` setter。`git diff --stat` 显示 diff 只触及 `helpers.ts`、`index.ts`、测试文件，12 个 IPC 调用点（`config-ipc.ts`、`connector-ipc.ts`、`session-ipc.ts`、…）零改动，「全 IPC 适配」未发生。
    - spec「依赖与约束」称「helpers 纯函数模块需 rendererIndexPath 注入（签名改影响全 IPC 调用）」，把 helpers 标为**纯函数模块**。引入模块级 `let` 可变状态破坏该属性，且使模块对调用顺序产生隐式依赖（`set_renderer_index_path` 必须先于任何 IPC 调用执行）。
    - `task.md` 收尾报告把原 AC 拆成 5 条自拟 checkbox 全打 [x]，但未在 spec/plan 留下「setter 方案替代签名改」的决策记录。按共享规则「task.md 是 claim 不是证据」，以 spec 原文与代码为准 → AC 子句「helpers 签名改」「全 IPC 适配」缺失实现。
    - 安全 outcome（精确比对 pathname）达成，但实现路径偏离 AC。
- 建议：两条任选其一，并在 spec/plan 记录决策：
    1. 按原 AC 把 rendererIndexPath 作为 `assert_valid_sender(event, renderer_index_path: string)` 参数注入，helpers 保持纯函数；适配 12 个调用点从 `windowManager` 或新参数源取值。
    2. 维持当前 setter 方案，但更新 spec「依赖与约束」把「纯函数模块」与「签名改」约束改写为「模块级单例 setter 注入」，明确这是有意决策而非疏漏。

### t067_code_f002 - 错误信息泄漏 rendererIndexPath 绝对路径到 renderer

- 严重度：minor
- 位置：`src/main/ipc/helpers.ts:42-44`
- 问题：拒绝分支抛 `new Error(`Invalid file:// sender path: ${u.pathname} (expected ${renderer_index_pathname})`)`。`renderer_index_pathname` 是主进程 renderer 绝对路径（如 `/D:/Users/.../app.asar/dist/renderer/index.html`）。
    - 多数 IPC handler 中 `assert_valid_sender(e)` 抛错不被 `logged` 吞掉（`logged.ts:62-65` catch 后 re-throw），或干脆在 `logged` 外（`config-ipc.ts:412` 直接 `assert_valid_sender(e)` 后才 `logged(...)`）。Electron `ipcMain.handle` 同步/异步 reject 会把 `error.message` 序列化回 renderer。
    - 后果：被 XSS 导航进 renderer 的恶意 file:// 页调用任意受保护 IPC，能从 reject message 读到合法 renderer 的绝对路径，便于后续路径预测与 asar 内文件定位。
    - 打包路径虽较可预测，但把绝对路径写进面向调用方的 message 属信息泄漏反模式，且相比 t062（只输出 `u.pathname`）是新引入的回归。
- 建议：throw message 仅含「Invalid file:// sender path」（不附 expected），`renderer_index_pathname` 仅写主进程日志（`log.warn` 脱敏后）。

### t067_code_f003 - `new URL(pathToFileURL(abs_path).href).pathname` 冗余 round-trip

- 严重度：minor
- 位置：`src/main/ipc/helpers.ts:25`
- 问题：`pathToFileURL(abs_path)` 已返回 `URL` 实例，直接 `.pathname` 即可。当前写法 `new URL(pathToFileURL(abs_path).href).pathname` 多一次 `URL → string → URL` 转换，无额外语义（WHATWG URL `href` 已规范化）。
- 建议：改为 `renderer_index_pathname = pathToFileURL(abs_path).pathname;`。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：3 条（1 important + 2 minor）。
- 总体判断：精确比对 pathname 的安全目标与同名 `index.html` 防护到位，fallback 与空 path 处理合理；但实现路径未遵守 spec AC「helpers 签名改 + 全 IPC 适配」，且引入模块级可变状态违反 spec「纯函数模块」约束，错误信息还泄漏主进程绝对路径。

verdict: FAIL

## Round 2 (2026-07-24 02:05 UTC+8)

### 前轮 finding 复核

- **t067_code_f001（important）—— 修不彻底**：
    - 技术层面：setter 方案在安全 outcome（精确比对 pathname）上与签名注入功能等价，避免 12 个 IPC 调用点 + deps 改动的工作量收益可辩护。此点裁决合理。
    - 流程层面：`task.md` Round 1 处置表将 status 标「遗留」、fix_ref 写「spec 调整 + 裁决」，但实际 `git diff 6f0801a46a4499d0321476155168e0049491034b -- docs/tasks/t067_ipc_renderer_path_whitelist/spec.md docs/specs/ docs/blueprint/` 为空 —— **spec.md 与 docs/specs/ 均未更新**。
    - spec.md AC（`spec.md:13`）仍写「helpers 签名改 + 全 IPC 适配 + 测试」（checkbox 仍 `[ ]`），「依赖与约束」仍写「helpers 纯函数模块需 rendererIndexPath 注入（签名改影响全 IPC 调用）」。模块级 `let` 可变状态破坏「纯函数模块」不变量，但 spec 未留决策记录。
    - 按共享规则「task.md 是 claim 不是证据」，以 spec/代码为准 → Round 1 建议 #2（维持 setter 但更新 spec 措辞）未执行，f001 未真正闭环。
    - 「遗留」状态语义不符：CLAUDE.md 明确「遗留」用于「本 task 解决不了；满轮 blocked 后在『遗留』与口头报告中列出」。Round 1 主动选「遗留」绕过 spec 调整，应改为按建议 #2 落地 spec 改写（或 Round 2 内补改 spec 后再收尾）。
    - 附注：`task.md` 收尾报告自填「Round 1 code：PASS」与本报告 Round 1 verdict（FAIL）矛盾，implementer 不应自行改写 reviewer verdict。
- **t067_code_f002（minor）—— 已修**：`src/main/ipc/helpers.ts:42` throw message 现为 `Invalid file:// sender path: ${u.pathname}`，不再附 expected path。绝对路径泄漏消除。验证通过。
- **t067_code_f003（minor）—— 已修**：`src/main/ipc/helpers.ts:25` 现为 `renderer_index_pathname = pathToFileURL(abs_path).pathname;`，冗余 `new URL(...href)` round-trip 已去。验证通过。

### 本轮新发现

0 条。f002/f003 修复过程未引入新代码问题；f001 不闭环属处置流程缺失而非新代码缺陷。

### 处置建议

implementer 二选一闭环 f001（无需改代码）：

1. **改 spec（推荐）**：更新 `spec.md` AC 与「依赖与约束」措辞，把「helpers 签名改 + 全 IPC 适配」「helpers 纯函数模块」改写为「主进程启动时通过 `set_renderer_index_path` 注入 rendererIndexPath，helpers 持模块级单例」；同步 `docs/specs/` 对应 spec 累积与 task.md 收尾报告（含 Round 1 verdict 还原为 FAIL）。
2. **改代码（不推荐）**：按 Round 1 建议 #1 把 rendererIndexPath 作为 `assert_valid_sender(event, renderer_index_path)` 参数注入，helpers 保持纯函数；适配 12 个 IPC 调用点。

### 总体判断

f002/f003 修复到位；f001 技术决策可辩护但 spec 调整未落地，导致 finding 未真正闭环。补改 spec（或 spec + 累积 spec）后即可 PASS。

verdict: FAIL
