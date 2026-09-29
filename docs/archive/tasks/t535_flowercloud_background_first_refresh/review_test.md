# Task review t535（reviewer_focus: 测试）

- task：`t535_flowercloud_background_first_refresh`
- spec：`docs/tasks/t535_flowercloud_background_first_refresh/spec.md`
- diff_anchor：`56c01c1be881a2e834248aa11ad849d1b2a70ec3`
- target：`git diff 56c01c1be881a2e834248aa11ad849d1b2a70ec3`
- round：1
- reviewed_at：2026-09-29 22:22 UTC+8

## Reviewed scope

- 被审对象：`git diff 56c01c1be881a2e834248aa11ad849d1b2a70ec3`（worktree `/Users/karson/kar/code/omni_panel_t535`），全量 diff 哈希 `712994c9e5cdd88b31925d2c1365eb4f`。
- 测试文件：`tests/unit/session/session-manager.test.ts`（md5 `4785514747e1ef8468bb3992cd845513`，改）、`tests/unit/scheduler/refresh-service.test.ts`（md5 `d4c27f4cd2892608736f1e88f6dd86a4`，改）、`tests/unit/session/flowercloud_dom.test.ts`（md5 `2236e2746548c3b26267e403ba728c44`，**未改**——与 anchor 完全一致）。
- 对应生产逻辑：`src/main/core/scheduler/refresh-service.ts`（md5 `e7ca793ec953a968252bc23b08f608ee`）、`src/main/core/session/session-manager.ts`（md5 `5baeadc1eda674a02fd59f26b5662054`）、`src/main/core/session/flowercloud_dom.ts`（md5 `235de142d1b434d686516cdb64cc6f04`）、`src/main/core/session/session-types.ts`、`src/main/index.ts`。
- 复核依据的旁证：`tests/unit/scheduler/refresh-service.test.ts:600-640`（t174 全轮失败 stale 副本）、`tests/integration/scheduler/refresh-service.test.ts:1645`、`:1759`。
- 过程说明：本 worktree 在 review 期间仍被写入（`tests/unit/scheduler/refresh-service.test.ts` 22:18:27、`task.md` 22:17:31 各新增内容；首次 `git diff --stat` 与最终快照不同）。以上哈希为最终稳定快照，findings 以该快照为准。

## Findings

### t535_test_f001 - 抓取失败新路径未实现也未测试 AC-004 的「观测标 stale」，新测试注释自称覆盖 AC-004

- 严重度：important
- 锚点：AC-004（失败路径保留最后一次成功观测及其采集时间，**观测标 `stale` 并携带失败原因**）；改测方向复核——替代旧用例时丢掉了 AC-004 的 stale 子句
- 位置：`src/main/core/scheduler/refresh-service.ts:435-448`（新早退分支）对比 `src/main/core/scheduler/refresh-service.ts:797-821`（既有 stale 副本插入）；测试 `tests/unit/scheduler/refresh-service.test.ts:208-233 / 235-264 / 266-287 / 289-315`
- 问题：
    - 新的 `if (!session_result.ok)` 分支只写 `runtimeStore.updateState({status:"failed", error, lastSuccess})` 后 `return`（`:447`），**在共享的 stale 副本插入逻辑（`:797-821`，与 job 内 `t174/t370` 语义同一段）之前退出**；这条路径上 `observationStore.insert_batch(stale)` 一次都不会执行，任何其它失败路径都会执行的「历史观测标 `stale:true` + `last_error`」在本路径缺失。
    - 显示层 `stale` 只来自 `item.stale`（`src/renderer/lib/provider-usage.ts:148`），不由 `snapshot.status === "failed"` 推导，因此「failed + lastSuccess」并不能替代 observation 的 stale 标记。spec 契约区 AC-004 要求的是后者。
    - 对应测试全部用空 `create_observation_store()`（`:213`、`:245`、`:271`、`:296`），只断言 `status`/`error`/`lastSuccess.updatedAt`，**没有任何一条断言 stale 副本或 `last_error`**；而 `:226` 的注释却写「直接如实标记失败原因（AC-003 / AC-004）」，给出与 AC-004 不符的覆盖信心。既有的同类断言是可复用的（`tests/unit/scheduler/refresh-service.test.ts:600-640`、`tests/integration/scheduler/refresh-service.test.ts:1645`、`:1759`），新旧路径的 AC-004 证据强度不一致，属 TDD 规范意义上的「替代覆盖不全/断言就实现输出」。
