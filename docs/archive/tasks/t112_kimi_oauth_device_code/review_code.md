# Task review t112（reviewer_focus: 代码）

- task：`t112_kimi_oauth_device_code`
- spec：`docs\tasks\t112_kimi_oauth_device_code\spec.md`
- diff_anchor：`994139c7257b370cb6c0f0a7f91ab1012710586d`
- target：`git diff 994139c7257b370cb6c0f0a7f91ab1012710586d`
- round：3
- reviewed_at：2026-07-26 00:30 UTC+8

## Findings

### t112_code_f005 - 启动阶段未对 kimi 实例做初次 reconcile_auto_refresh

- 严重度：important
- 位置：`src/main/index.ts:641-652`（grok 在此处的 startup 段调 `grokOAuthManager.reconcile_auto_refresh(...)`，kimi 在该位置**无**对应调用）；对比 `src/main/index.ts:345-355`（仅 `onConfigSaved` 内对 grok + kimi 都 reconcile）
- 问题：
    - t112_code_f001 修复在 `onConfigSaved`（行 355）与 `shutdown`（行 910）补上了 kimi reconcile，**漏掉**了启动阶段（grok 在行 651 单独再调一次，注释明示「Start OAuth auto-refresh for enabled grok connector instances」）。
    - `enabled_auto_refresh_ids` 只在 `start_auto_refresh` / `reconcile_auto_refresh` 调用时才加入实例；kimi_oauth_manager 在 `create_kimi_oauth_manager` 实例化后该集合为空。
    - 失败场景：用户首次通过 OAuth 登录 kimi → 关闭程序 → 下次启动。启动后 grok 在行 651 入口被 reconcile（已登录 grok 实例的 auto-refresh 立即生效）；kimi 在该位置**缺失**对应调用，要等到用户改 config 触发 `onConfigSaved` 才会被加入 `enabled_auto_refresh_ids`。期间 token 即将过期却不会触发 `schedule_auto_refresh_if_enabled`，违反 spec AC #3「token 过期前自动刷新」。
    - 证据链：`src/main/index.ts:642`（grokDef）、行 651（grokOAuthManager.reconcile）；同文件 grep `kimiOAuthManager` 仅 4 处（244 实例化 / 355 onConfigSaved / 401 IPC 注册 / 910 shutdown），无启动段 reconcile。
- 建议：在 `src/main/index.ts` 行 651 的 grok 启动 reconcile 块之后追加对 kimi 的对称调用——计算 `active_kimi_instance_ids`（与 onConfigSaved 行 346-354 相同筛选逻辑）后调 `kimiOAuthManager.reconcile_auto_refresh(active_kimi_instance_ids)`。或把 grok + kimi 的启动 reconcile 抽成一个小循环，按 provider 列表统一处理（同时消除 grok/kimi 的对称重复）。

## 结论

- 前轮 finding 复核（Round 2）：
    - **t112_code_f001（auto-refresh 调度）**：**修不彻底**。manager 内部 API（`start_auto_refresh`/`schedule_auto_refresh_if_enabled`/`schedule_retry`/`reconcile_auto_refresh`/`stop_auto_refresh`/`shutdown`）完整落地，退避重试逻辑（最多 10 次非 terminal 失败后放弃）与 AC #3 margin（5 min）正确；但 `src/main/index.ts` 只在 `onConfigSaved` 与 `shutdown` 接线，漏了 grok 在启动段（行 651）的初次 reconcile。本轮新 finding **t112_code_f005** 即此缺口，严重度 important。
    - **t112_code_f002（instance_id 错配）**：**已彻底修**。`OAuthLoginResult` 在 `src/main/core/auth/kimi_oauth_manager.ts:71-76` 扩展 `refresh_token?` / `expires_at?`；`await_completion` 在行 356-364 返回 3 字段；`src/shared/types/ipc.ts:233-238` `KimiLoginResult` 镜像；`src/preload/index.ts:340-363` 透传；`useKimiDeviceLogin` 返回类型同步（`src/renderer/hooks/useKimiDeviceLogin.ts:15-20`）；`OAuthDeviceForm.handle_start`（`src/renderer/components/forms/OAuthDeviceForm.tsx:44-60`）把 `OAUTH_TOKEN` + `OAUTH_REFRESH_TOKEN` + `OAUTH_EXPIRES_AT` 3 secret 经 `on_save` 写到 real instance 的 vault。real instance 的 `refresh_now` / `login_status` / `logout` 均可读到完整 token set，instance_id 错配不再发生。
    - **t112_code_f003（useKimiDeviceLogin 与 grok 重复 ~120 行）**：维持 minor 遗留。verbatim 重复属实，但差异仅在 `window.usageboard.grok` vs `window.usageboard.kimi` 命名空间。提取共享 hook 需改 `useGrokDeviceLogin` 的返回类型与现有 grok 测试（grok 的 `OAuthLoginResult` 仍只 `{saved, token?}`，未扩展 refresh_token/expires_at），跨 task 重构，遗留合理。
    - **t112_code_f004（kimi_oauth_manager 与 grok_oauth_manager helper 重复 ~200 行）**：维持 minor 遗留。`form_encode` / `is_token_response` / `is_error_response` / `make_default_http_post` / `make_default_get_device_id` / `compute_expires_at` / `store_tokens` / `clear_tokens` / `load_tokens` 等 helper 在两文件 verbatim 重复；但 kimi 已分化出独立 `OAuthLoginResult`（含 refresh_token/expires_at）与独立 auto-refresh 简化版（无 mutation tail / generation / in-flight coalesce），先稳定行为再抽象是合理工程权衡。重构 grok 跨 task，遗留合理。**附带提示**：`kimi_oauth_manager.ts` 583 行（`grok_oauth_manager.ts` 587 行）均超实现源码 400 minor 阈值，`await_completion` 圈复杂度 ≈12 达 minor 阈值，待 f004 重构提取共享模块时一并缓解，不单列 finding。
