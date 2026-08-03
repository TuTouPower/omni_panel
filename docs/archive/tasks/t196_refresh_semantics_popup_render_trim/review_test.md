# Task review t196（reviewer_focus: 测试）

- task：`t196_refresh_semantics_popup_render_trim`
- spec：`docs/tasks/t196_refresh_semantics_popup_render_trim/spec.md`
- diff_anchor：`9d32603c0c4e4d09d681e8068567157781a5362e`
- target：`git diff 9d32603c0c4e4d09d681e8068567157781a5362e`
- round：1
- reviewed_at：2026-08-04 00:40 UTC+8

验证基线：变更涉及的 7 个测试文件单独跑 75/75 通过；全量 `pnpm test` 203 文件 2088/2089 通过（1 条 skip 为既有，非本 diff）。首轮全量全绿；重跑时既有集成测试 `tests/integration/scheduler/refresh-service.test.ts > preserves lastSuccess across consecutive failures (anti-flicker)` 偶发 5s 超时（单跑通过、4069ms 贴近阈值），为 pre-existing flaky，与本 diff 无关（见结论段）。

## Findings

### t196_test_f001 - AC5 主侧 bulk IPC handler（trend:getBulk）零测试

- 严重度：important
- 锚点：AC5「展开账号一次 IPC 取回全部指标周期 trend 数据……展示结果与之前一致」；spec 测试策略「trend 测试断言单 IPC 返回多周期数据」
- 位置：`src/main/ipc/trend-ipc.ts`（TREND_GET_BULK handler）；测试侧 `tests/unit/ipc/` 无 trend-ipc 测试，smoke/integration/e2e 亦无 getBulk 引用
- 问题：新 channel `TREND_GET_BULK` 的主侧 handler 是全新生产逻辑：periods 逐项映射 `query_trend_series` + `build_trend_series`、`days>0` 取 `Math.floor` 否则默认 7、响应按 `metric_id` 组装。该 handler 无任何直接测试。渲染层测试把 `window.usageboard.trend.getBulk` 整体 mock 掉（合法边界 mock），真实 IPC 契约（请求 → SQLite 查询 → 响应形状）从未被验证：若查询键、days 处理或响应结构出错，AC5「单 IPC 返回多周期数据 / 展示结果与之前一致」会在全部测试通过的情况下静默失败。spec 测试策略明确要求断言「单 IPC 返回多周期数据」，当前交付测试未达。
- 建议：新增 `tests/unit/ipc/trend-ipc.test.ts`：mock `deps.store.query_trend_series`，断言多 period 请求按 `metric_id` 返回对应 series；覆盖 days 缺省/0/负数→7、小数 floor、空 periods→空 series。

### t196_test_f002 - AC5「N 个并行 invoke → 1 个 bulk」未被真实练习

- 严重度：minor
- 锚点：AC5「不再发起 N 个并行 invoke」
- 位置：`tests/unit/renderer/components/provider_account_row.test.tsx:7`（make_account 仅 1 个 period）、`:173` 起 trend 三测
- 问题：`make_account().periods` 只有 1 项，断言 getBulk 恰好调用 1 次与旧实现单周期也调 1 次无法区分；「取回全部指标周期」的 N>1 场景未覆盖，mock 也只回 1 个 metric 的 series。若实现退化为每周期一次 getBulk（N 次），当前测试仍通过。
- 建议：make_account 增加第 2 个 period（不同 `raw_label`），断言 getBulk 以含 2 个 `metric_id` 的 periods 调用 1 次，且两个 series 均渲染。

### t196_test_f003 - use_plugins 两个测试名与断言语义相反

- 严重度：minor
- 锚点：测试可信（命名与断言一致性）
- 位置：`tests/unit/renderer/hooks/use_plugins.test.ts:191`（"keeps reference when items array is equal by value but different reference"）、`:368`（"keeps reference when chart value is unchanged but reference differs"）
- 问题：两处断言已从 `toBe(prev_plugins)` 反转为 `not.toBe(prev_plugins)`（items/chart 新引用 → 更新），与 AC4「引用相等短路」新语义一致，属合法改测（见结论「改测方向复核」）；但两个测试名保留旧深比较语义，与断言直接矛盾，误导读者。
- 建议：改名反映新语义，如 "updates when items array reference differs"、"updates when chart reference differs"。

