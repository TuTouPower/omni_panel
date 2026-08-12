# Task review t312（reviewer_focus: 测试）

- task：`t312_token_stats_header_single_row`
- spec：`docs/tasks/t312_token_stats_header_single_row/spec.md`
- diff_anchor：`e2039aacd962f382f294ea4abc6fb98bb5029d7e`
- target：`git diff e2039aacd962f382f294ea4abc6fb98bb5029d7e`
- round：1
- reviewed_at：2026-08-11 22:00 UTC+8

## Findings

### t312_test_f001 - 刷新按钮两条测试因果倒置且间歇 flake（critical）

- 严重度：critical
- 锚点：AC-004「刷新按钮触发刷新」与 AC-001「刷新时间（刷新中）」的测试验证了假行为——通过路径不依赖点击本身（删除刷新按钮 onClick 测试仍通过），失败路径反而因按钮正常工作而超时
- 位置：`tests/unit/renderer/views/token_stats_header.test.tsx:170-188`（AC-001 刷新中）、`:283-295`（AC-004 刷新部分）
- 问题：
    - 测试假设「updated_listener 只置脏缓存、点击刷新是唯一重取触发源」，但 `src/renderer/views/TokenStatsView.tsx:474-499` 的 onUpdated 处理本身就会触发一次后台重取：`query_cache.mark_stale()` + `set_preset_range_revision(+1)` → currentRange 变化（新 range key）→ `loadData` effect（`:400-402`）重发请求。
    - 由此 get_dashboard 调用次数是 2 还是 3，取决于事件重取在点击前是否完成：
        - 事件重取先完成 → 点击命中 fresh cache（`:322-327` 缓存命中分支）→ 不发请求 → `toHaveBeenCalledTimes(2)` 通过。此时点击没有产生任何可观察效果；若删除刷新按钮 onClick，测试照样通过 → AC-004「刷新按钮触发刷新」实际未获验证。
        - 事件重取未完成 → 点击产生第 3 次请求 → `toHaveBeenCalledTimes(2)` waitFor 超时失败。
    - 实测复现：全量 `npx vitest run tests/unit` 时 AC-001「刷新中」失败；单文件连跑 5 次时 AC-004 失败 1 次。两条均间歇 flake。
    - AC-001「刷新中」同根因：`mockReturnValueOnce(pending)` 被事件重取（第 2 次调用）消费，点击的请求（第 3 次，default mock 立即 resolve）很快把 `refreshing` 置回 false，`findByTestId("token-stats-refreshing")` 与请求完成竞速。
    - 净效果：两条测试只在刷新按钮「坏掉」时稳定通过，按钮正常时反而 flake——断言因果与实现行为倒置。
- 建议：让点击的因果可确定地断言。例如：mount 后先 fire 事件并 `waitFor` 事件重取完成（缓存变 fresh），再验证「fresh 缓存下点刷新不产生新请求」（调用次数不变）——该路径可确定；另一用例 mock 事件重取为 pending、点击的请求返回唯一 payload，断言点击后 UI 呈现该 payload（证明点击确实触发了请求且结果上屏）。核心是把「事件自身重取」与「点击重取」分开断言，避免合并进一个精确计数。

### t312_test_f002 - AC-003「1月/30d」下拉选择无直接用例（minor）

- 严重度：minor
- 锚点：AC-003「时间范围下拉选择『24小时/7天/1月』生效」——30d 选择路径无直接测试
- 位置：`tests/unit/renderer/views/token_stats_header.test.tsx:246-260`（仅 7d 用例）；`tests/unit/renderer/views/token_stats_view.test.tsx:934`（t229 测试标题含 30d 但实际只选 7d）
- 问题：24h（t229 `token_stats_view.test.tsx:973-980`）与 7d 有直接选择用例，30d 无。30d 是默认 preset（挂载即发 30d 窗口查询），选择机制与 7d 完全相同，属「覆盖可更广」而非缺 AC。
- 建议：补一条 `selectOptions(时间范围, "30d")` 断言窗口 30 天 / 默认 gran day；不阻断。

## 结论

