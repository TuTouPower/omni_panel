# Task review t191（reviewer_focus: 测试）

- task：`t191_tokenstats_dashboard_query_api`
- spec：`docs/tasks/t191_tokenstats_dashboard_query_api/spec.md`
- diff_anchor：`b52b249ef91ff14afbef76e33216e13c6566d581`
- target：`git diff b52b249ef91ff14afbef76e33216e13c6566d581`
- round：Round 1
- reviewed_at：2026-08-03 13:39 UTC+8

## Findings

### t191_test_f001 - Dashboard 聚合没有独立 raw oracle

- 严重度：important
- 锚点：AC2；测试策略要求使用完整 raw records 基准核对
- 位置：`tests/unit/main/core/token-stats/token_stats_dashboard.test.ts:42-83,112-176`
- 问题：新增 store 测试直接写死 `tokens/sessions/calls`、chart 合计和 alias 结果，只核对少量字段；没有从同一批 raw records 在测试侧独立计算 current/previous、metric、时间桶、项目/会话轴、热力图和 top/other 结果。覆盖仅有一个固定窗口，未覆盖 24h、7d、30d 和自定义范围的完整面板基准。查询 SQL 若出现漏行、错误去重、错误桶边界或聚合维度漂移，测试可能仍按实现挑选出的少量期望通过。
- 建议：用测试侧独立 reducer 作为 raw oracle，针对 24h、7d、30d、自定义范围以及 agent/platform 组合，逐区域比较完整 DTO；保留边界记录和高密度记录，并同时校验 current/previous。

### t191_test_f002 - Renderer 测试没有观察 KPI 与 delta

- 严重度：important
- 锚点：AC1、AC2；主请求必须驱动当前面板全部可观察区域
- 位置：`tests/unit/renderer/views/token_stats_view.test.tsx:18-25,170-182`
- 问题：`MetricDonut` mock 丢弃全部 props，`uses one bounded dashboard request and renders all dashboard sections` 只断言 session、BarChart 和 Heatmap，未断言 `current`/`previous` 产生的 KPI、delta、donut 数值。即使 renderer 忽略 current/previous，或把 delta 显示成错误窗口数据，该测试仍会通过，标题所称“all dashboard sections”没有证据。
- 建议：mock 组件保留并断言 MetricDonut 的 center/value 与 delta props，至少覆盖 current/previous token、calls、sessions 及缓存率/工具占比等当前可见 KPI；不要用空组件吞掉关键可观察输出。

### t191_test_f003 - IPC 失败响应和 DTO 运行时校验没有测试

- 严重度：important
- 锚点：AC6；IPC/DTO 测试策略要求覆盖错误包装、输入校验和 DTO 透传
- 位置：`tests/unit/ipc/token-stats-ipc.test.ts:119-203`；`tests/unit/shared/token_stats_dashboard.test.ts:35-98`
- 问题：IPC 测试只覆盖非法 query、合法 query 和合法 DTO。没有让 `query_dashboard` 抛异常并断言 `QUERY_FAILED`，也没有返回缺字段、负数、超长数组或非法 nested enum 的 DTO 并断言 `INVALID_RESPONSE`。shared schema 测试仅验证一个合法 DTO，不能证明运行时拒绝非法 DTO；因此关键错误路径可能被改成抛出未包装异常或把坏 DTO 透传，测试仍通过。
- 建议：在 IPC 层增加 store throw、malformed DTO、越界数组/负值/错误 enum 的用例，断言稳定错误 code/message、store 调用次数和无泄漏；schema 层补齐 query/DTO 边界拒绝用例。

### t191_test_f004 - 会话分页只有 store 单测，没有真实 renderer 交互覆盖

- 严重度：important
- 锚点：AC5；会话明细须在展开或翻页时按需取得
- 位置：`tests/unit/main/core/token-stats/token_stats_dashboard.test.ts:210-240`；`tests/unit/renderer/views/token_stats_view.test.tsx:33-36,238-251`
- 问题：store 测试直接传 `session_offset/session_limit`，只能证明手工调用接口时返回一页；renderer 中的 `SessionTable` mock 只接收 `rows`，没有接收或触发 `onPageChange`，也没有点击“下一页”后验证第二次 `getDashboard` 携带新 offset。用户翻页事件即使不发请求、重复第一页或请求错误 offset，现有测试仍通过。
- 建议：保留真实 `SessionTable` 或在 mock 中暴露翻页按钮并回调 `onPageChange`，点击下一页后断言主 DTO 请求、offset、返回页数据和 `has_more`；覆盖空页/最后一页边界。

