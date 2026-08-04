# Task review t190（reviewer_focus: 测试）

- task：`t190_tokenstats_query_swr_cache`
- spec：`docs/tasks/t190_tokenstats_query_swr_cache/spec.md`
- diff_anchor：`fd910318fab9cdc0e025bdbdf02db51d0c0cc4a7`
- target：`git diff fd910318fab9cdc0e025bdbdf02db51d0c0cc4a7`
- round：1
- reviewed_at：2026-08-02 17:52 UTC+8

## Findings

### t190_test_f001 - 既有测试就地改写为实现驱动预期

- 严重度：important
- 锚点：改测方向复核
- 位置：`tests/unit/renderer/views/token_stats_view.test.tsx:183-216`，测试 `loads all platforms by default and switches between Win, WSL, and all`
- 问题：diff 将既有测试从“切回全平台再次发起第 4 次查询并显示 `all-again`”就地改为“切回全平台复用 `all-session` 且查询次数仍为 3”，同时删除第 4 个 mock 响应。该修改直接把既有断言迁就到当前缓存实现，没有新增独立测试或在 task 记录旧测试语义失效原因。按 TDD 改测规则，实现变更导致旧语义失效时，应新增新语义测试；旧测试只能原样保留或整体删除并说明理由，禁止就地改写预期。
- 建议：恢复既有测试，或整体删除并在 `task.md` 记录旧语义失效原因；另建命名明确的缓存命中测试，单独验证 AC1 的复用行为，避免实现与测试同步迁移。

### t190_test_f002 - AC1 未直接验证命中缓存时不进入全屏加载态

- 严重度：minor
- 锚点：AC1
- 位置：`tests/unit/renderer/views/token_stats_view.test.tsx:212-216`
- 问题：切回全平台后仅通过 `waitFor` 断言最终出现 `all-session`，并断言 IPC 次数未增加；没有在点击后的当前渲染阶段断言 `加载中...` 不出现。若后续缓存命中路径先执行 `setLoading(true)`，再异步恢复旧数据，当前测试仍可能等待到最终文本而通过，无法证明“已有结果立即显示，不出现全屏加载中”。
- 建议：点击缓存命中选项后，在等待刷新完成前直接断言旧 `session-records` 仍在且 `screen.queryByText("加载中...")` 为 `null`；保留 IPC 次数断言。

### t190_test_f003 - AC4 回访旧 query key 的 renderer 行为未覆盖

- 严重度：minor
- 锚点：AC4
- 位置：`tests/unit/renderer/views/token_stats_view.test.tsx:262-278`；`tests/unit/renderer/lib/token_stats_query_cache.test.ts:42-59`
- 问题：renderer 测试只验证 collector 更新后当前可见查询保留旧数据并刷新为新数据；单元测试只验证缓存对象 `mark_stale()` 后再次 `load` 得到新值。没有覆盖“collector 更新后切到另一个选项，再切回旧 query key 必须显示刷新后数据”。若 stale 标记、generation 与 request id 的交互在回访路径出错，现有测试仍会通过。
- 建议：增加 renderer 场景：加载 A → 触发 collector 更新 → 切换 B → 切回 A，断言 A 显示刷新后数据且不会永久显示更新前数据。

### t190_test_f004 - AC5 首次打开时的配置别名应用无测试

- 严重度：minor
- 锚点：AC5
- 位置：`tests/unit/renderer/views/token_stats_view.test.tsx:151-153,235-259`
- 问题：测试 fixture 让首次 `config.get()` 始终返回空别名，只验证后续 `onConfigChange` 广播能把别名传给 `BarChart`。因此即使首次打开的 `.config.get()` 结果不再调用 `apply_config_aliases`，现有测试仍通过，AC5“配置别名在首次打开与配置变更后仍正确应用”只覆盖后一半。
- 建议：为首次 `config.get()` 配置非空 `dirAliases`/`modelAliases`，在不触发广播的情况下断言首屏 `BarChart` 收到别名；另保留现有广播测试。

### t190_test_f005 - AC6 未验证 renderer 实际接入有界缓存

