# Task review t118（reviewer_focus: 代码）

- task：`t118_extract_shared_oauth`
- spec：`docs\tasks\t118_extract_shared_oauth/spec.md`
- diff_anchor：`897f96726b9445aab02515ac9446527911cdf70c`
- target：`git diff 897f96726b9445aab02515ac9446527911cdf70c`
- round：1
- reviewed_at：2026-07-26 03:49 UTC+8

## Findings

### t118_code_f001 - `get_api` 双重类型断言绕过 preload 联合类型保护

- 严重度：important
- 位置：`src/renderer/hooks/use-device-login.ts:57-64, 83, 113`
- 问题：`get_api` 用 `(window.usageboard as unknown as Record<string, DeviceLoginApi>)[namespace]` 把 `window.usageboard.grok: GrokReadonlyApi | GrokSettingsApi`（`src/shared/types/ipc.ts:408`）双重断言为本地定义的 `DeviceLoginApi`，丧失两层编译期校验：
    1. **key 存在性**：原代码 `window.usageboard.grok` 由编译器校验 key 存在；`Record<string, DeviceLoginApi>[namespace]` 任意 string key 都合法，最后用 `api!`（`use-device-login.ts:63`）掩盖潜在 undefined。
    2. **返回类型同步**：`DeviceLoginApi.login_poll` 声明返回 `{ saved; token?; refresh_token?; expires_at? }`（`use-device-login.ts:41-46`），但 preload `GrokSettingsApi.login_poll` 实际返回 `{ saved; token? }`（`ipc.ts:290-295`，**不含 refresh_token/expires_at**）。两份契约漂移不会被编译器捕获：未来若 preload 改 `GrokSettingsApi.login_poll` 返回类型（如 token 改名、saved 改形），共享 `DeviceLoginApi` 不会同步，hook 内 `result.saved`/`result.token` 静默读到 undefined，运行时崩溃而编译期无警告。
- 原代码：直接访问 `window.usageboard.grok`，编译器强制走 preload 联合类型，`if ("login_start" in grok_api)` 窄化后才允许调 `login_start`，类型与运行时一致。
- 建议（最小修复方向）：让 preload `src/shared/types/ipc.ts` 导出 `DeviceLoginApi`（统一 grok/kimi 设备登录契约），或让本地接口用 `Pick<GrokSettingsApi, "login_start" | "login_poll" | "login_cancel">` 派生，使两份契约编译期绑定；`get_api` 改为 `namespace: "grok" | "kimi"` 后用 `namespace === "grok" ? window.usageboard.grok : window.usageboard.kimi` 保类型窄化，而非 `Record<string, ...>` 索引。

### t118_code_f002 - spec AC「共享 helper 不再逐字重复」未落地（manager helper 未提取）

- 严重度：important
- 位置：`src/main/core/auth/grok_oauth_manager.ts`（587 行）、`src/main/core/auth/kimi_oauth_manager.ts`（583 行）；spec 第 12-16 行、AC 第 29 行
- 问题：spec 范围明确写「提取共享模块… `src/main/core/auth/oauth-device-code.ts`（或类似）：共享接口 + helper（`HttpPost`/`DeviceCodeStart`/`OAuthLoginResult`/`LoginStatus`/`RefreshResult`、token vault helpers、form 编码、error 分类、default http_post、auto-refresh 调度引擎）参数化为接收 config」，验收标准第 29 行写「共享 helper 不再逐字重复（重复行显著下降）」。实际 diff 未新建 `oauth-device-code.ts`（Grep `**/oauth-device-code*` 0 命中），两份 manager 仍各 583/587 行，低层 helper（`HttpPost`/`is_token_response`/`is_error_response`/`form_encode`/`to_error`/`load_tokens`/`store_tokens`/`clear_tokens`/`is_terminal_grant_error`/`make_default_http_post`/`compute_expires_at` 等 ~150 行）仍逐字重复。
- implementer `task.md` 过程记录标「f004 遗留 + 建议 spike」，属 claim；按 spec 实现层验收，该 AC 未满足。
- 不可信点：manager 重构本身风险论证（grok 三层并发控制 + 字节级不等价）合理，但当前状态既未开 spike、未改 spec 排除 manager helper、也未在 `docs/specs_index.md` / `docs/specs/<slug>.md` 同步范围调整。AC 标 `[x]` 前必须二选一：开 spike 决边界 / 改 spec 把 manager helper 移出本 task 范围。
- 建议：按 task.md 过程记录的 spike 建议落到 `docs/spikes/`（spec 第 14 行已预留「按 review f003/f004 建议与最小抽象原则」），并把 spec AC 第 29 行拆为「hook 去重（已达成）」+「manager helper 去重（移入 spike）」两条，或在加轮内完成 manager 重构。