- 建议：最小修复二选一——(a) 在 `refresh-service.ts` 把 stale 副本插入提到早退分支之前（或在早退分支内复用同一段），并像 t174 用例那样在单测中断言 `observationStore.inserted` 含 `stale:true` + `last_error === reason`、`observed_at` 保持原值；(b) 若认定 AC-004 由 runtime `failed` + `lastSuccess` 满足，则补一条锁死该语义的断言（例如 DTO/渲染层 stale 为真），并同步修正 `:226` 的注释与 `docs/specs/flowercloud_usage.md` 的失败语义描述。若判定实现确已违背 AC-004，请按 TDD 红灯归因先改实现再补测试。

### t535_test_f002 - AC-001/AC-002「不前台化」只剩间接证据，负向守卫被整体删除且无替代

- 严重度：minor
- 锚点：AC-001（reveal 不被调用、窗口保持不可见、不抢焦点）、AC-002（手动与定时刷新都不自动前台化）；spec「测试策略」最后一条「宿主守卫回归：headless 下 `present_for_capture` / `reveal` 不产生窗口操作」
- 位置：`tests/unit/session/session-manager.test.ts:14-60`（`MockWindow` 删除 `presented`/`revealed`）、`:1328`（仅成功用例断言 `{hidden:true}`）；`tests/unit/session/flowercloud_dom.test.ts:21-44`（`revealed`/`present_for_capture`/`reveal` 死脚手架，零断言）；`src/main/index.ts:783-790`
- 问题：旧用例断言的是「reveal 被调用」（`revealed === 1`）并已随语义删除；替代用例只断言失败文案、关窗与 vault 不覆盖，**没有任何一条断言采集路径不调用 `show()` / `showInactive()` / `setOpacity()` / `focus()`**，也没有任何测试触达 `src/main/index.ts` 的宿主窗口层（`grep refresh_web_session` 仅命中 `tests/unit/scheduler/refresh-service.test.ts`）。当前不前台化由「接口删除了 `present_for_capture`/`reveal`」结构性保证（可信度较高），但 spec 明确要求的宿主守卫回归条目实际落空，`flowercloud_dom.test.ts` 还留着永远不被断言的 `revealed` 计数器，容易被误读为仍在守护该语义。
- 建议：给 `src/main/index.ts` 的采集窗创建一个可测工厂（或在 `create_window` 注入的窗口对象上挂 `show`/`showInactive`/`setOpacity`/`focus` spy），补一条「跑完整轮花云抓取后这些方法 0 次调用」的负向守卫；顺手删掉 `flowercloud_dom.test.ts` 里已无对应接口的 `revealed`/`present_for_capture`/`reveal` 脚手架。

### t535_test_f003 - AC-003 四类失败原因只验证两类；新增 `flower_failure_reason` 大部分分支无覆盖

- 严重度：minor
- 锚点：AC-003（返回「需验证 / 需登录 / 访问受限 / 网络失败」之一）
- 位置：`src/main/core/session/flowercloud_dom.ts:164-190`（`flower_failure_reason` 7 分支）；测试 `tests/unit/session/session-manager.test.ts:1700-1724`（cloudflare）、`:1726-1745`（login）、`tests/unit/scheduler/refresh-service.test.ts:289-315`（blocked 是 mock 的 reason 字符串，未经过真实分类）
- 问题：`cloudflare`、`login` 有真实分类链路覆盖；`blocked`（`flowercloud_dom.ts:145-152`，fixture 只需 `Error 1020 Access denied`）与「网络失败」（`loadURL` 抛错 → `kind:"other"` → 「花云页面未出现用量数据」，与 AC-003 枚举的「网络失败」不可区分）在所有层级都没有测试。`empty`/`cancelled`/`other`/`usage`/`overview` 分支同样零断言。`refresh-service.test.ts:289-315` 的「AC-002 / AC-003」注释只证明了 mock 字符串被透传，未证明分类映射正确。
- 建议：为 `flower_failure_reason` 补一个表驱动单测（全部 7 个 kind），并在 `session-manager.test.ts` 增加一条 `blocked` 页面 fixture 的端到端用例，断言 `reason` 含「访问被拦截」；若认为 `loadURL` 网络失败应给出独立原因，则先与实现方确认分类再补断言。