## 结论

- 前轮 finding 复核（Round 1 无前轮）：N/A
- 改测方向复核：无「迁就实现」式改测。use_plugins 两处 `toBe → not.toBe` 属 AC4 语义变更（JSON 深比较 → 引用短路，task.md 已声明为有意语义变化），方向正确；provider_account_row 三测为 get→getBulk 迁移（AC5）、popup 两测为双镜像→单镜像适配（AC3）、connector-ipc 两测为「立即 ack」强化（AC1），均与已批准 spec 一致。
- 本轮新发现：3 条（f001 important，f002/f003 minor）
- 未进表的提示：全量重跑时既有集成测试 `refresh-service.test.ts > preserves lastSuccess across consecutive failures (anti-flicker)` 偶发超时（单跑 4069ms 通过），pre-existing flaky（真实 sleep 集成测试贴近 5s 阈值），建议 follow-up 排查；route_api.test.ts 未断言 disabled trend 的 getBulk noop（`{series:[]}`），影响面小可略。
- 总体判断：AC1–AC4 覆盖完整且断言真实（刷新立即 ack、per-instance 锁短路、单镜像测高、引用相等短路均有直接测试）；AC5 渲染层覆盖良好，但主侧 bulk handler 为全新生产逻辑且零测试，全绿套件无法证明「单 IPC 返回多周期数据」，存在 1 条未解决 important。
- 系统性 follow-up：建议 follow-up「trend:getBulk IPC handler 测试」，标题「Add unit tests for TREND_GET_BULK handler」，slug `trend_getbulk_ipc_handler_test`，阻断性 non-blocking。

verdict: FAIL

## Round 2 (2026-08-04 01:25 UTC+8)

### 前轮 finding 复核（以 diff 与测试运行为准）

- **t196_test_f001（important，AC5 主侧 bulk handler 零测试）：已消除。** 新文件 `tests/unit/ipc/trend-ipc.test.ts` 直接调 `registerTrendIpc` 注册的 handler（`trend:get` / `trend:getBulk`），mock 边界 `store.query_trend_series`，断言：多 period 请求按 `metric_id` 返回对应 series（`trend-ipc.test.ts:76`）、days 缺省→7 与小数 floor 2.9→2（`:121`）、响应形状 `{ metric_id, series: [{ date, percent }] }`、`trend:get` 映射（`:46`）。实测该文件 4/4 通过。残余缺口仅 days 0/负数与空 periods 未测——0/负数与缺省走同一条 `days > 0 ? floor : 7` 的 else 分支（已覆盖），空 periods 属「可加 case」，不阻断。
- **t196_test_f002（minor，N>1 未练习）：已消除。** `provider_account_row.test.tsx` 新增 N>1 测试（`:213`）：`make_account` 传 2 个 period（raw_label `5h`/`5d`），断言 `getBulk` 恰好 1 次、payload `periods` 含 2 个 `metric_id`、渲染 2 个 `.trend-svg`。TrendSparkline 对 `<2` 有效点渲染 `.trend-sparkline-empty` 而非 svg（`TrendSparkline.tsx:41`），故「2 个 svg」确实验证 bulk 响应按 `raw_label`→`cache_key` 映射成功，非恒真。
- **t196_test_f003（minor，use_plugins 测试名与断言相反）：已消除。** 两测试名改为 "updates plugins when items reference differs" / "updates plugins when chart reference differs"，并补强断言（items `toHaveLength(1)`、snapshot status ready），与新引用比较语义一致。

### 改测方向复核