- 本轮新发现：1 条（t112_code_f005）
- 总体判断：Round 1 f002 完整修复；f001 在 manager 内部实现完整，但 main/index.ts 接线漏了启动段初次 reconcile，使「token 过期前自动刷新」在程序启动后到首次 config save 之间失效；f003/f004 维持遗留合理。修复启动段 reconcile 后可 PASS。

verdict: FAIL

## Round 3 (2026-07-26 01:05 UTC+8)

### t112_code_f005 复核：已修

- 修补位置：`src/main/index.ts:653-665`，紧跟 grok 启动 reconcile 块（行 641-652）之后。
- 修补内容：在 `orchestrator.startAll(...)`（行 637）之后新增独立块作用域，用 `currentConfig`（启动快照）筛选 `manifest.provider === "kimi"` 且 `enabled && executablePath === kimiDef.executablePath` 的 instance_id 集合，调 `kimiOAuthManager.reconcile_auto_refresh(active_kimi_instance_ids)`。
- 正确性链：
    1. `reconcile_auto_refresh`（`kimi_oauth_manager.ts:548-559`）先把 active ids 加入 `enabled_auto_refresh_ids`，再对每个 id 调 `schedule_auto_refresh_if_enabled`。
    2. `schedule_auto_refresh_if_enabled`（行 499-533）`load_tokens` 读 vault；若已存 `OAUTH_TOKEN` + `OAUTH_REFRESH_TOKEN`，按 `expires_at - REFRESH_MARGIN_MS - Date.now()` 计算 delay 设定时器；到期触发 `refresh_now`。
    3. 失败场景闭环：用户首次 OAuth 登录 kimi → 3 secret 已写入 real instance vault（见 f002 修复）→ 关闭程序 → 重启。启动段 reconcile 读 vault 命中 token → 立即 schedule，token 即将过期时自动刷新。AC #3 在启动后立即生效，不再依赖用户改 config 触发 `onConfigSaved`。
- 启动段 reconcile 与 `onConfigSaved`（行 346-355）用的是同一筛选逻辑与同一 manager 实例（`kimiOAuthManager` 在行 240-250 单一实例化），无重复 schedule 风险（`schedule_auto_refresh_if_enabled` 入口 `cancel_auto_refresh_timer` 保证幂等）。

### Round 2 遗留 finding 复核

- **t112_code_f003 / t112_code_f004（hook / manager 与 grok 重复）**：维持 minor 遗留，仍合理。本轮新增启动段 reconcile 块（行 653-665）与 grok 启动段（行 641-652）verbatim 重复约 13 行，属于 f003/f004 同一类「provider 对称重复」，待提取共享 helper 时一并处理，不单列。

### 本轮新发现

- 0 条。启动段 reconcile 接线完整，无新 anti-pattern，无新风险面。

## 结论

- 前轮 finding 复核（Round 3）：
    - **t112_code_f005**：已彻底修。启动段 reconcile_auto_refresh 接线落地，与 grok 对称，AC #3「token 过期前自动刷新」在程序启动后立即生效。
    - **t112_code_f001**：随 f005 修补闭环。manager 内部 API + main/index.ts 三处接线（启动段 / onConfigSaved / shutdown）齐全。
    - **t112_code_f002**：Round 2 已确认彻底修，本轮无回归。
    - **t112_code_f003 / t112_code_f004**：维持 minor 遗留，仍合理，本轮新加的启动段对称重复归入此类。
- 本轮新发现：0 条
- 总体判断：实现轴所有 important finding 已闭环；遗留仅为跨 task 重构类 minor（hook / manager helper 与 grok verbatim 重复），不阻塞本 task。实现正确、规格合规、AC #1–#3 实现层全覆盖。

verdict: PASS