## 结论

- 前轮 finding 复核：本轮为 Round 1，无。
- 改测方向复核：`tests/unit/scheduler/refresh-service.test.ts` 把旧用例「抓取失败仍跑连接器」就地替换为「抓取失败标 failed 且不跑连接器」，方向本身与 `docs/blueprint/decisions.md` 044、task.md「决策」一致（旧语义确由 spec 变更失效），**不判为实现驱动**；但替代覆盖丢了 AC-004 的 stale 子句（见 f001）。`session-manager.test.ts` 中 `toBe(true/false)` → `updated.ok` / `toMatchObject({ok:false})` 属返回类型由 `boolean` 改为 `{ok, reason?}` 的必要适配，非迁就。4 条 reveal/交接用例（`shows the flowercloud window…`、`hands the flowercloud window over…`、`keeps capturing after revealing…`、`keeps the handover window registered…`）删除有 spec/决策 044 依据，其中「预算耗尽后不叠加同分区窗口」由新用例 `closes the window and frees the registration when the capture budget runs out`（`:1747-1778`）替代，属合法删除。
- 本轮新发现：3 条（important 1、minor 2）。
- 危险模式扫描：`git diff -- tests/` 无 `.skip`/`.only`/`eslint-disable`/`@ts-ignore`/恒真断言/注释断言/阈值掩盖；断言未出现无理由弱化。AC-005/AC-006 的边界（并发去重 `:1489-1510`、同实例重入同上、用户关窗取消 `:1623-1654`、交互登录抢占 `:1656-1699`、预算耗尽即关窗并释放登记 `:1747-1778`）均有覆盖，未发现缺口。
- AC 覆盖矩阵：AC-001 间接（`{hidden:true}` + 接口删除，无负向断言，f002）；AC-002 间接（force 透传 `refresh-service.test.ts:371-395` + 手动刷新失败语义 `:289-315` + 登录互斥 `session-manager.test.ts:1409-1432,1656-1699`）；AC-003 部分（cloudflare/login/cancelled + 抛异常，blocked/网络失败缺，f003）；AC-004 部分（`lastSuccess` 保留已断言 `refresh-service.test.ts:235-264`，stale 未实现未断言，f001）；AC-005 有（`:1747-1778`）；AC-006 有；AC-007 `[deploy]` 按 spec「可测试性声明」不要求自动测试，已核查测试中无任何假冒该 AC 的窗口可见性/焦点断言（`grep setSkipTaskbar|showInactive|setOpacity` 在花云采集窗上无命中），如实声明成立。
- 未进表的提示（范围外/可选）：(1) `flowercloud_dom.ts:156` 的 `flower_needs_user` 在本 diff 后已无任何调用者（src/tests/connectors 全无引用），属本改动产生的死导出，建议由 code reviewer/实现方确认删除；`pnpm knip --include files,dependencies` 不覆盖该形态所以门禁不会拦。(2) `session-manager.test.ts:1508,1620,1694` 等 `toMatchObject({ ok: false })` 不再校验 `reason`，这几处是「并发/抢占」用例，reason 已在 f001/f003 涉及的用例中覆盖，可选补强。(3) spec「测试策略」声明的 `tests/integration/scheduler` 调度集成用例（阻塞页有界退出、旧值保留并标 stale、loading 不长期驻留）未新增，现有 `tests/integration/scheduler/refresh-service.test.ts` 未接入 `refresh_web_session`；若按字面要求执行，f001 的 stale 断言最合适落在此文件。
- 总体判断：新语义（不前台化、预算耗尽即关窗、释放登记、可读失败原因）总体已有真测试触达且删测有 spec 依据，但 AC-004「观测标 stale」在抓取失败新路径既无测试、实现又绕过既有 stale 副本插入，测试注释还自称覆盖 AC-004，属未解决的 important，不能 PASS。
- 系统性 follow-up：无（f001 建议在同一 task 内修复；若实现方认定 AC-004 由 runtime 状态满足，需要同步修订 `docs/specs/flowercloud_usage.md` 的失败语义，属本 task 范围）。