- 前轮 finding 复核：无（Round 1）
- 改测方向复核：无迁就实现的改测。`token_stats_view.test.tsx` 10 处交互由 Segmented click 改 `selectOptions`，断言预期（调用次数、查询参数、UI 内容）全部未变；Grok 入口断言由 `role=button` 改为查工具下拉 option，语义等价（Segmented→Select 控制形态变化所致），非实现驱动。
- 本轮新发现：2 条
- 未进表的提示：
    - `tests/unit/main/scripts/designmd.test.ts:129` drift 门禁失败（globals.css 导出区 vs DESIGN.md）——与 t312 diff 无关（t312 未改 globals.css/DESIGN.md），为 diff_anchor 上既有失败，范围外，建议主仓另行核查。
    - AC-003 自定义用例以 `fireEvent.change` 代替 `userEvent.selectOptions`：jsdom 下 selectOptions 会在 change 后补发 click（真实浏览器无此行为），点击落在 RangePicker 之外触发「点击外部关闭」，属合理变通（测试注释已说明），非危险模式。
    - AC-001 updatedAgo（刷新时间文本）无直接断言：mock 数据 `status.last_updated=null`，仅「刷新中」状态被断言；覆盖可更广。
- 总体判断：f001 为 critical——AC-004 刷新子句与 AC-001 刷新中状态的测试验证了假行为且间歇 flake，须修复后走完整下一轮审阅；f002 为 minor。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：re_verified——单行结构/四个下拉/四个按钮/Select 非 Segmented/下拉选项内容均实测通过（`npx vitest run tests/unit/renderer/views/token_stats_header.test.tsx`）；「刷新中」用例受 f001 影响间歇失败，结构部分断言可信。
- AC-002：re_verified——工具/平台过滤用例断言 get_dashboard 查询参数（`agent: "claude-code"` / `platform: "wsl"`），实测通过。
- AC-003：re_verified——7d 用例断言窗口 7 天 + gran day；自定义用例经真实 RangePicker（未 mock）弹出、应用后按自定义范围查询且下拉保留「自定义」，均实测通过；30d 子句缺口见 f002（minor）。
- AC-004：re_verified——设置/用量面板/会话历史三个导航按钮断言对应 IPC mock 调用（settings.open / tray.open_panel / sessionHistory.open("","","")），实测通过；「刷新按钮触发刷新」子句的测试可信度被 f001 阻断（critical），当前无法证明按钮点击触发刷新。
- AC-005：re_verified——既有 33 用例适配后全绿（`npx vitest run tests/unit/renderer/views/token_stats_view.test.tsx`）；全量单测 1 失败为与 t312 无关的既有 designmd drift 门禁。

coverage = 5/5（AC-004 刷新子句的测试可信度被 f001 阻断，见上；其余子句均独立复核）

reviewed_scope: 0b1e647840714af2
verdict: FAIL

## Round 2 (2026-08-11 21:45 UTC+8)

### 前轮 finding 复核（以 diff 与生产代码实测为准）

- **t312_test_f001（critical，刷新按钮测试因果倒置+flake）：已消除。** diff 重构为三条确定路径，逐段对照生产代码验证因果链（`TokenStatsView.tsx` loadData:302-397 / onUpdated:473-498、`query-cache.ts:77-110`）：
    - AC-001「刷新中」改事件 pending 驱动：`updated_listener?.(1)` → `mark_stale` + revision bump → `loadData` 重发，第 2 次调用消费 never-settle promise，`refreshing` 保持 true。range key 相同（peek 命中 stale，:329）与不同（cache miss，:332）两分支均确定置 refreshing；不点按钮，无竞速。
    - AC-004 拆两条确定路径：① fresh 缓存点刷新——事件重取完成（waitFor calls=2）后点刷新，`query_cache.load` fresh 短路（`query-cache.ts:80-82`）不调 fetcher，calls 保持 2；② stale 缓存点刷新——事件重取 reject（entry 保持 stale / 不建新 entry）后点刷新重新请求（call 3），`apply_query_data` 使新数据上屏，断言 session-records "after"。点击均发生在 `waitFor(calls=2)` 之后，无「点击 vs 事件重取」竞速。
    - SessionTable mock 改渲染 `rows[0].session_id`：数据流经真实 `dashboard_session_rows` → `currentSessionItems`，mock 只简化渲染不 mock 逻辑，断言真实数据更新。
    - 实测：`token_stats_header.test.tsx` 12/12 连跑 3 次稳定通过；`tests/unit/renderer/views` 全目录 16 文件 175/175。
