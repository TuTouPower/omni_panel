# Task review t339（reviewer_focus: 代码）

- task：`t339_oauth_manager_dedupe`
- spec：`docs/tasks/t339_oauth_manager_dedupe/spec.md`
- diff_anchor：`ed51a5e80ea8589ed0cddf483e07199d21d93f88`
- target：`git diff ed51a5e80ea8589ed0cddf483e07199d21d93f88`
- round：1
- reviewed_at：2026-08-13 14:42 UTC+8

reviewed_scope: 4bb1a4492ed0db03

## Findings

### t339_code_f001 - preload 工厂以 `unknown` + 整体 `as` 强转，丢失 per-provider 返回类型强制

- 严重度：minor
- 锚点：无 AC 违反；契约·类型维度「滥用 unknown / 强转透传」，薄包装掩盖类型错误
- 位置：`src/preload/oauth_api.ts:28-59`（`create_oauth_apis`）
- 问题：基线 `create_grok_oauth_apis` / `create_kimi_oauth_apis` 在每个 invoke 调用点用具体类型 `GrokLoginStatus / GrokDeviceCodeStart / GrokLoginResult / GrokRefreshResult` 约束 IPC 返回值；重构后工厂内部对 `login_status / login_start / login_poll / refresh` 全部改为 `deps.invoke<unknown>`，再用 `as OAuthApis<TReadonlyApi, TSettingsApi>` 整体强转兜住外层类型。对外公共类型（`OAuthApis<GrokReadonlyApi, GrokSettingsApi>`）不变，运行时行为不变，但工厂内部不再对 grok/kimi 的具体 payload 形状做编译期校验。若将来 grog/kimi 任一 channel 映射接错，`as` 强转会静默掩盖（两个具体工厂都走同一泛型函数），基线写法本可在调用点捕获。
- 建议：若需恢复 per-provider 类型强制，可给 `create_oauth_apis` 增加 payload 类型参数（如把各方法的 invoke 泛型作为 `TReadonlyApi/TSettingsApi` 的映射传入），或在具体工厂内保留各方法的显式 `invoke<GrokLoginResult>` 类型标注。当前正确接线 + 测试覆盖下非阻塞，可作后续加固。

## 结论

### AC 复验方式

- AC-001（三处无逐字重复成对实现）：`re_verified`。`device_code_oauth_manager.ts` 单一参数化实现；grok/kimi manager 58/108 行仅为常量+配置薄包装；`oauth_device_ipc.ts` 单一注册器，grok/kimi ipc 78/78 行仅 channel 映射；`oauth_api.ts` 单一工厂，两具体工厂仅 channel 映射。
- AC-002（grok logout 对齐 kimi：cancel_device_login + 清 retry_failure_counts）：`re_verified`。共享 manager `logout`（`device_code_oauth_manager.ts:364-373`）与 kimi 基线逐行同序；新增 `device_code_oauth_manager.test.ts` 断言 logout 取消进行中 device login。
- AC-003（grok stop_auto_refresh/shutdown 清 retry_failure_counts）：`re_verified`。共享 `stop_auto_refresh`（`:450-455`）与 `shutdown`（`:471-479`）均清 `retry_failure_counts`，对照 kimi 基线一致。
- AC-004（既有 grok/kimi OAuth 单测全过）：`re_verified`。运行 `tests/unit/auth/grok_oauth_manager.test.ts`、`kimi_oauth_manager.test.ts`、`device_code_oauth_manager.test.ts`、`ipc/grok_auth_ipc.test.ts`、`preload/oauth_api.test.ts` 共 74 例全过；`tsc --noEmit`、`eslint`、`depcruise` 均过。

coverage = 4 / 4

- 参数化抽象边界核对：scope（仅 grok）经 `config.scope` 条件并入 device-login 与 refresh body；header builder（kimi 异步注入 Accept/X-Msh-Platform/device-id，grok 仅 Content-Type）经 `config.build_headers` 保留；endpoints/client_id/log_name/provider_label 均入 config。device-id resolver 留在 kimi 包装层，未下沉共享层。无隐式差异被抹平。grok 基线与共享实现的差异仅限 logout/stop_auto_refresh/shutdown 三处有意对齐（对应 AC-002/003）。
- 未进表的提示：
    - 文件过大：`device_code_oauth_manager.ts` 493 行（≥400 minor 阈值，<800）。两份 ~470 行实现收敛为单文件，属整块收敛，人为切分需引入无收益抽象；按降级规则仅提示，不出 finding。
    - 圈复杂度：`await_completion` 手算约 11-12（≥10 结论段提示）。逻辑逐行继承自基线两实现，无新增分支，且 <15，不出 finding。
    - 范围外观察：本 diff 之外另有 3 个未跟踪新文件 `device_code_oauth_manager.ts`、`oauth_device_ipc.ts`、`device_code_oauth_manager.test.ts`（工作树内、未提交）；review 按工作树内容执行。
    - `tests/unit/shared/schema_export_freshness.test.ts` 改动为 t338 遗留 strict-TS 错误修复（`anyOf`/`properties` 访问改可选链+显式 throw），与 t339 无关，确认通过（4 例）。
    - 全量单测 15 例失败均为 `node_modules/electron/path.txt` ENOENT（worktree 未装 Electron 二进制，涉及 local-api/main/logging/cli/session-history 等直接 import electron 的模块），与本 diff 无关；t339 触及路径测试全过。
- 总体判断：参数化收敛正确，grok 行为漂移按 kimi 对齐落地，抽象边界未抹平任何 provider 差异，既有单测全过；仅 1 条 minor（preload 内部类型强制弱化），无未解决 critical/important。
- 系统性 follow-up：无

verdict: PASS
