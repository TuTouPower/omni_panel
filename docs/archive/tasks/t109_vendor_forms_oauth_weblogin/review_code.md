# Task review t109（reviewer_focus: 代码）

- task：`t109_vendor_forms_oauth_weblogin`
- spec：`docs\tasks\t109_vendor_forms_oauth_weblogin/spec.md`
- diff_anchor：`e55da266a006e3bb04f389148be7eb44ed509ebb`
- target：`git diff e55da266a006e3bb04f389148be7eb44ed509ebb`
- round: 3
- reviewed_at：2026-07-25 17:18 UTC+8

## Findings

### t109_code_f001 - OAuthDeviceForm 与 GrokLoginSection 设备码逻辑 verbatim 重复，未按 spec 复用

- 严重度：important
- 位置：`src/renderer/components/forms/OAuthDeviceForm.tsx:41-85`、`src/renderer/components/forms/OAuthDeviceForm.tsx:107-143`、`src/renderer/components/GrokLoginSection.tsx:43-80`、`src/renderer/components/GrokLoginSection.tsx:125-166`
- 问题：spec 背景明确要求「复用 GrokLoginSection 的设备码逻辑（`login_start` / `login_poll`）」，但实现选择把相同业务逻辑复制到 `OAuthDeviceForm`。`handle_start` 与 `GrokLoginSection.handle_login` 在能力检查、phase 状态机、`login_start` → 计算 `expires_at` → `login_poll` → `result.saved` 分支、错误处理等流程上几乎逐行一致；设备码展示 JSX 也重复了 `a` 标签、`user_code`、等待提示等结构。后续任何设备码流程改动需要改两处，违背 DRY。
- 建议：把设备码登录流程抽成独立 hook（如 `useGrokDeviceLogin`）或底层工具函数，让 `OAuthDeviceForm` 与 `GrokLoginSection` 共用同一实现。

### t109_code_f002 - OAuthDeviceForm 保存时 secrets 为空，与 spec「保存 OAUTH_TOKEN 到 secrets」不符

- 严重度：important
- 位置：`src/renderer/components/forms/OAuthDeviceForm.tsx:69-75`
- 问题：spec 范围/背景写明添加账号场景「轮询成功后自动保存 `OAUTH_TOKEN` 到 secrets」。但 `OAuthDeviceForm` 在轮询成功后调用 `on_save` 时传入 `secrets: {}`，没有把 `OAUTH_TOKEN` 放入 secrets。虽然 `task.md` 声称 token 由主进程 Grok OAuth manager 按 `instance_id` 持有，但实现者自述不能作为 spec 偏离的降级依据；代码实际未履行 spec 写明的保存契约。
- 建议：若设计改为由主进程持有 token，应修订 spec 的 AC/背景与 secrets 契约，并在代码注释中说明；否则应在 `on_save` 的 `secrets` 中传入 `OAUTH_TOKEN`。

### t109_code_f003 - on_save 失败时 OAuthDeviceForm/WebLoginForm 未处理错误，UI 状态与保存结果不一致

- 严重度：important
- 位置：`src/renderer/components/forms/OAuthDeviceForm.tsx:67-75`、`src/renderer/components/forms/WebLoginForm.tsx:39-45`、`src/renderer/components/AddAccountDialog.tsx:479-485`
- 问题：
    - `OAuthDeviceForm` 在 `result.saved` 为 true 时先 `set_phase("success")` 再 `await on_save(...)`；若 `on_save` 抛错，phase 停留在 `"success"`，但账号实际未保存。
    - `WebLoginForm` 的 `await on_save(...)` 位于 `try` 块之外；`on_save` 抛错不会进入 `catch`，`finally` 只把 `logging_in` 置 false，错误信息不会显示。
    - `AddAccountDialog.handle_form_save` 也未捕获 `on_save` 错误，而 `oauth_device`/`web_login` 方法隐藏了 footer，导致保存失败时没有任何错误展示路径。
- 建议：在表单或 `handle_form_save` 中捕获 `on_save` 异常，把错误回显到对应表单的 `error` 状态；或在成功保存后再切换 `success` phase。

### t109_code_f004 - OAuthDeviceForm 未在组件卸载时终止 login_poll 轮询

