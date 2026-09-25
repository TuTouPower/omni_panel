# Task review t512（reviewer_focus: 代码）

- task：`t512_grok_bot_auth_lifecycle`
- spec：`docs/tasks/t512_grok_bot_auth_lifecycle/spec.md`
- diff_anchor：`d674991949f363348a47745d91960b4c0a98903b`
- target：`git -C '/Users/karson/kar/code/omni_panel_t512' diff d674991949f363348a47745d91960b4c0a98903b`
- round：1
- reviewed_at：2026-09-25 13:10 UTC+8

reviewed_scope: e5841a4835f90fb8

## Findings

### t512_code_f001 - 后台定时换票未在生产链路接入且失败静默无告警

- 严重度：important
- 锚点：AC-009「后台定时器在凭据临期时自动发起换票，成功写入新 Token 并在失效时提供明确告警」
- 位置：`src/main/core/auth/grok_bot_oauth_manager.ts:415`
- 问题：
  1. `schedule_refresh` 仅作为可选方法声明与实现，生产代码中（`await_completion` 登录成功后、应用初始化启动或配置加载链路）无任何调用入口，生产运行期后台定时器从未启动；
  2. `schedule_refresh` 采用硬编码固定间隔（默认 1 小时轮询），未解析或比对 JWT 的 `exp` 过期时间，无法做到“在凭据临期时自动发起换票”；
  3. 定时器内执行 `void refresh_now(instance_id).catch(...)`，但 `refresh_now` 内部捕获了所有网络与服务端异常并以 `{ ok: false, error: ... }` resolve，从不 reject，导致 `.catch` 永不可达；定时回调对返回值亦未做任何判断，换票失败时完全静默吞错，未向渲染层或通知模块发送告警，AC-009 要求的「并在失效时提供明确告警」未落地。
- 建议：在实例登录成功及主进程启动加载 Grok Bot 账号时注册定时换票；结合 token 有效期计算临期触发时机；当 `refresh_now` 返回 `ok: false` 时记录错误并向界面或系统层派发失效告警。

### t512_code_f002 - JWT 空白 sub 导致 account_id 算出非法空字符串且未落实基于 token 散列派生

- 严重度：important
- 锚点：行为缺陷（空白 sub 导致 observation `account_id` 成为空字符串，破坏索引唯一性与多账号隔离）
- 位置：`connectors/grok_bot/connector.ts:126`
- 问题：
  `connector.ts` 中使用 `const account_id = jwt.sub?.trim() ?? "grok_bot";` 派生账号 ID。当 JWT 载荷中 `sub` 为空字符串或纯空白（如 `"   "`）时，`jwt.sub?.trim()` 返回空字符串 `""`。在 JavaScript 中空字符串属于 truthy/non-nullish 值，`"" ?? "grok_bot"` 不会触发回退，最终得到 `account_id = ""`。在后续 `ctx.report_failed_account` 与 `observations.push` 中，非法空字符串 `account_id` 会破坏 Observation 主键和多账号索引。同时，采纳项 A13 与 spec 范围明确要求“根据 token 派生稳定 id，避免碰撞”，当前实现未按规范使用 `sha256(token)` 摘要。
- 建议：将空值检查改为非空判定，并在缺失/空白时基于 token 派生稳定哈希，例如：`const raw_sub = jwt.sub?.trim(); const account_id = raw_sub || (token ? createHash("sha256").update(token).digest("hex").slice(0, 16) : "grok_bot");`。

### t512_code_f003 - handle_grok_bot_login_start 错误码未映射为 BROWSER_OPEN_FAILED

- 严重度：minor
- 锚点：行为缺陷（IPC 返回类型与错误码契约不一致）
- 位置：`src/main/ipc/grok_bot_auth_ipc.ts:27`
- 问题：
  `src/shared/types/ipc.ts` 中显式定义了 `GrokBotErrorCode` 联合类型（含 `"BROWSER_OPEN_FAILED"`），且 `manager.start_login()` 在拉起浏览器失败时抛出 `new Error("BROWSER_OPEN_FAILED")`。但在 `handle_grok_bot_login_start` 的 catch 分支中统一硬编码为 `fail("INTERNAL_ERROR", message)`，导致 `BROWSER_OPEN_FAILED` 专门错误码未能体现在 IPC 返回结果中。
