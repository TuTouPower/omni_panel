# Task review t340（reviewer_focus: 代码）

- task：`t340_oauth_robustness`
- spec：`docs/tasks/t340_oauth_robustness/spec.md`
- diff_anchor：`698fe185c85d732eaabcf5b634aff02445d1a397`
- target：`git diff 698fe185c85d732eaabcf5b634aff02445d1a397`
- round：1
- reviewed_at：2026-08-13 15:35 UTC+8

## Findings

### t340_code_f001 - store_tokens 回滚失败时原始错误被遮蔽，与行内注释声称不符

- 严重度：minor
- 锚点：AC-004（行为缺陷）——回滚自身失败时，调用方收到的是回滚错误而非原始写失败，根因丢失
- 位置：`src/main/core/auth/oauth_helpers.ts:167-178`
- 问题：catch 块中 `await rollback(access_key, prev_access)` 等三次回滚调用未包裹 try/catch。若任一回滚的 `vault.set`/`vault.delete` 自身 reject，异常直接从 catch 块逃逸，`throw error`（原始错误）不可达，调用方（refresh_now / await_completion）只会看到回滚错误消息。行内注释（172-173 行）声称「回滚自身失败时仍抛出原始错误」与实际不符。可复现路径：vault 在写入第 2 个键时抛错、且回滚该键时再次抛错 → refresh_now 日志只记回滚错误，原始写失败根因被掩盖。另外 spec 范围「或记录一致性告警」的兜底在回滚失败时并未以可辨识的一致性告警落地，仅以泛化失败日志透传。
- 建议：将回滚包入 `try { ... } catch { /* 记录一致性告警，随后仍 throw 原始 error */ }`，保证原始错误始终作为主错误抛出，回滚失败仅追加告警日志。

### t340_code_f002 - prettier format:check 失败，CI `pnpm check` 门禁红灯

- 严重度：important
- 锚点：可观测缺陷（输入=当前 diff；状态=仓库 `pnpm check` 门禁含 `format:check`；坏结果=`prettier --check` 退出码非 0，CI `check` job 失败，分支无法过合并门禁）
- 位置：`src/main/core/auth/device_code_oauth_manager.ts:454-464`、`tests/unit/auth/kimi_device_id_cache.test.ts:11-12, 26, 29-30`
- 问题：`npx prettier --check <改动文件>` 对这两个文件报 warn：
    - `device_code_oauth_manager.ts` 内 `void refresh_now(instance_id)` 块相对外层回调缩进少 4 空格（454-464 行），prettier 会重排。
    - `kimi_device_id_cache.test.ts` 三处 `await import(...)` 拆行与 `vi.spyOn(...).mockRejectedValue(...)` 换行不符合 printWidth 100 的 prettier 输出。
    - 已实测 `npx prettier --check` 对改动范围内两个文件失败；`pnpm check` 的 `format:check` 是 CI `check` job 的硬门禁（`.github/workflows/ci.yml`），即本分支 CI 会红。逻辑无问题，属机械修复。
- 建议：对两文件执行 `npx prettier --write` 后重新提交（属执行 commit 内修正，不走重审流程，下一轮复核确认）。

## 结论

- 前轮 finding 复核：Round 1，无。
- 本轮新发现：2 条（f001 minor / f002 important）。
- 未进表的提示：
    - 文件过大：`device_code_oauth_manager.ts` 当前 528 行，达「实现源码 ≥400 → minor」阈值且本 task 净增 35 行；未达 800 important 阈值，按降级规则仅列路径不列 finding。其余改动文件均未超阈值。
    - 复杂度：`schedule_auto_refresh_if_enabled` 手算 McCabe 约 8，低于 10；未命中。
    - 范围外观察：`schedule_retry` / `schedule_auto_refresh_if_enabled` 两处 timer 回调对 `refresh_now(...)` 新增 `.catch` 为防御性死代码（`refresh_now` 内部 catch 全部错误并恒返回 `RefreshResult`，从不 reject），无害，不构成 finding。
- 总体判断：OAuth 健壮性四条 AC 逻辑实现正确且测试可复验（f001 为边缘诊断缺口），但 prettier 格式门禁失败会使 CI 红灯，f002 未解决前 branch 不可合并。
- 系统性 follow-up：无。

### AC 复验披露