- 严重度：important
- 位置：`src/renderer/components/forms/OAuthDeviceForm.tsx:60-65`
- 问题：点击「开始登录」后，main 进程的 `grok_api.login_poll` 会按 `interval` 轮询到 `expires_at`。组件卸载（如用户关闭添加账号弹窗）时，没有任何取消信号传回 main 进程；`mounted_ref` 只能阻止 renderer 状态更新，无法停止后台轮询。默认 `expires_in=1800s`，意味着用户关闭弹窗后 main 进程可能继续轮询半小时。
- 建议：为 `login_poll` 提供可取消机制（如 `AbortSignal` / 专用 cancel 通道），并在 `useEffect` cleanup 中调用；或把轮询生命周期与弹窗打开状态绑定。

### t109_code_f005 - AddAccountDialog 文件持续膨胀

- 严重度：minor
- 位置：`src/renderer/components/AddAccountDialog.tsx`
- 问题：该文件当前 609 物理行，已超过「实现源码 ≥400 行建议拆分」阈值，且本 task 又净增约 52 行。diff/说明中未给出必须单文件的硬约束（如协议/工具限制）。随着 auth 方法增多，Footer 条件、子表单路由、refs、helpers 都堆在一个文件里，职责持续扩张。
- 建议：把 `VendorPicker`、`ApiKeyForm`、`SessionForm`、`LocalScanForm`、`AuthPlaceholder` 拆入独立文件，或至少把 `AddAccountDialog` 的路由/状态机抽成更小的协调层。

## 结论

- 前轮 finding 复核（Round 2 才写）：无
- 本轮新发现：5 条（important 4 条，minor 1 条）
- 总体判断：实现覆盖了 AC 的主要渲染/路由行为，`pnpm test` 与 `pnpm typecheck` 均通过，但存在 spec 偏离（DRY 复用要求、`OAUTH_TOKEN` secrets 契约）、保存失败状态不一致和轮询未取消等资源/正确性问题。

verdict: FAIL

## Round 2 (2026-07-25 17:01 UTC+8)

### 前轮 finding 复核

- f001：已修。`OAuthDeviceForm` 与 `GrokLoginSection` 均使用 `use_grok_device_login`（`src/renderer/hooks/use_grok_device_login.ts:20`、`src/renderer/components/forms/OAuthDeviceForm.tsx:24`、`src/renderer/components/GrokLoginSection.tsx:11`），设备码状态机重复逻辑已抽离。
- f002：已修。`OAuthDeviceForm` 在轮询成功后把 `result.token` 按 `secret_name` 写入 `secrets`（`src/renderer/components/forms/OAuthDeviceForm.tsx:35`）；`grok_oauth_manager` 的 `OAuthLoginResult` 新增 `token` 并在成功时返回（`src/main/core/auth/grok_oauth_manager.ts:341`）。
- f003：已修。`OAuthDeviceForm.handle_start` 捕获 `on_save` 异常并回显错误（`src/renderer/components/forms/OAuthDeviceForm.tsx:37-39`）；`WebLoginForm.handle_login` 把 `on_save` 包入内层 try/catch（`src/renderer/components/forms/WebLoginForm.tsx:39-49`）。
- f004：已修。`use_grok_device_login` 在组件卸载 cleanup 中调用 `login_cancel`（`src/renderer/hooks/use_grok_device_login.ts:31-35`）；`grok_oauth_manager` 新增 `active_login_cancels` 与 `cancel_device_login`（`src/main/core/auth/grok_oauth_manager.ts:211`、`src/main/core/auth/grok_oauth_manager.ts:376-381`）。
- f005：已修。`AddAccountDialog` 拆分出 `VendorPicker`/`ApiKeyForm`/`SessionForm`/`LocalScanForm`/`AuthPlaceholder`（`src/renderer/components/add_account/`），主文件降至 308 行。

### 本轮新发现

### t109_code_f006 - `use_grok_device_login.start` 未防止并发调用，重复点击可启动多条轮询

- 严重度：important
- 位置：`src/renderer/hooks/use_grok_device_login.ts:47-91`
- 问题：`start` 函数入口未检查 `active_ref.current`，用户快速双击「开始登录」/「重新登录」时会并发发起多次 `login_start` 与 `login_poll`。同一 `instance_id` 下的多条 `await_completion` 会相互覆盖 `active_login_cancels` 中的 cancel 句柄，导致先启动的轮询无法被取消；UI 也可能因后返回的结果覆盖而显示错误状态。
- 建议：在 `start` 入口增加 `if (active_ref.current) return null;`（或返回已有 promise），确保同一实例一次只有一条设备码流程在运行。

### t109_code_f007 - 切换 vendor 时表单状态未重置，残留上一服务的错误/登录中状态