- 严重度：minor
- 锚点：AC6
- 位置：`tests/unit/renderer/lib/token_stats_query_cache.test.ts:61-72`；`src/renderer/views/TokenStatsView.tsx:164,205-210`
- 问题：LRU 单元测试仅用 `max_entries: 2` 验证缓存实现本身淘汰条目，没有验证 `TokenStatsView` 实际使用 `TOKEN_STATS_CACHE_MAX_ENTRIES = 8` 的单例缓存。若接线传错容量，或组件重渲染时重新创建缓存导致容量/生命周期失效，现有测试仍通过。
- 建议：增加 renderer 场景，连续切换 9 个不同 query key 后切回第 1 个 key，断言其重新触发底层 IPC 查询；同时断言未超过上限的回访仍命中缓存。

### t190_test_f006 - query key 维度测试不完整

- 严重度：minor
- 锚点：范围“按所有影响查询结果的选项生成稳定 query key”
- 位置：`tests/unit/renderer/lib/token_stats_query_cache.test.ts:7-15`；`src/renderer/views/TokenStatsView.tsx:286-294`
- 问题：cache 单元测试 helper 只改变 `metric`，renderer 测试对缓存隔离只实际覆盖 `platform` 与时间范围；没有验证 `agent`、`xaxis`、`gran` 改变时不会复用旧结果。若序列化遗漏任一维度，现有测试仍可能通过并把错误数据展示到不同选项组合。
- 建议：将 query key 测试改为对 `agent`、`platform`、`range_start`、`range_end`、`metric`、`xaxis`、`gran` 逐维变异的表驱动测试；renderer 层至少补 agent/xaxis/gran 切换后的 IPC 次数与结果断言。

## 结论

- 前轮 finding 复核：无（Round 1）。
- 改测方向复核：有。`t190_test_f001` 指出既有平台切换测试被就地改写为缓存实现预期。
- 危险模式扫描：未发现恒真断言、删除/反转 expect、注释断言、`.skip`/`.only`、静默类型错误、阈值掩盖、条件跳过或用程序赋值冒充用户交互。IPC、配置事件与可控 Promise 均位于测试边界；未发现新增 mock 被测逻辑本身的证据。
- 契约区 drift：`spec.md` 仅把 AC1-AC6 的完成标记从 `[ ]` 改为 `[x]`，AC 正文未变，未视为需求语义变更。
- 本轮新发现：6 条（1 important，5 minor）。
- 未进表的提示：AC2 在途合并、AC3 旧响应防覆盖、AC4 当前可见查询静默刷新、AC6 LRU 单元淘汰均有对应测试。相关验证通过：targeted renderer tests 27/27；`pnpm test`；`pnpm typecheck`；`pnpm lint`。
- 总体判断：存在未处置的 important 改测方向问题，且若干 AC 仅部分覆盖；本轮 FAIL。
- 系统性 follow-up：无。

verdict: FAIL

## Round 2 (2026-08-03 08:23 UTC+8)

### 前轮 finding 复核

- `t190_test_f001`：仍存在。当前 diff 仍将基线 `loads all platforms by default and switches between Win, WSL, and all` 就地改为 `filters platform selection`，删除第 4 个 mock 响应和切回全平台的原查询断言；没有整体删除并说明旧语义失效原因。位置：`tests/unit/renderer/views/token_stats_view.test.tsx:183-212`。
- `t190_test_f002`：已消除。新增 `shows cached data immediately without full-screen loading`，点击命中缓存的全平台选项后同步断言旧 `session-records`、`加载中...` 不存在以及 `get_records` 次数未增加。位置：`tests/unit/renderer/views/token_stats_view.test.tsx:214-232`。
- `t190_test_f003`：修复不彻底，仍存在。新增 `refreshes a cached query when revisiting it after collector update`，但只在 collector 更新后才首次加载另一个选项；更新前没有先把第二个 query key 放入缓存，因此切回 A 命中的是更新后的当前条目，不是“更新前已缓存、collector 更新后被标 stale、再回访”的旧条目。该测试仍不能证明 AC4 第二句对非当前缓存条目成立。位置：`tests/unit/renderer/views/token_stats_view.test.tsx:444-468`。
- `t190_test_f004`：已消除。新增 `applies aliases from the initial configuration read`，fixture 让首次 `config.get()` 返回非空 `dirAliases`/`modelAliases`，并断言首屏 `BarChart` props；广播测试仍保留。位置：`tests/unit/renderer/views/token_stats_view.test.tsx:277-296`。
- `t190_test_f005`：仍存在。新增 renderer 场景虽切换了多个组合并在末尾回访首个组合，但每个中间组合都是新 key，最后首 key 重新查询在“无缓存”实现下也同样发生；没有先验证容量内的近期 key 回访不增加 IPC，再验证超过上限后最旧 key 被淘汰。因此不能证明 `TokenStatsView` 实际接入 8-entry LRU，而只能证明末尾一次查询发生。位置：`tests/unit/renderer/views/token_stats_view.test.tsx:470-502`。
- `t190_test_f006`：已消除。query cache 单元测试通过 `dimensions` 表逐一改变 `agent`、`platform`、`range_start`、`range_end`、`metric`、`xaxis`、`gran`、`query_mode`，断言每个组合都触发独立 fetch。位置：`tests/unit/renderer/lib/token_stats_query_cache.test.ts:66-86`。

