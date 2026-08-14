# Task review t339（reviewer_focus: 测试）

- task：`t339_oauth_manager_dedupe`
- spec：`docs/tasks/t339_oauth_manager_dedupe/spec.md`
- diff_anchor：`ed51a5e80ea8589ed0cddf483e07199d21d93f88`
- target：`git diff ed51a5e80ea8589ed0cddf483e07199d21d93f88`
- round：1
- reviewed_at：2026-08-13 14:45 UTC+8

## Findings

### t339_test_f001 - AC-002/003 漂移消除核心：retry_failure_counts 清理无任何测试触达

- 严重度：minor
- 锚点：AC-002（logout 清 retry_failure_counts）、AC-003（stop_auto_refresh/shutdown 清 retry_failure_counts）
- 位置：`tests/unit/auth/device_code_oauth_manager.test.ts:107`（logout 用例）、`:134`（stop_auto_refresh 用例）、`:156`（grok/kimi 工厂对齐用例）
- 问题：本 task 的意义是消除 grok 行为漂移，其中可观察的新增行为有两类：(1) grok `logout` 调用 `cancel_device_login`；(2) `logout`/`stop_auto_refresh`/`shutdown` 清 `retry_failure_counts`。新增测试对 (1) 有真实覆盖（logout 取消进行中 login 断言 `{saved:false}`，两工厂同副作用断言 vault 清空），但对 (2) 零触达——三个用例均不进入 retry 循环，`retry_failure_counts` 是 manager 内部 `Map`，无测试读取其可观察效应。若从 `src/main/core/auth/device_code_oauth_manager.ts:368`（logout 内 delete）、`:453`（stop_auto_refresh 内 delete）、`:474`（shutdown 内 clear）删掉这三行，当前全部 125 个相关测试仍会通过。即可观察 delta 需先累积 `MAX_REFRESH_RETRIES=10` 次连续非终态失败再 stop/logout/重启才能看出差别，属低可观察性的内部状态卫生，故不 blocking。
- 建议：在 `device_code_oauth_manager.test.ts` 补一个用例直接观察 retry 计数重置的可观察效应，例如：start_auto_refresh 触发非终态失败（temporarily_unavailable）使 retry 计数累积到接近 MAX_REFRESH_RETRIES → stop_auto_refresh → 重新 start_auto_refresh 再触发失败 → 断言 retry 预算重新起算（未 stop 时应提前放弃）。最低限度注释说明为何不测。

### t339_test_f002 - spec 测试策略「logout/stop_auto_refresh/shutdown 对 grok 与 kimi 产生相同副作用」只落实了 logout

- 严重度：minor
- 锚点：spec 上下文区「测试策略」第 2 条
- 位置：`tests/unit/auth/device_code_oauth_manager.test.ts:156`（仅 logout 有 grok/kimi 工厂对齐用例）
- 问题：spec 测试策略声明新增「行为漂移对齐」断言覆盖 logout/stop_auto_refresh/shutdown 三者对 grok 与 kimi 产生相同副作用。实际只实现 logout 的工厂对齐用例；stop_auto_refresh/shutdown 的 grok-vs-kimi 同副作用无直接断言。由于两工厂现均委托同一份共享实现（`create_grok_oauth_manager`/`create_kimi_oauth_manager` 均调 `create_device_code_oauth_manager`），结构上保证一致，故不 blocking。
- 建议：可选补一个 stop_auto_refresh 或 shutdown 的工厂对齐用例（断言两工厂在相同前置状态下的停止/关闭行为一致），或在结论中明确该断言依赖结构性保证。

## 结论

- 前轮 finding 复核（Round 1，无）
- 改测方向复核：无「迁就实现」改测。既有 grok/kimi manager 单测（30+28 用例）未改动即通过，参数化后行为不变，无把旧预期改成新输出。唯一被改的既有测试 `tests/unit/shared/schema_export_freshness.test.ts` 是防御性加固（`anyOf` 改 optional chaining + `toBeDefined()` + 显式 throw），原 `toHaveProperty` 断言原样保留，非弱化。该文件属 schema（t338）范围，疑为本 task 带入的顺手改动，见「未进表的提示」。
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
    1. `tests/unit/shared/schema_export_freshness.test.ts` 的改动不在 t339 OAuth 收敛范围；断言未弱化，疑为 t338 重导出后类型收紧的必要编译修复或遗留未提交改动，建议 implementer 确认归属并避免跨 task 夹带。
    2. 新建共享 manager 测试直接用 `create_device_code_oauth_manager` 验证对齐行为 + 两工厂用例验证 wiring，结构合理；可再补 logout 对非进行中 login 的普通场景（已被既有 grok/kimi「logout clears all OAuth entries」用例覆盖，无需新增）。
    3. `src/main/core/auth/device_code_oauth_manager.ts:276` 有一处 `eslint-disable-next-line @typescript-eslint/no-unnecessary-condition`，属源码非测试文件，归 code reviewer 处置。
- 总体判断：参数化重构对既有 grok/kimi 单测与 preload/IPC 薄包装测试保持全绿（125/125），AC-002/003 的可观察部分（logout 取消 login、timer 停止、工厂同副作用）有真实行为测试；仅 retry 计数清理这一低可观察内部状态无直接断言，且 spec 测试策略的 stop/shutdown 对齐断言未完全落实，均为 minor，不阻断。
- 系统性 follow-up：无。

### AC 复验方式

- AC-001（结构断言）：`re_verified` — 读源码确认 grok/kimi manager 各收敛为 ~58/~108 行薄包装委托 `device_code_oauth_manager.ts`；两 IPC 文件均委托 `oauth_device_ipc.ts` 且仅差 channel 常量与 log_name；preload 单一 `create_oauth_apis` 工厂 + 两个类型化导出；`tests/unit/preload/oauth_api.test.ts`（2 用例）与 `tests/unit/ipc/grok_auth_ipc.test.ts`（11 用例）未改动即通过，API shape 与 IPC 参数顺序受回归保护。
- AC-002（grok logout 对齐 kimi）：`re_verified` — 运行 `device_code_oauth_manager.test.ts`（3 用例通过）；「logout 取消进行中的 device login」与「grok 与 kimi 两个工厂的 logout 对齐产生相同副作用」用真实 manager + mock vault/http 断言 `{saved:false}` 与 vault 清空；源码 `device_code_oauth_manager.ts:363-373` 确认 logout 调 `cancel_device_login` 并删 retry 计数。
- AC-003（grok stop_auto_refresh/shutdown 清 retry 计数）：`re_verified`（部分）— 源码 `:449-455`、`:471-479` 确认两者清 retry 计数；「stop_auto_refresh 取消定时器且不再 refresh」验证 timer 取消（非恒真，若 stop 为 no-op 则 5 分钟内 timer 会触发 refresh 使断言失败）。但 retry 计数清理本身无测试触达（见 f001）。
- AC-004（参数化后无行为回归）：`re_verified` — `grok_oauth_manager.test.ts`（30 用例）与 `kimi_oauth_manager.test.ts`（28 用例）未改动即全部通过，说明共享实现保留了两厂商既有行为。

coverage = 4 / 4

reviewed_scope: 4bb1a4492ed0db03

verdict: PASS