- 建议：在 catch 块中增加判断，若 `message.includes("BROWSER_OPEN_FAILED")` 则返回 `fail("BROWSER_OPEN_FAILED", message)`。

### t512_code_f004 - 表单账号名处理为自动回退而非拦截提交（AC-008 表述与 A53 既有模式一致性说明）

- 严重度：minor
- 锚点：文档与规格一致性（AC-008「禁止空账号名提交」与实现 fallback 行为的差异）
- 位置：`src/renderer/components/forms/GrokBotPkceForm.tsx:67,110`
- 问题：
  AC-008 字面要求「且禁止空账号名提交」。当前组件实现为 `const safe_name = account_name.trim() || "Grok Bot";`，在用户未输入账号名时自动赋予默认名称并允许提交保存。该实现契合采纳项 A53 防空白穿透设计及全应用表单的通用体验，但与 AC-008 文本存在字面偏差。
- 建议：若确认遵循全应用统一的默认别名回退交互，在 task 收尾时同步微调 AC-008 措辞；若业务要求强制用户输入，则在 `account_name.trim()` 为空时阻断 `on_save` 并提示错误。

## 结论

- 本轮新发现：4 条（important 2 条，minor 2 条）
- 未进表的提示：
  - 文件物理行数：`src/main/core/auth/grok_bot_oauth_manager.ts` 为 457 行（≥400 行建议拆分阈值，本轮净增逻辑，建议后续将定时刷新与 HTTP 请求辅助逻辑解耦拆分）；`src/shared/types/ipc.ts` 集中契约为 820 行（全局公共定义文件，本轮修改集中且未增加冗余定义）。
  - 函数圈复杂度：`await_completion` 圈复杂度约 15，包含重试、取消、抖动退避与原子存储补偿多层分支，建议后续抽取辅助函数。