verdict: FAIL

## Round 2（2026-09-29 22:37 UTC+8）

- round：2
- diff_anchor：`56c01c1be881a2e834248aa11ad849d1b2a70ec3`（不变）
- reviewed_scope（Round 2）：`git diff 56c01c1be881a2e834248aa11ad849d1b2a70ec3`；评审起点全量 diff md5 `7d7ac46eb6d83bc4c3eca7f57c8a7633`（22:30:47），最终全量 diff md5 `bac263573e7266e7c973f94393911f0f`。改动文件 14 个（新增 `tests/integration/scheduler/refresh-service.test.ts`）。
    - 生产：`src/main/core/scheduler/refresh-service.ts`（md5 `6abe029f496047546838d6c749a97512`）、`src/main/core/session/flowercloud_dom.ts`（`f047f30e7b0ae65e78f9f6d504ab7c17`）、`src/main/core/session/session-manager.ts`（`5baeadc1eda674a02fd59f26b5662054`，本轮未再改）、`session-types.ts`（`f63184767843546e9fdda69a7fd47145`）、`src/main/index.ts`（`83fe0848bbd288c866c8dfa4de6beb3a`）。
    - 测试：`tests/unit/scheduler/refresh-service.test.ts`（md5 `3b468de671e1e8ae4f146944d0241554`）、`tests/unit/session/flowercloud_dom.test.ts`（`96e130b8276cf7581e92af017b3c481a`）、`tests/integration/scheduler/refresh-service.test.ts`（`2c976611c2e86923e7e3dd082fa18f28`）、`tests/unit/session/session-manager.test.ts`（`4785514747e1ef8468bb3992cd845513`，本轮未再改）。
    - 冻结情况：生产与测试文件哈希在 Round 2 复核前后一致（最后一次写入 22:28:21）；唯一例外是 `docs/tasks/t535_flowercloud_background_first_refresh/task.md` 在 22:30:52 又被追加了「Review 处置」Round 1 表格（纯文档，未触碰代码/测试），因此全量 diff 哈希由 `7d7ac46e…` 变为 `bac26357…`，本轮的代码与测试结论对两者均成立。

### 前轮 finding 复核

- **t535_test_f001（important）→ 已修（真修，非换形式弱化）**：`refresh-service.ts:418-446` 抽出 `mark_observations_stale(reason)`，抓取失败分支 `:475-486` 在 `updateState(failed)` 之前调用 `:481`，采集失败分支 `:834` 调用同一函数，两条路径语义合一。
    - 实现不再绕过降级：`stale:true` + `last_error:reason`、保留原 `observed_at`、`list_latest_success_by_instance` 只取 `stale=false` 的反雪崩约束原样保留。
    - 新增真断言（走真实 `refresh()` 路径，非 mock 返回值）：unit `tests/unit/scheduler/refresh-service.test.ts:289-317` 断言 `observationStore.inserted[0].stale === true` 且 `last_error === reason`；integration `tests/integration/scheduler/refresh-service.test.ts:1703-1791` 断言 `execute_connector` 未被调用 + `inserted` 恰好 1 条 stale 副本（`provider`/`account_id`/`stale`/`last_error`）+ `runtimeStore` 为 `failed`。第 1 轮「注释自称覆盖 AC-004 却只验 status/error」的问题消除。
    - 回归确认：既有同路径用例（unit `refresh-service.test.ts:600-640`、`:641-680`；integration `refresh-service.test.ts:1645`、`:1759`、`AC-004: failure path copies only recent successful observations`）全部通过，抽取未改变采集失败路径行为。