### 改测方向复核

- 仍有 `t190_test_f001`：旧平台测试不是独立删除/替代，而是就地改写。

### 危险模式扫描

- 未发现恒真断言、删除/反转 expect、注释断言、`.skip`/`.only`、静默类型错误、阈值掩盖、条件断言跳过或用程序赋值冒充用户交互。`if (config_listener)` 位于前置非空断言之后，未构成条件弱化断言。

### 测试验证

- `pnpm exec vitest run tests/unit/renderer/lib/token_stats_query_cache.test.ts tests/unit/renderer/views/token_stats_view.test.tsx --reporter=dot`：2 个文件、37 个测试通过。

### 结论

- 前轮 finding 复核：`f001` 仍为 important；`f003`、`f005` 修复不彻底；`f002`、`f004`、`f006` 已消除。
- 改测方向复核：有，旧平台测试仍就地迁就缓存实现。
- 本轮新发现：0 条。
- 未进表的提示：无。
- 总体判断：`f001` 未解决，且 AC4/AC6 的测试证据仍不完整；本轮 FAIL。
- 系统性 follow-up：无。

verdict: FAIL

## Round 3 (2026-08-03 08:52 UTC+8)

### 前轮 finding 复核

- `t190_test_f001`：仍存在。当前 diff 仍在原测试位置将 `loads all platforms by default and switches between Win, WSL, and all` 就地替换为缓存命中测试，删除原测试的 WSL/空结果/第 4 次全平台查询证据；未在 `task.md` 或报告中说明旧语义为何失效。位置：`tests/unit/renderer/views/token_stats_view.test.tsx:183-201`。该改测方向仍属让既有断言迁就当前实现，important blocker 未消除。
- `t190_test_f003`：已消除。当前测试先缓存 30d 与 7d 两个 query key，再触发 collector 更新刷新当前 7d，最后回访 30d 并断言显示 `after-month`、调用次数为 4；因此覆盖非当前旧缓存被标 stale 后回访必须刷新。位置：`tests/unit/renderer/views/token_stats_view.test.tsx:413-440`。
- `t190_test_f005`：已消除。renderer 测试构造 9 个不同 agent/platform 组合，访问仍在容量内的 `Kimi Code + Win` 不增加 `get_records` 次数，再访问 `全部工具 + Win` 与 `全平台` 使次数增至 10、11，证明 8-entry 接线会淘汰最旧条目并重新查询。位置：`tests/unit/renderer/views/token_stats_view.test.tsx:442-472`。

### 改测方向复核

- 仍有 `t190_test_f001`：既有平台切换测试继续被就地改写为缓存实现预期。

### 危险模式扫描

- 未发现恒真断言、删除/反转 expect、注释断言、`.skip`/`.only`、静默类型错误、阈值掩盖、条件断言跳过或用程序赋值冒充用户交互。`if (config_listener)` 仍位于前置非空断言之后，不构成条件弱化断言。

### 测试验证