无「迁就实现」式改测。use_plugins 改名属 AC4 语义澄清（Round 1 已确认）；provider_account_row get→getBulk 为 AC5 迁移；popup_view_height 测高断言从 `typeof number` 收紧为精确值（content 500 / collapsed 120，`popup_view_height.test.tsx:333` 起），方向正确。

### 本轮新发现：1 条

### t196_test_f004 - popup_view_height 两个 spinner 测试的 loading 推送未生效（验证的是 500ms 下限，非 loading 绑定）

- 严重度：important
- 锚点：AC1「手动刷新触发后 UI 立即进入 loading……采集结果经状态推送渐进更新」；f003 code（spinner 绑定真实 pending）
- 位置：`tests/unit/renderer/views/popup_view_height.test.tsx:427`（"keeps the refresh-all spinner while a connector snapshot is loading"）、`:473`（"does not pin the refresh-all spinner on pre-existing loading"）
- 问题：两测重写 `window.usageboard.event.onStateChange` 捕获 push 回调驱动状态，但 push 的 instanceId 用 `"cpa-connector"`，而 fixture `claude_with_accounts`（`popup_view_height.test.tsx:76`）经 `connector()` 默认生成 `instanceId: "gateway-connector"`（source="gateway"，`popup_view_height.test.tsx:58`）。use_plugins 的 onStateChange flush 仅按 `p.instanceId` 匹配更新（`use-plugins.ts:145`），`"cpa-connector"` 不匹配任何实例 → pending 落空 → plugins 永不更新。于是两测中 `push loading` / `push ready` 均不生效：spinner 出现后的「保持」与「清除」全部由 `action_done` 的 `elapsed >= MIN_SPINNER_MS`（500ms 下限）驱动（实测两测 536ms/554ms，恰为下限）。「采集进行中 loading 推送 → spinner 保持」「pre-existing loading 被排除、不钉死」两个声称验证的语义实际未触达：若实现回归为「loading 期间提前清 spinner」或「pre_loading 未排除导致钉死」，两测仍 PASS。
- 建议：push 改用实际实例 id（"gateway-connector"），或调整 fixture 使 instanceId 与 push 一致（如 `connector({ source: "cpa" })`），让 loading 推送真正落入 plugins 状态；再断言「push loading 后 spinner 在超过 500ms 下限后仍保持」「点击前 push loading 被 pre_loading 排除后 spinner 500ms 内清除」。

### 结论

- 前轮 finding 复核：f001/f002/f003 均已按 diff 消除（真修，非换形式弱化）
- 改测方向复核：无
- 本轮新发现：1 条（f004 important）
- 未进表提示：trend-ipc 未覆盖 days 0/负数（与缺省同 else 分支）与空 periods→空 series；route_api.test.ts 仍未断言 disabled trend 的 getBulk noop（Round 1 已提，影响面小）；smoke `renderer-smoke.test.tsx:74` 的 "spinning while refreshAll is pending" 在新「立即 ack」语义下实际依赖 500ms 下限（resolve 前只断言到 ~0ms，未暴露），属 pre-existing，可观察
- 总体判断：前轮 3 条已消除，但本轮新增 f004（important）显示 spinner 绑定 loading 的新测试未触达被测语义，AC1/f003 code 的「loading 由状态推送驱动」仍缺直接证据，存在 1 条未解决 important
- 系统性 follow-up：无

verdict: FAIL

## Round 3 (2026-08-04 01:45 UTC+8)

### 前轮 finding 复核（以 diff 与测试运行为准）