- 严重度：important
- 位置：`src/renderer/hooks/use_grok_device_login.ts:27-38`、`src/renderer/components/forms/WebLoginForm.tsx:23-55`
- 问题：`AddAccountDialog` 允许用户返回重新选择服务（`handle_select_vendor` 只重置 `account_name`，不强制表单卸载）。当用户从 A 服务的错误/登录中状态切到 B 服务时：
    - `OAuthDeviceForm` 的 `instance_id` 改变会触发 `use_grok_device_login` 的 effect cleanup（仅调用 `login_cancel`），但不会重置 `phase`/`device_code`/`error`，导致 B 服务直接显示 A 服务的错误。
    - `WebLoginForm` 的 `error`/`logging_in` 是内部 useState，切换 `provider` 时不会重置，同样会残留旧状态。
- 建议：在 `AddAccountDialog` 渲染 `OAuthDeviceForm`/`WebLoginForm` 时加 `key={vendor_id}` 强制卸载重挂；或在 hook/表单内监听 `instance_id`/`provider` 变化并主动 reset。

## 结论

- 前轮 finding 复核：5 条全部已修。
- 本轮新发现：2 条（important 2 条）。
- 总体判断：Round 1 的关键问题均已修复，AC 覆盖与代码结构符合 spec，但并发控制和跨 vendor 状态残留仍是影响正确性的重要问题。

verdict: FAIL

## Round 3 (2026-07-25 17:18 UTC+8)

### 前轮 finding 复核

- f001：已修。`OAuthDeviceForm` 与 `GrokLoginSection` 共用 `use_grok_device_login`（`src/renderer/hooks/use_grok_device_login.ts:1`、`src/renderer/components/forms/OAuthDeviceForm.tsx:24`、`src/renderer/components/GrokLoginSection.tsx:11`），设备码状态机未再重复。
- f002：已修。`OAuthDeviceForm` 在轮询成功后把 `result.token` 按 `secret_name` 写入 `secrets`（`src/renderer/components/forms/OAuthDeviceForm.tsx:35`）。
- f003：已修。`OAuthDeviceForm.handle_start` 在 `on_save` 抛错时调用 `set_phase_error` 回显错误（`src/renderer/components/forms/OAuthDeviceForm.tsx:37-39`）；`WebLoginForm.handle_login` 把 `on_save` 包入内层 try/catch（`src/renderer/components/forms/WebLoginForm.tsx:39-49`）。
- f004：已修。`use_grok_device_login` 在组件卸载 cleanup 中检查 `active_ref.current` 并调用 `login_cancel`（`src/renderer/hooks/use_grok_device_login.ts:31-37`）；`grok_oauth_manager` 维护 `active_login_cancels` 与 `cancel_device_login`（`src/main/core/auth/grok_oauth_manager.ts:210`、`src/main/core/auth/grok_oauth_manager.ts:376-381`）。
- f005：已修。`AddAccountDialog` 拆出 `VendorPicker`/`ApiKeyForm`/`SessionForm`/`LocalScanForm`/`AuthPlaceholder`（`src/renderer/components/add_account/`），主文件当前 310 行。
- f006：已修。`use_grok_device_login.start` 入口增加 `if (active_ref.current) return null;`（`src/renderer/hooks/use_grok_device_login.ts:59-62`），防止并发启动多条轮询。
- f007：已修。`AddAccountDialog` 渲染 `OAuthDeviceForm`/`WebLoginForm` 时加 `key={vendor_id}`（`src/renderer/components/AddAccountDialog.tsx:249`、`src/renderer/components/AddAccountDialog.tsx:263`），切换服务即卸载重挂，表单状态重置。

### 本轮新发现

无。

### 验证

- `pnpm test` 相关测试通过：`tests/unit/renderer/components/forms/oauth_device_form.test.tsx`、`web_login_form.test.tsx`、`add_account_dialog.test.tsx`、`grok-login-section.test.tsx`、`tests/unit/auth/grok_oauth_manager.test.ts`、`tests/unit/ipc/grok_auth_ipc.test.ts`、`tests/unit/preload/route_api.test.ts`（85 条测试全绿）。
- `pnpm typecheck` 通过。

## 结论

- 前轮 finding 复核：7 条全部已修。
- 本轮新发现：0 条。
- 总体判断：t109 全部代码 finding 已修复，AC 覆盖、代码结构、并发控制、状态隔离均符合 spec 与质量要求。

verdict: PASS
