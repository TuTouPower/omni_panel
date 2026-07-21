# Task review T022

- task：`T022_plugin_failure_to_web`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：测试
- reviewed_at：2026-07-21 05:10 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` -> `review_code.md` / 前缀 `code`；`测试` -> `review_test.md` / 前缀 `test`。

## Findings

### T022_test_f001 - 手造 failed connector 依赖 real fixture 形态，synthetic 仍非独立可复现

- 严重度：medium
- 位置：`scripts/e2e/gen_synthetic.mjs:67-79`、`tests/e2e/fixtures/synthetic.json` connector[3]
- 问题：spec 范围写的是 "push 一个手造 failed connector（instanceId=mock-failed-connector, enabled, snapshot.status=failed, items=[], error="mock failure"）"，即独立于 real fixture 的合成 connector。实际实现改为 `real_connectors.find(i => i.enabled && i.snapshot.status === "failed")`——从 real fixture 取首个 enabled+failed connector（KIMI）追加到 synthetic。两条副作用：
    1. synthetic.json 是否含 failed connector 取决于 real data/responses.json 当时是否含 enabled+failed 的 connector。若未来重录 real 时 KIMI 已修复（status=ready），synthetic 将不含 failed connector，web/plugin_failure_modes.spec.ts 的 `.card-state.err` 断言会落到 15s timeout 后失败（非 skip——本 spec 没像 popup_card_states 那样做 `test.skip` 守卫）。
    2. KIMI 失败时 snapshot 仍带 2 个 stale items（items_len=2），渲染走 `render_error_banner`（ProviderCard L209 `has_stale_error` 分支，banner 叠在 stale usage 上），不是 spec 写的 "纯 failed card"（items=[], 走 `render_state` 的 isFailed 分支 L182）。spec 验收 "纯 failed card 渲染" 的语义未真正被覆盖。
- 建议：
    - 短期：若坚持用 real KIMI，更新 spec 描述把"手造 mock-failed-connector"改为"追加 real enabled+failed connector"，并在 spec 验收补"失败带 stale items 时走 render_error_banner"，与实际一致。同时给 web spec 两条 case 加 `test.skip` 守卫（参照 popup_card_states.spec.ts L26-32），避免 real 修复后 CI 红。
    - 长期：真正按 spec 原意造一个独立 mock connector（instanceId=mock-failed-connector, items=[], error="mock failure"），让 synthetic 自洽不依赖 real 录制状态，且能覆盖纯 failed 路径（isFailed 分支 L182）。

### T022_test_f002 - web spec retry action 断言为"守卫式"非强校验，行为期望被弱化

- 严重度：low
- 位置：`tests/e2e/web/plugin_failure_modes.spec.ts:25-37`
- 问题：spec 验收"web plugin_failure_modes 测 failed card 渲染"包含 retry action（守卫）。实际 case 2 写：
    ```ts
    if ((await retry.count()) > 0) {
        await expect(retry).toBeVisible();
    }
    ```
    count=0 时直接跳过断言。当前 synthetic KIMI 是 401 非 auth error（`is_auth` 检查 `auth`/`token`/`unauthorized` 等关键词，KIMI error="HTTP 401: request failed (236 bytes)" 全部 miss），按 ProviderCard L156-180 is_auth=false 走 L182 分支，应渲染"重试"action——理论上 retry.count() 必 >0。守卫让"应渲染重试但没渲染"的回归无法被该 case 捕获。
- 建议：把守卫改为强断言 `await expect(retry).toBeVisible()`（针对当前 synthetic KIMI 401 非 auth 的确定行为）。若担心 real fixture 含 auth failed 导致不渲染重试，则按 f001 建议造 mock-failed-connector 锁定 error="mock failure"（非 auth 关键词），retry 必渲染。

### T022_test_f003 - 删 electron 3 case 后 behavior 区分（error/crash/slow）单测覆盖不全

- 严重度：medium
- 位置：`tests/e2e/electron/plugin_failure_modes.spec.ts`（已删）、`tests/integration/connector/runtime.test.ts`
- 问题：spec 范围明确"behavior 区分由 connector 单测覆盖"。核对 `tests/integration/connector/runtime.test.ts`：
    - error 路径：L145 "returns error when script throws"、L40 "returns error when no script in manifest"——覆盖 script throw 场景。
    - slow/timeout 路径：L151 "returns error when script times out"、L158 "returns timeout error when async script exceeds timeout"——覆盖 timeout 场景。
    - crash（进程退出码非零）路径：runtime.test.ts 未直接覆盖。`run_connector` 在 main 进程内执行 script，crash 语义（子进程 exit 非 0 / killed）需看 host 层 `spawn_connector` 或 runtime 包装。未在 integration 找到"non-zero exit -> status=failed+error"的显式断言。
    - 原电子版 3 case 区分的 "crash exit 2 -> failed card" 行为在 web 迁移后无对应单测兜底。
- 建议：补 integration 测试 1 case 断言 connector 子进程非零退出时 `result.error` 非空且含 stderr 摘要（或 runtime 层把非零 exit 转 `status=failed`）。若 crash 路径已在 `tests/integration/connector/cpa-connector.test.ts` 或 host 层覆盖，指出位置即可消项。

### T022_test_f004 - 1 skip 来源未在 spec/log 注明，归属不清

- 严重度：low
- 位置：synthetic 42+1 skip（上下文提及）
- 问题：上下文提到 "synthetic 42+1 skip"。核对 synthetic web spec 列表，只有 4 处 `test.skip`：
    - `popup_card_states.spec.ts:31`（"mock fixture 无 enabled+failed connector"——但本次 T022 已给 synthetic 加了 failed KIMI，该 skip 应不再触发，case 实际跑绿）
    - `multi_account.spec.ts:39`（"fixture 无 KIMI connector"——本次 synthetic 已有 KIMI connector[3]，该 skip 也不触发）
    - `opencode_go_usage.spec.ts:22`（"synthetic fixture 不含 opencode_go provider"——synthetic 不含 opencode_go，此 skip 触发）
    - 另有 1 skip 应来自 packaged 或 electron project 的 case（如 opencode_go electron 镜像）
- 建议：在 log.md 或 task_report 明确 synthetic run 的 1 skip 具体是哪个 case（推断为 opencode_go_usage web），避免未来 spec 改动时 skip 归属迷路。

## 结论

验收 5 条核对：

1. synthetic.json 含 failed connector（status=failed）——通过，但实现是 real KIMI 带 stale items（items_len=2），非 spec 写的"手造 items=[] 纯 failed"（f001）。
2. web plugin_failure_modes 测 failed card 渲染——2 case 断言 `.card-state.err` 可见 + message 非空 + retry 守卫（f002）。real/synthetic 都绿。
3. 删 electron/plugin_failure_modes.spec.ts——已删。behavior 区分（error/slow 单测覆盖，crash 路径未补单测，f003）。
4. `pnpm test:e2e:web` 全绿——按上下文 42+1 skip 通过。
5. `pnpm typecheck` 过——按上下文通过。

synthetic KIMI（401 stale, items=2）走 `render_error_banner`（L209 `.card-state.err`），与纯 failed card（L182 `.card-state.err`）两者 DOM 同 class，spec 泛化"测 failed card 渲染"在 DOM 层面被覆盖，但 isFailed 分支（L182）未被 synthetic 触发（f001）。整体可合入，f001+f003 建议处理（修 spec 描述 + 补 crash 单测或定位既有覆盖），f002 建议改强断言，f004 建议在 log 注明 skip 归属。