- `pnpm exec vitest run tests/unit/renderer/lib/token_stats_query_cache.test.ts tests/unit/renderer/views/token_stats_view.test.tsx --reporter=dot`：2 个文件、36 个测试通过。
- `git diff --check fd910318fab9cdc0e025bdbdf02db51d0c0cc4a7 -- tests/unit/renderer/views/token_stats_view.test.tsx tests/unit/renderer/lib/token_stats_query_cache.test.ts`：通过。

### 结论

- 前轮 finding 复核：`f001` 仍为 important；`f003`、`f005` 已消除；前轮其余 finding 未见回归。
- 改测方向复核：有，旧平台切换测试仍就地迁就缓存实现。
- 本轮新发现：0 条。
- 未进表的提示：无。
- 总体判断：相关测试通过，但 `f001` 未解决，仍存在 important 改测方向问题；本轮 FAIL。
- 系统性 follow-up：无。

verdict: FAIL

## Round 4 (2026-08-03 08:59 UTC+8)

### 前轮 finding 复核

- `t190_test_f001`：已消除。相对 `fd910318...` 的 diff 中，原测试 `loads all platforms by default and switches between Win, WSL, and all` 整体删除，不再在原测试块内迁就缓存预期；独立缓存命中测试 `shows cached data immediately without full-screen loading` 新增在文件末尾 `tests/unit/renderer/views/token_stats_view.test.tsx:1136-1154`，单独验证全平台 → Win → 全平台回访、同步保留旧数据、无全屏加载且 IPC 次数不增加。
- `t190_test_f002`：已消除，缓存命中测试仍直接断言旧面板内容、`加载中...` 不存在和 IPC 次数。
- `t190_test_f003`：已消除。`tests/unit/renderer/views/token_stats_view.test.tsx:393-420` 先缓存 month/week 两个 query key，collector 更新刷新当前 week，再回访非当前 month 并断言 `after-month` 与第 4 次查询，覆盖 stale 非当前缓存回访。
- `t190_test_f004`：已消除，首次配置别名测试仍存在且无回归。
- `t190_test_f005`：已消除。`tests/unit/renderer/views/token_stats_view.test.tsx:422-452` 在 8-entry 接线下验证容量内 `Kimi Code + Win` 回访不增加 IPC，继续加入组合后回访最早全平台组合增加查询次数，证明有界淘汰。
- `t190_test_f006`：已消除，query cache 单元测试仍逐维验证 query key 隔离。

### 改测方向复核

- 无。原平台切换测试已整体删除，缓存命中语义在文件其他位置独立新增；未发现就地修改既有断言迁就当前实现。

### AC4/AC6 复核

- AC4：已覆盖。非当前 month 条目在 collector 更新后必须重新查询并显示 `after-month`，不会永久显示 `before-month`；当前 week 同时验证保留旧结果后静默刷新。
- AC6：已覆盖。renderer 场景验证容量内回访不发重复查询、超过 8 条后最早条目被淘汰并重新查询；`tests/unit/renderer/lib/token_stats_query_cache.test.ts:88-100` 另验证 LRU 单元行为与 `size() === 2`。

### 危险模式扫描

- 未发现恒真断言、删除/反转 expect、注释断言、`.skip`/`.only`、静默类型错误、阈值掩盖、条件弱化断言、程序赋值冒充用户交互或 mock 被测逻辑本身。

### 测试验证

- `pnpm exec vitest run tests/unit/renderer/lib/token_stats_query_cache.test.ts tests/unit/renderer/views/token_stats_view.test.tsx --reporter=dot`：2 个文件、36 个测试通过。
- `git diff --check fd910318fab9cdc0e025bdbdf02db51d0c0cc4a7 -- tests/unit/renderer/lib/token_stats_query_cache.test.ts tests/unit/renderer/views/token_stats_view.test.tsx`：通过。

### 结论

- 前轮 finding 复核：`f001`、`f003`、`f005` 已消除；`f002`、`f004`、`f006` 无回归。
- 改测方向复核：无。
- 本轮新发现：0 条。
- 未进表的提示：无。
- 总体判断：原平台切换测试已整体删除，缓存命中测试已独立新增；AC4/AC6 当前测试证据充分，本轮无未解决 critical / important。
- 系统性 follow-up：无。

verdict: PASS