- **t535_test_f002（minor）→ 已修**：`tests/unit/session/flowercloud_dom.test.ts:23-64` 用 `ProbedWindow` 取代旧的 `revealed`/`present_for_capture`/`reveal` 死脚手架（死字段与死方法已删除，`git grep flower_needs_user` 全仓零引用），新增 `:200-217`「never surfaces the capture window (AC-001)」断言 `show`/`showInactive`/`setOpacity` 计数均为 0。属真实负向守卫（若生产以类型逃逸或接口回退方式调用即红），非恒真断言。
    - 残余（保留为 minor 提示，不阻断）：`src/main/index.ts` 的宿主窗口层（采集窗 `show:false` 的创建实现）仍无断言；`ProbedWindow` 探针在 `SessionWindow` 已删除前台化方法后只能防「cast 型回归」。AC-001 的不可见性仍主要靠接口删除这一结构性保证。
- **t535_test_f003（minor）→ 已修**：`tests/unit/session/flowercloud_dom.test.ts:223-235` 补 `flower_failure_reason` 的 `it.each`，覆盖全部 8 个 `FlowerPageKind`（cloudflare/login/blocked/empty/cancelled/other/usage/overview），与 `flowercloud_dom.ts:164-190` 的 switch 分支一一对应；`:237-258`「reports the blocked reason for an Error 1020 page」走真实页面分类（`flower_page_kind` 命中 `blocked`）而非 mock 字符串透传。AC-003 的「访问受限」分类链路已有证据。
    - 残余（保留为 minor 提示，不阻断）：`loadURL` 网络失败仍归为 `kind:"other"` → 「花云页面未出现用量数据」，与 AC-003 枚举的「网络失败」未做区分，也没有断言；这属实现/规格对齐问题（第 1 轮已提「先与实现方确认分类」），非测试覆盖缺口本身。

### 改测方向复核

- 本轮无「迁就实现」的改测：三处改动分别为「提取共享函数 + 补 AC 断言」「删除死脚手架 + 加负向探针」「补分类表单测」，断言强度净增（`stale`/`last_error` 精确值、计数为 0、8 分类枚举），未见就地放宽既有断言。
- 全量 diff 危险模式扫描：无 `.skip`/`.only`/`eslint-disable`/`@ts-ignore`/恒真断言/注释断言/阈值掩盖。

### Round 2 新发现

- 无 important / critical。上述两条残余均为 minor 提示（host 层负向守卫、网络失败分类对齐），不构成阻塞。

### 验证命令与结果

- `pnpm test`（全量，node linker）→ **339 passed | 1 skipped（340 files），4231 passed / 8 skipped（4239）**，与实现方自述一致。
- `pnpm exec vitest run`（flowercloud_dom + unit/scheduler refresh-service + integration/scheduler refresh-service，verbose）→ 3 files / 84 tests 全绿；逐名确认新增用例确实被收集并通过：`never surfaces the capture window (AC-001)`、`maps {cloudflare,login,blocked,empty,cancelled,other,usage,overview} to a readable reason`、`reports the blocked reason for an Error 1020 page`、`marks the previous observations stale when the capture fails`、`marks stale observations when the flowercloud page capture fails (t535 AC-004)`。
- `pnpm typecheck` → 通过；`pnpm exec eslint <三个改动测试文件> --max-warnings=0` → 通过；`pnpm exec prettier --check`（改动测试文件 + 两个生产文件）→ 全部符合。
- 未运行任何弹窗 / 抢焦点 / 重启类命令。

### 结论（Round 2）

- 前轮 finding 复核：f001 已消除（实现 + 双层断言，真修）；f002 / f003 已消除（残余降为 minor 提示，非阻塞）。
- 本轮新发现：0 条 important / critical；minor 提示 2 条（见上表残余）。
- AC 覆盖矩阵（Round 2）：AC-001 有（负向探针 `flowercloud_dom.test.ts:200-217` + `{hidden:true}`；host 层仅结构性保证）；AC-002 有（force 透传 + 手动刷新失败语义）；AC-003 有（cloudflare/login/blocked/empty/cancelled/other 均有真实分类断言，网络失败分类对齐待实现方确认）；AC-004 有（`lastSuccess` + `stale`/`last_error`，unit + integration 双层）；AC-005 有；AC-006 有；AC-007 `[deploy]` 按 spec 如实声明且无假冒覆盖。
- 总体判断：第 1 轮的唯一 important 缺陷已从实现与测试两侧闭合，全量门禁（`pnpm test` / `typecheck` / `eslint` / `prettier`）独立复跑通过，无未解决 critical / important。
- 系统性 follow-up：无。