### t191_test_f005 - 旧响应竞态测试被删除且没有等价替代

- 严重度：important
- 锚点：AC1、AC3；筛选切换后当前面板不得被旧 query 响应覆盖
- 位置：`tests/unit/renderer/views/token_stats_view.test.tsx:201-220`；diff 删除原 `ignores an older platform response after a faster switch` 测试
- 问题：现有 `keeps the previous DTO visible during a dashboard refresh` 只有一个 pending 请求，验证不到 out-of-order response。具体场景：all 请求延迟，切换 WSL 后 WSL 请求先返回并展示，随后 all 请求返回；若 request generation/cache guard 失效，旧 all DTO 会覆盖 WSL 面板，现有测试仍 PASS。diff 删除了原来专门验证该场景的测试，没有新增等价测试。
- 建议：保留并迁移旧竞态用例到 `getDashboard`：按 query.platform 返回两个 deferred promise，先 resolve 新筛选，再 resolve旧筛选，断言最终 session、chart、heatmap 和 KPI 均属于新筛选。

### t191_test_f006 - AC4 的响应规模增长关系未被性能测试验证

- 严重度：important
- 锚点：AC4；数据量应随桶/聚合分组增长，不随 per-message records 线性增长
- 位置：`tests/unit/main/core/token-stats/token_stats_dashboard.test.ts:112-142`
- 问题：`JSON.stringify(result).length < 10_000` 是单点、任意绝对阈值，只验证一个 fixture 小于 10KB；没有对相同聚合分组下增加 message 数与增加分组数分别比较响应行数/序列化字节数，也没有断言 payload 不含 per-message records。实现即使随着消息数线性膨胀，只要当前样本未越过阈值仍会通过。
- 建议：构造成对 fixture：固定桶/分组、仅扩大 message 数；固定 message 数、扩大分组数。比较 DTO 行数和序列化字节数增长关系，并断言不出现 raw record 内容；绝对耗时只记录，不设 CI 固定阈值。

### t191_test_f007 - alias 行为覆盖被删除，新增 renderer 用例只测空配置

- 严重度：minor
- 锚点：范围内风险：alias 合并及项目/模型可见标签语义
- 位置：`tests/unit/renderer/views/token_stats_view.test.tsx:253-263`；diff 删除原 `applies aliases from the initial configuration read` 与 `applies aliases received through configuration change events`
- 问题：现有用例的 config 使用空 `dirAliases/modelAliases`，只断言 config 读取次数；store 新增用例只覆盖 model alias 的一个 summary/chart 路径。目录 alias、初始配置传递、配置事件更新，以及 project/session 轴上的合并均无等价 renderer 证据。
- 建议：迁移原有初始配置和配置事件用例，分别断言 dashboard query 中 alias 透传及 project/session/model 可观察标签合并；补充目录 alias 与同 alias 多 key 的 top/other 结果。

## 结论

- 前轮 finding 复核：无（Round 1）。
- 改测方向复核：有。diff 将 `tests/unit/renderer/views/token_stats_view.test.tsx` 从约 1,100 行压缩为约 260 行，删除竞态、alias、分页/窗口/图表/KPI 等既有行为测试；当前新增少量 smoke 用例未等价补回其中关键 AC 证据。
- 本轮新发现：7 条。
- 未进表的提示：`tests/unit/ipc/token-stats-ipc.test.ts` 新增的 `eslint-disable-next-line @typescript-eslint/unbound-method` 仅压制 mock 方法 lint，不直接削弱行为断言；popup/settings 测试改动主要是补齐 `getDashboard` mock 接口与格式噪声，未单独列 finding。
- 总体判断：AC2、AC4、AC5、AC6 及筛选竞态缺少可信、可观察的阻断性测试证据，当前测试审查不通过。
- 系统性 follow-up：无。

verdict: FAIL

## Round 2 (2026-08-03 14:20 UTC+8)

复核范围：`git diff b52b249ef91ff14afbef76e33216e13c6566d581`（工作区，实现未提交）。逐条核对 Round 1 的 f001-f007。

### 逐条复核