- **t196_test_f004（important，spinner 两测 loading 推送落空）：已真修。** 三条证据：
    1. **push instanceId 修正**。两测 push 均改 `"gateway-connector"`（`popup_view_height.test.tsx:472`、`:512`），与 fixture `claude_with_accounts` 经 `connector({source:"gateway"})` 生成的 `instanceId: "gateway-connector"`（`:58`、`:76`）匹配；use_plugins 的 onStateChange flush 按 `p.instanceId` 匹配更新（`use-plugins.ts:145`），loading 推送真正落入 plugins 状态。
    2. **rAF stub 改 macrotask 根除 `raf_handle` 残留**。`vi.stubGlobal("requestAnimationFrame", cb => { setTimeout(() => cb(performance.now()), 0); return 1; })`（`:144-149`）。同步 stub 下 `raf_handle = requestAnimationFrame(cb)` 赋值语句中 cb 被同步执行（先把 raf_handle 置 undefined 再 flush），随后返回 1 覆盖 → `raf_handle=1` 残留 → 后续 push 被 schedule dedup（`use-plugins.ts:157-160`）静默吞掉；macrotask 让回调异步执行，flush 后 raf_handle 重置为 undefined，后续 push 可再调度。`push` + `await setTimeout(0)` 包在 `act` 内（`:471-474`、`:511-514`），flush 落回 act 内，确定性冲洗快照。
    3. **断言双向敏感，非假绿**。测试 1「超过 500ms 下限 700ms 后仍 spinning」（`:475-477`）：若 loading 推送落空，500ms check timer（`PopupView.tsx:502`）即判 `action_done` → `setRefreshing(false)` 清 spinner，700ms 断言失败；只有 loading 真实保持（`any_new_loading`，`PopupView.tsx:446-449`）才过。测试 2「点击前 push loading 被 pre_loading 排除，3s 内 spinner 清除」（`:526-531`）：若 pre_loading 排除逻辑失效，`any_new_loading` 恒 true → spinner 钉死至 60s 兜底，3s waitFor 超时失败。两测互补，分别证明「loading 保持」与「pre_loading 排除」，正对 f003 code 语义。
- 实测：`popup_view_height.test.tsx` 9/9、`use_plugins.test.ts` 11/11、`popup_view_mirror.test.tsx` 2/2、`provider_account_row.test.tsx` 15/15、`trend-ipc.test.ts` 4/4，全绿。

### 危险模式扫描（全 diff）

无恒真断言、无删/反转 expect、无注释掉断言、无 `.skip`/`.only`、无新增 `eslint-disable`/`@ts-ignore`、无弱化断言。`push?.()` 的 optional chaining 不构成条件跳过：render 后 use_plugins 的 useEffect 必然注册 onStateChange（RTL render 包 act，effect 同步执行），push 必被赋值；即便未赋值，测试 1 的 700ms 断言会失败（spinner 被 500ms 下限清除），不假绿。`fireEvent.click` 为真实点击，push 为模拟 preload 边界 IPC 推送（合法边界 mock）。

### rAF stub / afterEach 风险核验

- `afterEach(() => vi.unstubAllGlobals())`（`:129-133`）恢复全局 stub，防止泄漏到同 worker 其它文件；vitest 默认文件级隔离，恢复仅影响本文件，且 afterEach 在断言失败时也执行，无残留风险。
- 同文件其它 7 个既有测试受 macrotask rAF stub 影响：height report 由 `use_popup_height_report`（useLayoutEffect + ResizeObserver）驱动，不依赖 rAF 时序；实测 9/9 通过，无回归。
- 残余观察：单跑两 spinner 测试仍有 2 条「update not wrapped in act」警告，来源为 render 后 reload 异步 `setPlugins` 在 act 外（既有现象，非 f004 引入）；React 18 act 外 setState 仍同步 flush DOM，700ms / 3s 等待充足，断言时序稳定，不构成 flaky 源。

### 结论

- 前轮 finding 复核：f004 已消除（真修，非换形式弱化；`action_done` 语义由双向敏感断言直接覆盖）
- 改测方向复核：无
- 本轮新发现：0 条
- 未进表的提示：act 警告（render 后 reload 异步 setState 在 act 外，既有，不影响断言时序，可留待测试基建 follow-up）；测试 2 的 `waitFor` 3s 可收紧至 ~1.5s 缩短慢测时长（可选优化，非阻断）
- 总体判断：f004 已按 diff 与实测真修，AC1 / f003 code「loading 由状态推送驱动」现由双向敏感断言提供直接证据，无未解决 critical / important
- 系统性 follow-up：无

verdict: PASS