## Round 5 (2026-08-03 09:09 UTC+8)

### 前轮 finding 复核

- `t190_test_f001`：无回归。相对 `fd910318fab9cdc0e025bdbdf02db51d0c0cc4a7`，原 `loads all platforms by default and switches between Win, WSL, and all` 测试块已整体删除；缓存命中语义由独立的 `shows cached data immediately without full-screen loading` 测试承担，未发现就地改写既有平台测试断言迁就实现。
- `t190_test_f002`：无回归。独立缓存命中测试在回访全平台组合时同步断言旧 `session-records` 保留、`加载中...` 不出现、IPC 调用次数不增加。位置：`tests/unit/renderer/views/token_stats_view.test.tsx:1164-1182`。
- `t190_test_f003`：无回归。collector 更新后先刷新当前 week，再回访已缓存的非当前 month，断言显示 `after-month` 且查询次数为 4，覆盖 AC4 的旧缓存回访路径。位置：`tests/unit/renderer/views/token_stats_view.test.tsx:393-420`。
- `t190_test_f004`：无回归。首次配置读取与配置变更广播均有独立测试，别名 props 断言保持有效。
- `t190_test_f005`：无回归。renderer 测试先验证容量内 `Kimi Code + Win` 回访不增加 IPC，再超过 8 条组合后回访最早组合增加查询；独立 cache 测试另验证 LRU 淘汰和 `size() === 2`。位置：`tests/unit/renderer/views/token_stats_view.test.tsx:450-480`、`tests/unit/renderer/lib/token_stats_query_cache.test.ts:88-100`。
- `t190_test_f006`：无回归。独立 cache 测试仍逐一改变 agent、platform、时间范围、metric、xaxis、gran、query_mode，断言每个 query key 独立触发 fetch。

### 重点复核

- 原平台切换测试已整体删除，没有把旧测试块改写成缓存预期。
- 独立缓存测试文件已加入 diff，覆盖在途请求合并、fresh 命中、stale 刷新、query key 维度隔离和 LRU 淘汰。
- 过期预设筛选测试 `refreshes an expired preset window when changing filters` 使用 `Date.now()` 可控时间推进 6 分钟，切换筛选后断言新请求的 `end` 晚于初始请求，覆盖过期预设在筛选变更时重建时间窗。位置：`tests/unit/renderer/views/token_stats_view.test.tsx:422-448`。
- AC4：当前可见查询保留旧结果并静默刷新，且非当前旧缓存回访显示刷新后数据；测试证据完整。
- AC6：独立 cache 层与 renderer 接线均验证 8 条上限、容量内回访命中和最旧条目淘汰后重新查询；测试证据完整。

### 改测方向复核

- 无。当前 diff 仅整体删除语义失效的平台切换测试，并在独立测试位置补充缓存命中行为；未发现就地修改既有测试预期迁就实现。

### 危险模式扫描

- 未发现恒真断言、删除/反转 expect、注释断言、`.skip`/`.only`、静默类型错误、阈值掩盖、条件弱化断言、程序赋值冒充用户交互或 mock 被测逻辑本身。可控 Promise、假时钟、IPC/config/collector 事件均位于测试边界。

### 测试验证

- `pnpm exec vitest run tests/unit/renderer/lib/token_stats_query_cache.test.ts tests/unit/renderer/views/token_stats_view.test.tsx --reporter=dot`：2 个文件、37 个测试通过。
- `git diff --check fd910318fab9cdc0e025bdbdf02db51d0c0cc4a7 -- tests/unit/renderer/lib/token_stats_query_cache.test.ts tests/unit/renderer/views/token_stats_view.test.tsx`：通过。
- 契约区 drift 仅为 AC1-AC6 完成标记从 `[ ]` 改为 `[x]`，AC 正文未变。

### 结论

- 前轮 finding 复核：`f001` 至 `f006` 均已消除且无回归。
- 改测方向复核：无。
- 本轮新发现：0 条。
- 未进表的提示：无。
- 总体判断：原平台测试删除方式、独立缓存测试、过期预设筛选测试以及 AC4/AC6 覆盖均符合要求；无未解决 critical / important。
- 系统性 follow-up：无。

verdict: PASS
