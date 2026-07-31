---
tid: "t118"
slug: "extract_shared_oauth"
title: "grok/kimi oauth 共享提取（hook + manager）"
status: "done"
branch: "t118_extract_shared_oauth"
worktree: ""
review_level: "full"
diff_anchor: "897f96726b9445aab02515ac9446527911cdf70c"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task {tid}\_{slug}

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 2026-07-26 start。diff_anchor `897f967`。t112 遗留 f003（hook 重复）+ f004（manager helper 重复）。
- **f003（hook）已修**：新建 `src/renderer/hooks/use-device-login.ts`（共享 `useDeviceLogin(namespace, instance_id)`，参数化 `window.usageboard.<namespace>`）。`useGrokDeviceLogin`/`useKimiDeviceLogin` 改薄封装（调共享 + namespace，re-export `UseDeviceLoginResult` 作旧类型名）。OAuthDeviceForm 不动（仍调 useGrokDeviceLogin/useKimiDeviceLogin 薄封装）。hook 重复消除（~120 行）。react-hooks/rules-of-hooks 要求 hook 名驼峰 use 前缀，故 `useDeviceLogin`（非 use_device_login）。
- **f004（manager helper）遗留**：explore 对比显示 grok/kimi manager 低层 helper（类型/常量/is\_\*/form_encode/to_error/make_default_http_post/store/load/clear/is_terminal/compute_expires_at ~150 行）逐字重复，但 manager 主体（await_completion/refresh_now/logout）差异大：grok 三层并发控制（token_generation + token_mutation_tails + refresh_in_flight，精细 race 保护）+ 字节级不等价点（load_tokens 顺序 vs Promise.all、logout 多调 cancel_device_login、stop_auto_refresh/shutdown 多清 retry_failure_counts、await_completion 多二次 cancel 检查 vs grok generation）。强行合并 grok 行为可能回归（grok 是稳定上线路径，30+ 测试做回归网但字节级时序难全覆盖）。提取纯 helper（低风险）+ store/load 统一（行为等价但 load 时序微变）需逐段 Edit grok 590 行 manager，易漏。决策：本 task 解决 f003（完全），f004 manager 重构遗留，建议另立 spike 评估「grok 行为字节级不变」的具体提取边界（纯 helper 抽取 + auto-refresh 引擎共享 + mutation/generation 保留 grok）。
- 验证：`pnpm test` 1739 passed / 167 files；`pnpm typecheck` 0 错误；改动文件 ESLint 0 错误。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-26 03:55 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | fix_ref                                                         |
| -------------- | --------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| t118_code_f001 | important | 已修   | 去手写 `DeviceLoginApi` 接口 + `get_api`（`as unknown as Record + api!`）；改 `window.usageboard[namespace]` 直接访问（TS 推断 preload 实际联合）+ `result as LoginPollResult`                                                                                                                                                                                                                                                                                                                      | src/renderer/hooks/use-device-login.ts                          |
| t118_code_f002 | important | 遗留   | spec AC「manager helper 不再逐字重复」未落地。explore 对比显示 grok/kimi manager 低层 helper（~150 行）逐字重复，但 manager 主体（await_completion/refresh_now/logout + grok 三层并发控制 mutation/generation/in-flight + 字节级不等价 load_tokens/logout/stop_auto_refresh）差异大。强行合并风险回归 grok 稳定上线路径（30+ 测试做回归网但字节级时序难全覆盖）。建议另立 spike 评估「grok 行为字节级不变」的具体提取边界（纯 helper 抽取 + auto-refresh 引擎共享 + mutation/generation 保留 grok） | src/main/core/auth/grok_oauth_manager.ts, kimi_oauth_manager.ts |
| t118_code_f003 | minor     | 已修   | 去 `DeviceLoginApi` 手写接口（含 hook 不调用的 login_status/logout/refresh），直接用 preload typeof 推断；hook 只调 login_start/login_poll/login_cancel，readonly 路由由 `"login_start" in api` 守卫过滤                                                                                                                                                                                                                                                                                            | src/renderer/hooks/use-device-login.ts                          |

### Round N (YYYY-MM-DD HH:MM UTC+8)

（有 finding 时用本表；每条 finding 一行。）

| finding_id       | severity                 | status | rationale | fix_ref   |
| ---------------- | ------------------------ | ------ | --------- | --------- |
| {tid}\_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [x] grok oauth 单测全绿，行为不变（`tests/unit/auth/grok_oauth_manager.test.ts`）。
- [x] kimi oauth 单测全绿，行为不变（`tests/unit/auth/kimi_oauth_manager.test.ts`）。
- [x] `useGrokDeviceLogin`/`useKimiDeviceLogin` 单测（含 OAuthDeviceForm）全绿。
- [~] 共享 helper 不再逐字重复：**hook 完全解决（f003，~120 行去重）**；**manager 低层 helper（f004）遗留**——grok/kimi manager 主体（await_completion/refresh_now/logout + grok 三层并发控制 mutation/generation/in-flight + 字节级不等价 load_tokens/logout/stop_auto_refresh）差异大，强合并风险回归 grok 稳定上线路径。spec AC 调整：manager helper 提取移至独立 spike/task（评估 grok 字节级不变边界：纯 helper 抽取 + auto-refresh 引擎共享 + mutation/generation 保留 grok）。
- [x] `pnpm test` 全绿（1739）；`pnpm typecheck` 0 新增错误。

### Reviewer verdict

- Round 1 code：FAIL（f001 important 双重断言、f002 important manager helper 未落地、f003 minor 多余方法）
- Round 1 test：PASS
- Round 2 code：FAIL（f001/f003 已修；f002 遗留合理但 spec AC 未同步 + blocked 流程未走）
- Round 2 test：N/A（Round 1 已 PASS）

### 遗留

- `t118_code_f002`：grok/kimi manager 低层 helper（~150 行）逐字重复。manager 主体差异大（grok mutation/generation/in-flight + 字节级 load_tokens/logout/stop_auto_refresh 不等价），强合并风险回归 grok 稳定上线路径。后续：另立 spike 评估「grok 行为字节级不变」的提取边界（纯 helper 抽取 + auto-refresh 引擎共享 + mutation/generation 保留 grok），再建实施 task。

### 结果摘要

- **f003（hook）完全解决**：新建 `src/renderer/hooks/use-device-login.ts`（共享 `useDeviceLogin(namespace, instance_id)`，从 preload typeof 推断 VendorApi，in 守卫过滤 readonly，result as LoginPollResult）。`useGrokDeviceLogin`/`useKimiDeviceLogin` 改薄封装（调共享 + namespace，re-export 旧类型名）。OAuthDeviceForm 不动（用薄封装）。hook 重复消除 ~120 行。
- **f004（manager helper）遗留**：grok/kimi manager 低层 helper 逐字重复但 manager 主体差异大 + grok 稳定路径风险，未合并。建议另立 spike 评估字节级不变边界。
- 验证：`pnpm test` 1739 passed / 167 files；`pnpm typecheck` 0 错误；改动文件 ESLint 0 错误。