verdict: PASS

## Round 3（2026-09-29 22:38 UTC+8，定向复核）

- round：3
- diff_anchor：`56c01c1be881a2e834248aa11ad849d1b2a70ec3`（不变）
- reviewed_scope（Round 3，只审本轮改动）：`git diff 56c01c1be881a2e834248aa11ad849d1b2a70ec3`，全量 diff md5 `2047e094c03a0bc7800a67dbd62fcc68`；最后写入 22:35:40，复核期间稳定。
    - `src/main/core/session/flowercloud_dom.ts`（md5 `3f4ca4276b18f7b94ed6303de4036d77`，22:35:10）：`FlowerPageKind` 增 `"network"`（:44）、`flower_failure_reason` 增分支 `:175-176`（「花云页面加载失败（网络或超时）」）、`run_flowercloud_snapshot` catch 由 `kind:"other"` 改 `kind:"network"`（`:423-432`）。
    - `tests/unit/session/flowercloud_dom.test.ts`（md5 `3419036fc4417118e5ff94786f4ffe1c`，22:35:10）：`it.each` 增 `["network","网络"]`（`:231`）；新增 `:238-257`「reports a network reason when loading the page fails」（`window.loadURL` reject `net::ERR_FAILED`，走真实 catch）。
    - `docs/specs/flowercloud_usage.md`（md5 `f77424370afd5dc2971e841c2efe96b2`，22:35:40）：失败原因分类补 `network`、§5 测试落点表补 `tests/integration/scheduler/refresh-service.test.ts` 与 unit 新用例说明。
    - 其余文件哈希与 Round 2 一致（`session-manager.ts` `5baeadc1…`、`refresh-service.ts` `6abe029f…`、`index.ts` `83fe0848…`、`session-manager.test.ts` `4785514747…`、unit/scheduler `3b468de6…`、integration/scheduler `2c976611…`），未受本轮影响。

### 定向核查

- 分类可达性：`"network"` 只由 `run_flowercloud_snapshot` 的 catch 产生，`flower_page_kind`（`:125-154`）不会返回它；`grep -rn FlowerPageKind` 未发现其它穷尽 switch（`flower_needs_user` 已在 Round 2 前删除），`pnpm typecheck` 通过。
- 断言真实性：新用例在旧实现上必红（旧 catch 返回 `"other"`，`expect(outcome.kind).toBe("network")` 失败），是真回归守卫而非事后适配；`it.each` 现覆盖全部 9 个 `FlowerPageKind`，与 `flower_failure_reason` switch 分支一一对应。
- 危险模式：本轮 diff 无 `.skip`/`.only`/恒真/注释断言/静默抑制。
- AC-003 对齐：四类原因（cloudflare 需验证 / login 需登录 / blocked 访问受限 / network 网络失败）至此均有实现 + 真实分类断言，Round 2 的「网络失败未独立分类」残余消除。

### Round 3 新发现

#### t535_test_f004 - catch 一刀切标成「网络或超时」：取消/抢占竞态与本地存储异常被误报