- AC-001：`re_verified`。读 `device_code_oauth_manager.ts:431-476`（`schedule_auto_refresh_if_enabled` 整体 try/catch，catch 记 `auto_refresh: failed to schedule for ${instance_id}: ...` 含 instance_id，instance 保留在 `enabled_auto_refresh_ids`）；复跑 `device_code_oauth_manager.test.ts`「vault 读失败时 schedule 不产生 unhandled rejection」通过。
- AC-002：`re_verified`。读 `device_code_oauth_manager.ts:205-216, 239-241, 292-294`（取消闭包函数开头持久注册，循环顶与 mutation 内均检查 `cancelled_ref.current`）；复跑「poll 窗口内 cancel」测试通过；对照旧实现 `git show 698fe185:...device_code_oauth_manager.ts:190-240` 确认旧代码取消闭包仅在 sleep 内注册、HTTP 轮询窗口内 `cancel_device_login` 为 no-op，新测试在旧码上必失败——证明该测试有效覆盖新行为。取消闭包对 sleep_timer/sleep_resolver 清理已核验：cancel 清 timer+resolver 并 resolve，natural fire 回调自清，多次 cancel 幂等，无悬挂 timer。
- AC-003：`re_verified`。读 `kimi_oauth_manager.ts:60-93`（module 级 `cached_device_id`，成功值缓存、生成值缓存、读+写均失败返回 null 不缓存）；复跑 `kimi_device_id_cache.test.ts` 2 用例通过。
- AC-004：`re_verified`。读 `oauth_helpers.ts:147-178`（写前 3 键快照，catch 内按「本次可能写过的键」回滚，回滚条件与写条件逐键对齐）；复跑 `oauth_helpers.test.ts` 2 个新增用例通过（含旧值恢复、新键 delete）。回滚在并发 write 下语义：manager 内所有 store_tokens 调用均经 `enqueue_token_mutation` 按 instance 串行，无并发回滚覆写窗口。
- coverage = re_verified / 总 AC 数 = 4/4

reviewed_scope: 3e7a06c564da6c6b

verdict: FAIL

## Round 2 (2026-08-13 15:42 UTC+8)

### 前轮 finding 复核

- t340_code_f001（minor）：已消除。`oauth_helpers.ts:167-206` catch 块内各键回滚分别 try/catch，`rollback_errors: string[]` 收集回滚失败消息；`rollback_errors.length > 0` 时 `throw new Error(\`${to_error(error).message} (rollback also failed: ...)\`)`，否则 `throw error`。原始写失败始终作为根因抛出，行内注释（166-168 行）与实际一致。回滚成功路径重新抛原始 error 对象，refresh_now/await_completion 日志保留根因。
- t340_code_f002（important）：已消除。`npx prettier --check` 对改动范围内全部 6 文件通过（`All matched files use Prettier code style!`）；`device_code_oauth_manager.ts` 内 `void refresh_now` 块缩进已对齐（454-464 行），`kimi_device_id_cache.test.ts` 三处 `await import` 与 `vi.spyOn(...)` 换行已重排。CI `pnpm check` 的 `format:check` 门禁不再红灯。

### 本轮新发现

### t340_code_f003 - 回滚失败合并错误分支无测试覆盖

- 严重度：minor
- 锚点：非 blocking；f001 修复引入的新分支（`rollback_errors.length > 0`）未补测试
- 位置：`src/main/core/auth/oauth_helpers.ts:184-193`、`tests/unit/auth/oauth_helpers.test.ts:240-296`
- 问题：f001 修复新增「回滚自身失败 → 合并原始错误与回滚失败消息」分支，但 `oauth_helpers.test.ts` 新增两用例仅覆盖回滚成功路径（旧值恢复、新键 delete）。回滚失败分支（vault.delete / vault.set 在回滚时再抛错）无测试，无法证明「原始错误仍为根因、回滚失败附加」的组合行为。
- 建议：追加一用例：写第 2 键失败且回滚该键也失败（mock vault.set 对同一键连续抛错，或 mock vault.delete 抛错），断言 rejects 消息同时含原始错误与 `rollback also failed`。属覆盖补全，不阻断。

### 结论

- 前轮 finding 复核：f001 已消除（diff 核实）、f002 已消除（diff + prettier 实测核实）。
- 本轮新发现：1 条（f003 minor，覆盖补全建议，不阻断）。
- 未进表的提示：
    - 文件过大：`device_code_oauth_manager.ts` 528 行仍达 400 阈值但未回涨，无新增堆大；仅列不列 finding。
    - 复杂度：本轮无新分支显著增加；`store_tokens` catch 块嵌套加深但仍低 CC。
    - 范围外观察：无新增。
- 总体判断：Round 1 两个 blocker（f002 important）与 minor（f001）均按 diff 与实测消除；无未解决 critical / important。新增 f003 为 minor 覆盖建议，不影响 PASS。
- AC 复验方式：
    - AC-001：`re_verified`。Round 2 复跑 `device_code_oauth_manager.test.ts` 通过；schedule 整体 try/catch 未变。
    - AC-002：`re_verified`。取消闭包逻辑未变，Round 2 复跑 poll 窗口 cancel 测试通过。
    - AC-003：`re_verified`。device_id 缓存未变，Round 2 复跑 `kimi_device_id_cache.test.ts` 2 用例通过。
    - AC-004：`re_verified`。store_tokens 回滚逻辑按 f001 修复后复跑 `oauth_helpers.test.ts` 2 用例通过；回滚条件与写条件逐键对齐未变。
    - coverage = re_verified / 总 AC 数 = 4/4

reviewed_scope: 72f203177408bed7

verdict: PASS