- **t191_test_f001（raw oracle）— 已消除（范围收敛）**。新增 `matches an independent raw-record oracle for current and previous windows`（`tests/unit/main/core/token-stats/token_stats_dashboard.test.ts:272-328`）由同一批 raw records 独立计算 current/previous 的 tokens/sessions/calls，并含 excluded-end / excluded-prev 边界记录；另有 half-open 边界（:85-110）、session 按 source/env 去重（:359-381）、model 合计守恒（:173-175）等独立断言。仅 1h/tokens 单窗口 oracle，未覆盖 24h/7d/30d/custom 全范围逐区域比对，属覆盖广度收敛；核心聚合与窗口语义已获独立证据。
- **t191_test_f002（KPI/delta）— 已消除**。MetricDonut mock 保留 `centerValue/segments` props（`tests/unit/renderer/views/token_stats_view.test.tsx:17-29`）；新增 `renders KPI and deltas from the current and previous summaries`（:298-309）断言渲染 delta 文本「▲ 100.0%」（current 180 vs previous 90、calls 2 vs 1）及 donut 收到 sonnet=180 段。注：tokens 与 calls 均产生同一 100% 文本，单区域失效仍可能通过，非恒真但属弱容忍。
- **t191_test_f003（IPC 失败/DTO 边界）— 已消除**。IPC 新增 QUERY_FAILED（store throw，`tests/unit/ipc/token-stats-ipc.test.ts:205-226`）、INVALID_RESPONSE（malformed DTO，:228-265）、非法 query 不触达 store（:119-132）。shared schema 补齐非法 enum/range、alias 与分页边界、401 天桶上限、DTO 越界数组/负值/非法 env enum（`tests/unit/shared/token_stats_dashboard.test.ts:22-82,149-242`）。
- **t191_test_f004（分页 renderer 交互）— 已消除**。SessionTable mock 暴露 next-page 按钮并回调 `onPageChange`（`token_stats_view.test.tsx:42-69`）；新增 `fetches the next session page through onPageChange`（:311-350）点击后断言第二次 getDashboard 携带 `session_offset=100` 且展示第 2 页数据。
- **t191_test_f005（旧响应竞态）— 已消除**。新增 `keeps the newest filter when an older response resolves later`（`token_stats_view.test.tsx:352-368`）等价迁移原 `ignores an older platform response after a faster switch`：all 与 wsl 各持 deferred，先 resolve 新筛选再 resolve 旧筛选，断言最终面板仍属新筛选。view 侧 `request_id !== load_request_id.current` 守卫（`src/renderer/views/TokenStatsView.tsx:356`）为真实保护，删除守卫该用例即失败。
- **t191_test_f006（增长关系）— 已消除**。新增成对 fixture（`token_stats_dashboard.test.ts:329-358`）：固定 1 桶 / 1 session / 1 model 分组下 500 vs 2000 条 message，断言序列化字节增长 ≤ 500，远小于线性；配合高密度有界维度用例（:112-142）。未做「固定 message、扩大分组数」对比，属建议项收敛。
- **t191_test_f007（alias）— 部分消除（minor，不阻断）**。透传已覆盖：renderer 初始配置读取 → query 携带 dir_aliases/model_aliases（`token_stats_view.test.tsx:370-387`）；store model alias 先合并后 top-5 聚合（`token_stats_dashboard.test.ts:178-209`）；integration model_aliases 参数生效（`tests/integration/local-api/server.test.ts` 新增用例）。仍缺：配置变更事件（onConfigChange）更新 alias、dir alias 在 project/session 轴合并、同 alias 多 key 的 top/other 结果。

### 危险模式扫描

- 无恒真断言：各用例均有区分输入与独立期望。
- has_more 旧断言 true→false 属语义修正：store 实现 `has_more = total > offset + items.length`（`src/main/core/token-stats/token-stats-store.ts:1092`），offset=100 已到末页 → false 正确；新增中间页用例（offset=0、limit=100、total=101）确认 has_more=true（`token_stats_dashboard.test.ts:242-271`）。
- 未发现迁就实现的改测：断言基于独立计算或可观察 UI 输出。
- 无新阻断项；popup/settings 测试改动仍为 mock 接口补齐，未见削弱。

### 结论

- 前轮 finding 复核：f001-f006 已消除，f007 部分消除（剩余 minor 级事件驱动/合并细节）。
- 未解决 critical/important：无。
- 实测通过：5 个文件 63 用例（dashboard 11、shared 6、ipc 14、renderer 10、integration 22）。

verdict: PASS