- 严重度：minor
- 锚点：AC-003（失败原因需可解释）；行为缺陷：快照窗在进行中被用户「网页登录」抢占销毁、或本地 vault/cookie 读写抛错时，用户看到的原因是「花云页面加载失败（网络或超时）」。
- 位置：`src/main/core/session/flowercloud_dom.ts:423-432`（catch 未判 `is_cancelled()`）；对照 `src/main/core/session/session-manager.ts:626-630`（`cancel()` 置 `cancelled` 并 `window.close()`）、`flowercloud_dom.ts:242,262,269`（`vault.get`/`vault.set` 异常会冒泡进该 catch）；测试缺口 `tests/unit/session/session-manager.test.ts:1694`（交互登录抢占用例只 `toMatchObject({ok:false})`，不校验 `reason`）。
- 问题：
    - 取消竞态：`poll_flower_usage_html` 的守卫在 `await window.read_html()` **之前**，`cancel()` 可以在 await 期间关闭窗口；真实 Electron 下 `executeJavaScript` 于 webContents 销毁后 reject，异常直达 catch，因 catch 不判 `is_cancelled()`，本轮 `kind` 变成 `"network"` → `session-manager.ts:651` 给出「网络或超时」，而非「花云抓取被取消」。
    - 非网络异常：`session.get_cookies`、`seed_partition_cookies`、`flower_snapshot_url`、`write_flowercloud_html`（`vault.get`/`vault.set` 未包 try）抛错同样被标成 page-load/网络失败，与 `docs/specs/flowercloud_usage.md` 的分类描述（`network` → 页面加载失败）不符。
    - 新增用例只覆盖 `flowercloud_dom.test.ts:238-257` 的 `loadURL` reject，上述两类无用例；catch 注释 `:424-425` 自述覆盖「网络、超时、页面被销毁等」，即口径本身包含销毁。
- 建议：最小修复——catch 内先 `if (is_cancelled()) return { written: false, kind: "cancelled" };`，对 vault/cookie 一类非页面异常保留 `other`（或另立分类）；补一条「读取期间窗口被销毁/取消 → 不报 network」的用例（现有 `MockWindow.read_html` 在 `closed` 时 reject，可直接模拟）。若维护方认可「catch 即 network」口径，至少在 docs 与注释里写明该口径覆盖非页面异常，并用一条用例把口径锁死。

### 验证命令与结果（Round 3）

- `pnpm exec vitest run tests/unit/session/flowercloud_dom.test.ts tests/unit/session/session-manager.test.ts tests/unit/scheduler/refresh-service.test.ts --reporter=verbose` → 3 files / 105 tests 全绿；逐名确认 `maps network to a readable reason`、`reports a network reason when loading the page fails` 通过。
- `pnpm typecheck` → 通过；`eslint`（`flowercloud_dom.ts` + 其测试）→ 通过；`prettier --check`（两个源文件 + `docs/specs/flowercloud_usage.md`）→ 通过。
- 按定向复核要求未重跑全量（Round 2 全量 339 files / 4231 passed 已绿，本轮仅动上述 3 文件）。未运行任何弹窗/抢焦点命令。

### 结论（Round 3）

- Round 2 残余复核：AC-003「网络失败未独立分类」已消除（分类 + 文案 + 真实 catch 用例 + docs 落点齐备）；f001 / f002 / f003 无回退，相关文件哈希未变。
- 本轮新发现：1 条 minor（f004），不阻断。
- 未解决 critical / important：无。
- 总体判断：定向改动方向正确、断言为真回归守卫、门禁（typecheck/eslint/prettier + 相关单测）通过，仅剩 catch 分类过宽这一 minor；测试侧可放行。
- 系统性 follow-up：无。

verdict: PASS

## Round 4（2026-09-29 22:40 UTC+8，定点复核 t535_test_f004）

- round：4
- diff_anchor：`56c01c1be881a2e834248aa11ad849d1b2a70ec3`（不变）
- reviewed_scope（Round 4，只审 f004 修复面）：`git diff 56c01c1be881a2e834248aa11ad849d1b2a70ec3`，全量 diff md5 `69db319c76032388ad4a275ff1a2b00d`；最后写入 22:38:16，复核期间稳定（22:39:24 复核无新写入）。
    - `src/main/core/session/flowercloud_dom.ts`（md5 `dbd867a0a0d4d6c72f37e1a07aa14590`）：catch 内 `:432` 先判 `is_cancelled()` → `kind:"cancelled"`，其余异常 `:435` 保留 `kind:"network"`；`flower_failure_reason` 的 network 文案改为不主张具体原因——「花云页面抓取失败（加载、网络或会话读取异常）」（`:175-177`，附实现注释说明同一 try 内还含 vault / session 读写）。
    - `tests/unit/session/flowercloud_dom.test.ts`（md5 `41b146ca9114d4feab1e80c3d830d5ad`）：新增 `:261-286`「reports a cancelled reason when the session is torn down mid-capture」（`session.get_cookies` 在 `is_cancelled()` 置真后 reject → 断言 `kind === "cancelled"`、reason 含「取消」）；`loadURL` reject 的 network 用例保留（`:238-258`，断言 `kind === "network"`）。
    - `docs/specs/flowercloud_usage.md`（md5 `916bf2a2421181f99d1c173a6564b597`）：分类描述同步为「`network` → 抓取过程异常（页面加载、网络或会话读写失败，文案不主张具体原因，真实错误在日志）」。
    - 其余文件哈希与 Round 3 一致（`session-manager.ts` `5baeadc1…`、`refresh-service.ts` `6abe029f…`、`index.ts` `83fe0848…`、`session-manager.test.ts` `4785514747…`、unit/scheduler `3b468de6…`、integration/scheduler `2c976611…`）。