- **t312_test_f002（minor，30d 无直接用例）：已修。** 「AC-003: 挂载默认即 1月（30d）窗口」断言挂载首请求窗口 30 天（`end-start = 30*24*3600000`，与 `presetRange` 的 `PRESET_MS["30d"]` 一致）、gran day（`effective_granularity` 非 24h 返回 gran，`TokenStatsView.tsx:114-121`）、下拉值 30d；符合建议方向（30d 为默认 preset，选择不产生新请求，改断言挂载即 30d）。

### 改测方向复核

无迁就实现的改测。`token_stats_view.test.tsx` 10 处交互由 Segmented click 改 `selectOptions`，断言预期（调用次数、查询参数、UI 内容）全部未变；新用例断言与生产路径逐段对应。

### 本轮新发现

0 条。

### 未进表提示

- 「刷新失败」标记（error 状态 role=status）：「缓存失效后点刷新」用例实际触发 reject → `setError` 路径，但未断言失败标记渲染；与 Round 1 未进表提示的 updatedAgo 无直接断言同类，属覆盖可更广。
- 「刷新中」用例的 never-settle pending promise 在测试结束后仍挂起：vitest 不报未处理 promise，无泄漏、非 flake（连跑验证），仅依赖「pending 不 settle → refreshing 保持」的确定性。
- 契约区 drift（平台选项文字「全平台/Win/WSL」→「全平台/Local/WSL」）：为 code f001 处置，已随 `spec.md` diff 落实，非未经确认的 AC 变更，对测试覆盖无影响。

### 总体判断

前轮 critical（f001）与 minor（f002）均按建议方向真修，未发现换形式弱化；新用例因果链经生产代码逐段验证且实测稳定。本轮无未解决 blocker，PASS。

### AC 复验方式（Round 2）

- AC-001：re_verified——单行结构/四个下拉/四个按钮/Select 断言与「刷新中」事件 pending 用例，`token_stats_header.test.tsx` 12/12 连跑 3 次通过。
- AC-002：re_verified——工具/平台过滤用例断言 `get_dashboard` 查询参数（`agent: "claude-code"` / `platform: "wsl"`），views 目录 175/175 通过。
- AC-003：re_verified——7d 用例（窗口 7 天 + gran day）、30d 挂载默认用例（与 presetRange/effective_granularity 实现逐值核对）、自定义用例经真实 RangePicker 弹出、应用后按自定义范围查询且下拉保留「自定义」。
- AC-004：re_verified——刷新子句三条用例因果链逐段对照 loadData/query_cache/onUpdated 实现并实测通过；设置/用量面板/会话历史三按钮断言对应 IPC mock 调用。
- AC-005：re_verified——views 目录 16 文件 175/175（含 `token_stats_view.test.tsx` 33 个适配用例）；全量 2912 passed 中唯一失败为既有 designmd drift（diff_anchor 上既有、与 t312 无关）。

coverage = 5/5

reviewed_scope: 1b70c897e5bb3a9e
verdict: PASS

## Round 3 (2026-08-11 22:00 UTC+8)

- round：3
- reviewed_at：2026-08-11 22:00 UTC+8
  reviewed_scope: 5b4df3aadbd8d856

指纹说明：Round 2 后变更 = code 侧 f003 修复（PanelTitleBar 面板形态化简）与 WindowControls 注释清理（移除审查编号溯源文本），均无测试语义影响；按 `check_review_status.py` 同口径重算当前 diff 指纹为 `5b4df3aadbd8d856`。

### 前轮 finding 复核

t312_test_f001（critical）/ f002（minor）结论维持（Round 2 已核真修，本轮 diff 未触碰测试文件断言）。code 侧 f001/f002/f003 由 code reviewer 复核，test 视角无新增风险。

### 本轮新发现

无（0 条）。

### 结论（Round 3）

- 测试断言本轮零改动；全量验证沿用 Round 2（views 目录 16 文件 175/175、header 12/12 连跑稳定、全量 2912 passed / 1 存量 designmd）。
- 总体判断：无未解决 critical/important/minor，PASS。
- 系统性 follow-up：无。

verdict: PASS