### t118_code_f003 - `DeviceLoginApi` 重复 preload 全量契约且包含 hook 未用方法

- 严重度：minor
- 位置：`src/renderer/hooks/use-device-login.ts:32-55`
- 问题：`DeviceLoginApi` 在 hook 文件内本地定义了 `login_start`/`login_poll`/`login_cancel`/`login_status`/`logout`/`refresh` 六方法，其中 hook 实际只调用 `login_start`/`login_poll`/`login_cancel`（见 `use-device-login.ts:83-85, 113-137`）；`login_status`/`logout`/`refresh` 在本 hook 内从不调用，是 hook 不需要的契约。该接口与 preload 的 `GrokSettingsApi`/`KimiSettingsApi`（`ipc.ts:288-316`）平行存在，叠加 f001 的双重断言后，形成两份需手动同步的契约源。
- 建议：将 `DeviceLoginApi` 缩到 hook 实际依赖的最小集（`Pick<GrokSettingsApi, "login_start" | "login_poll" | "login_cancel">` 或仅声明这三个方法），未用方法从本地接口删除；或显式注释「preload 全量契约镜像，保留用于上层 wrapper 复用」。

## 结论

- 前轮 finding 复核（Round 2 才写）：N/A。
- 本轮新发现：3 条（important ×2，minor ×1）。
- 总体判断：f003 hook 提取部分字节级等价于原 grok/kimi 实现，hook 去重目标达成；但 `get_api` 双重断言放弃 preload 编译期保护（f001），且 spec 验收标准第 29 行「共享 helper 不再逐字重复」的 manager 部分未落地、AC 标记状态未与 spec 同步（f002），本 task 在修复/决策前不可信。

verdict: FAIL

## Round 2 (2026-07-26 04:05 UTC+8)

### 前轮 finding 复核

- **t118_code_f001（important，已修）**：`src/renderer/hooks/use-device-login.ts:45` 改为 `const api = window.usageboard[namespace];`，`namespace: "grok" | "kimi"`（行 40）走 preload 联合类型编译期推断，去 `as unknown as Record<string, DeviceLoginApi>` 双重断言，去 `api!` 非空断言。`"login_start" in api`（行 84）与 `"login_cancel" in api`（行 58）守卫保留 readonly/settings 窄化。残留 `result as LoginPollResult`（行 107）是单层断言；对照原 grok hook（`useGrokDeviceLogin.ts` 旧版 `const result = await grok_api.login_poll(...)` 后直接 `return result`）依赖 TS 结构子类型隐式允许，运行时行为等价，**非回归**。f001 核心问题（双重断言 + api! 掩盖 undefined）真消除。
- **t118_code_f002（important，遗留）**：复核事实成立——
    - `wc -l`：`grok_oauth_manager.ts` 587 行、`kimi_oauth_manager.ts` 583 行，未新建 `oauth-device-code.ts`。
    - `Grep` 命中：`is_token_response`/`is_error_response`/`form_encode`/`to_error`/`make_default_http_post`/`is_terminal_grant_error`/`compute_expires_at` 在两份 manager 各有一份逐字重复定义（grok 109/115/121/125/129/192 行；kimi 123/129/135/139/143/207/235 行）。
    - spec AC 第 29 行「共享 helper 不再逐字重复」未落地，task.md 处置表标 `遗留` + 建议 spike，但 `docs/spikes/` 未建对应 spike 目录，spec/`specs_index.md` 也未把 manager helper 移出范围。
    - implementer 风险论证（grok 三层并发 mutation/generation/in-flight + 字节级不等价 load_tokens/logout/stop_auto_refresh，30+ 测试做回归网但字节级时序难全覆盖）合理，遗留决策本身可接受；但遗留必须走 blocked 流程（`scripts/task.py block t118 --reason review`），当前 `tasks_index.json` 仍 `status: active`，流程违规。
- **t118_code_f003（minor，已修）**：手写 `DeviceLoginApi` 六方法接口已删除；本地仅保留 `LoginPollResult`（行 32-37）描述 `login_poll` 返回结构，未用方法 `login_status`/`logout`/`refresh` 不再声明；readonly 路由由 `"login_start" in api` / `"login_cancel" in api` in 守卫过滤。契约面缩到 hook 实际依赖最小集，f003 真修。

### 本轮新发现

无。`use-device-login.ts`/`useGrokDeviceLogin.ts`/`useKimiDeviceLogin.ts` 三个文件未发现新问题；`as LoginPollResult` 单层断言对应原代码结构子类型隐式允许，非本 task 引入。

### 总体判断

f001/f003 真修；f002 遗留事实成立、风险论证合理，但未按流程进 blocked（`tasks_index.json` 仍 `active`），且 spec/`specs_index.md` 未同步范围调整。

verdict: FAIL