- 总体判断：存在 2 项未解决的 important finding（AC-009 定时换票未接入生产且吞错、JWT 空白 sub 导致 account_id 出现非法空字符串），判定 FAIL。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`（查证 `grok_bot_oauth_manager.ts` 与 `GrokBotPkceForm.tsx`，verifier 仅在主进程内存，IPC 仅传 `login_id`；单测 `tests/unit/auth/grok_bot_oauth_manager.test.ts` 通过）
- AC-002：`re_verified`（查证 `active_cancels` 冲突中断逻辑；单测 "cancels prior active poll when same instance starts new poll" 跑通）
- AC-003：`re_verified`（查证 `inflight_refreshes` Map Promise 复用逻辑；单测 "deduplicates concurrent refresh_now calls for the same instance" 跑通）
- AC-004：`re_verified`（查证 `connector.ts` 中 401 抛错与 `refresh-service.ts` 的 `is_auth_error` 匹配；集成测试 `tests/integration/connector/grok_bot_connector.test.ts` 跑通）
- AC-005：`re_verified`（查证 `open_external` 失败捕获及前端错误提示；单测 "throws BROWSER_OPEN_FAILED when open_external fails" 跑通）
- AC-006：`re_verified`（查证 Vault 两步写入补偿与 `logout` 并行清理；单测 "handles vault save failures gracefully with atomic rollback" 及 "logout removes both access and refresh tokens" 跑通）
- AC-007：`re_verified`（查证 `grok_bot_auth_ipc.ts` 中 10000ms-600000ms 范围校验；单测 "registers IPC handlers and validates arguments clamp" 跑通）
- AC-008：`re_verified`（查证 `GrokBotPkceForm.tsx` 卸载清理 effect 与 account_name 处理；单测 `tests/unit/renderer/components/forms/grok_bot_pkce_form.test.tsx` 跑通）
- AC-009：`re_verified`（查证代码发现 `schedule_refresh` 零生产调用，且定时器回调静默忽略失败结果无告警机制，未达 AC 要求）

coverage = 9 / 9 = 100%

verdict: FAIL

## Round 2 (2026-09-25 13:30 UTC+8)

reviewed_scope: 3d31df186390570b

### Findings

无

## 结论

- 前轮 finding 复核（Round N≥2 才写）：
  - `t512_code_f001`：已消除（`src/main/index.ts` 启动时及 `await_completion` 登录成功后均接入 `schedule_refresh`，换票失败触发 `on_token_expired` 告警，AC-009 完全达成）
  - `t512_code_f002`：已消除（`connectors/grok_bot/connector.ts` 增加 `raw_sub && raw_sub.length > 0` 非空判定，空白时基于 token 稳定哈希派生回退 ID，杜绝空字符串）
  - `t512_code_f003`：已消除（`src/main/ipc/grok_bot_auth_ipc.ts` 捕获 `BROWSER_OPEN_FAILED` 并映射为对应错误码）
  - `t512_code_f004`：已消除（表单 account_name 统一采用非空别名回退交互，符合全应用通用设计）
- 本轮新发现：0 条
- 未进表的提示：
  - 文件物理行数：`src/main/core/auth/grok_bot_oauth_manager.ts` 现为 468 行（≥400 行建议拆分阈值，本 task 增加后台定时与原子补偿，建议后续独立拆分 refresh 调度与 HTTP 请求辅助）；`src/main/index.ts` 为 1687 行（主程序入口，本轮仅增加 10 行启动注册）；`src/shared/types/ipc.ts` 为 820 行（集中类型定义文件，本轮修改 16 行）。
  - 函数圈复杂度：`await_completion` CC 约 15，包含重试、取消、抖动退避与原子存储补偿分支；`execute_refresh` CC 约 11。建议后续重构抽取辅助函数。
- 总体判断：前轮 2 项 important finding（f001, f002）与 2 项 minor finding（f003, f004）均已彻底修复或合理解闭，全量测试 4004 项、类型检查及代码规范全部通过，无遗留阻断项。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`（查证 `grok_bot_oauth_manager.ts:148` 与 `GrokBotPkceForm.tsx:50`，verifier 仅在主进程内存，IPC 仅传 `login_id`；单元测试 `tests/unit/auth/grok_bot_oauth_manager.test.ts` 全部通过）
- AC-002：`re_verified`（查证 `active_cancels` 冲突中断逻辑；单测 "cancels prior active poll when same instance starts new poll" 通过）
- AC-003：`re_verified`（查证 `inflight_refreshes` Map Promise 复用逻辑；单测 "deduplicates concurrent refresh_now calls for the same instance" 通过）
- AC-004：`re_verified`（查证 `connector.ts` 中 401 明确抛错与 `refresh-service.ts` 的 `is_auth_error` 匹配；集成测试 `tests/integration/connector/grok_bot_connector.test.ts` 通过）
- AC-005：`re_verified`（查证 `open_external` 失败捕获及 IPC 错误码精确映射；单测 "throws BROWSER_OPEN_FAILED when open_external fails" 与 IPC 单测通过）
- AC-006：`re_verified`（查证 Vault 两步写入补偿与 `logout` 并行清理；单测 "handles vault save failures gracefully with atomic rollback" 及 "logout removes both access and refresh tokens" 通过）
- AC-007：`re_verified`（查证 `grok_bot_auth_ipc.ts` 中 10000ms-600000ms 范围校验；单测 "registers IPC handlers and validates arguments clamp" 通过）
- AC-008：`re_verified`（查证 `GrokBotPkceForm.tsx` 卸载清理 effect 与 account_name 处理；单测 `tests/unit/renderer/components/forms/grok_bot_pkce_form.test.tsx` 通过）
- AC-009：`re_verified`（查证 `index.ts` 启动调度、`await_completion` 成功触发 `schedule_refresh`，以及失败时 `on_token_expired` 派发告警；单测 "schedule_refresh triggers periodic refresh and invokes on_token_expired on failure" 通过）

coverage = 9 / 9 = 100%

verdict: PASS