### 前轮 finding 复核（Round 4）

- **t535_test_f004（minor）→ 已消除**：
    - 竞态修复正确：`session-manager.ts:634-636` 的 `closed` 处理器在 `window.close()` 时同步置 `state.cancelled = true`，而 await 中的 `read_html`/`executeJavaScript` 在窗口销毁后 reject，因此 catch 内 `is_cancelled()` 为真是真实时序，修复后该路径归 `cancelled`（reason「花云抓取被取消」）而非网络失败。
    - 文案过宽问题以我建议的替代方案收口：`network` 文案不再主张「网络或超时」，与 catch 实际覆盖范围（加载 / 网络 / vault / session 读写）一致，docs 同步；因此「vault 异常被说成网络故障」的误导消除，无需另立分类。
    - 断言真实性：新用例断言 `kind === "cancelled"`（旧实现返回 `network`，必红）与 reason 含「取消」；network 分支用例保留，两条分支互不掩盖。`it.each` 的 `["network","网络"]` 在新文案下仍成立（「加载、网络或会话读取异常」含「网络」）。
    - 回归面：`grep -rn "网络或超时"` 仅剩注释与测试注释，无代码/文案残留；无其它测试依赖旧文案。

### Round 4 新发现

- 无 critical / important / minor。

### 验证命令与结果（Round 4）

- `pnpm exec vitest run tests/unit/session/flowercloud_dom.test.ts tests/unit/session/session-manager.test.ts tests/unit/scheduler/refresh-service.test.ts --reporter=verbose` → 3 files / **106 tests 全绿**；逐名确认 `reports a cancelled reason when the session is torn down mid-capture`、`reports a network reason when loading the page fails`、`maps network to a readable reason` 通过。
- `pnpm typecheck` → 通过；`eslint`（`flowercloud_dom.ts` + 其测试）→ 通过；`prettier --check`（两个源文件 + `docs/specs/flowercloud_usage.md`）→ 通过。
- 按定点要求未重跑全量（Round 2 全量 339 files / 4231 passed 已绿；本轮仅动上述 3 文件）。未运行任何弹窗/抢焦点命令。

### 结论（Round 4）

- 前轮 finding 复核：f001 / f002 / f003 无回退（相关文件哈希未变）；f004 已消除，无「换形式弱化」（新用例提高而非放宽断言，文案改动与实现覆盖范围对齐）。
- 本轮新发现：0 条。
- 未解决 critical / important / minor：无（唯一保留的可选建议见下）。
- 未进表的提示（可选）：新用例用 `session.get_cookies` reject + `is_cancelled()` 置真来覆盖 catch 的取消分支，与真实竞态的时序一致但未直接用「`read_html` 在 `close()` 后 reject」复现；如需更贴近真实窗口竞态，可再加一条基于 `MockWindow.read_html`（closed 时 reject）的用例，属可选强化，非缺口。
- 总体判断：AC-001~AC-006 均有真测试覆盖（AC-007 按 `[deploy]` 如实声明不自动测试），失败分类与文案一致，门禁（typecheck / eslint / prettier / 相关单测）通过，无未解决 finding，测试侧放行。
- 系统性 follow-up：无。

verdict: PASS

## Round 4 scope（final, tip 99499345）

reviewed_scope: 9c7a7ca7ca43a7af
verdict: PASS
