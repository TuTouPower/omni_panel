# Task review t470（reviewer_focus: 测试）

- task：`t470_antigravity_session_discovery_list`
- spec：`/home/testuser/testuser_ubuntu/omni_panel_t470/docs/tasks/t470_antigravity_session_discovery_list/spec.md`
- diff_anchor：`d25451d57a5e90e8a42e9dff23d8edc1bca33444`
- target：`git diff d25451d57a5e90e8a42e9dff23d8edc1bca33444`
- round：1
- reviewed_at：2026-09-11 23:35 UTC+8

## Findings

### t470_test_f001 - AC-003 排序/筛选行为无测试锁定

- 严重度：minor
- 锚点：AC-003（“按 tokens 排序筛选时行为有定义且测试锁定（agy 沉底或与 0 同序，不抛错）”）
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:3372`（新增 agy 用例仅断言 sources 过滤/source_counts/tokens 和为 0，未覆盖 `order_by: "tokens"` / `min_tokens` / `max_tokens`）
- 问题：生产侧 `query_sessions` 以 `TOKENS_EXPR` 求和排序（`src/main/core/token-stats/token-stats-store.ts:1534`），agy 行 tokens 全 0 与 0 同序属继承行为，无任何测试插入 agy+非零行后断言 `order_by: "tokens"` 不抛错且顺序与 0 一致；AC-003 明确要求测试锁定，此子句无证据。
- 建议：store 用例追加一节：写入 agy（全 0）+ 普通行（非零），断言 `query_sessions({ order_by: "tokens" })` 不抛错且 agy 与 0 同序，`min_tokens: 1` 排除 agy、`max_tokens: 0` 命中 agy（或等价方向）；属加 case，不阻断。

## 结论

- 改测方向复核：无“迁就实现”的改测。三处 6→7（`tests/unit/main/core/token-stats/collector.test.ts:1167,1202,1287`）系新增 `antigravity` 平台源后的预期计数更新，注释同步 `t445 +codex；t470 +antigravity` 且 `task.md` 有归因（t445 先例），其余 t437/t309 断言原样保留；collector 新增 `t470 AC-001` 用例为新增分支的新测试，非就地改预期。
- 本轮新发现：1 条（minor，f001；无 critical/important）。
- 未进表提示：危险模式逐条扫描通过——无恒真/删断言/注释断言/弱化（`not.toContain("0 tokens")`/`not.toContain("Antigravity")` 为 AC 否定断言，合法）、无删测试/跳过独占、无静默错误新增（`eslint-disable` 均为文件既有首行，非本轮加入）、无阈值掩盖、无条件跳过弱化（`if (!meta) throw` 为 loud guard）、无程序赋值替代交互、无存在即通过（Card 断言 `42 轮`+`未知`+非 `0 tokens`；view 断言选项值缺失）；mock 边界合法——collector 对 `antigravity-reader` 的 mock 与既有 6 源同形，断言透传/env/双路径而非 mock 存在；untracked `src/main/core/token-stats/antigravity-reader.ts` + `tests/unit/main/core/token-stats/antigravity-reader.test.ts`（8 用例）已直读并随 6 文件共 241 用例全绿（先经 `node scripts/ensure_sqlite_abi.mjs node`，此前裸跑 ABI 失配属环境问题非测试缺陷）。可选扩展（非 finding）：Row/Preview/Compare 共用 `format_session_tokens` 仅 Card 有 UI 用例，同一分支单点覆盖已够；预览/summaries/searchContent 复用 t455 无新分支；logo 行由 `source_counts` 驱动，后端已测。
- 总体判断：AC-001（reader 8 用例直达生产 sqlite fixture＋collector 接线＋store 过滤/counts＋schema 接纳）、AC-002 续接（t456 `resume_command` 既有）＋AC-003（tokens 记 0＋Card 未知）＋AC-004（schema 拒绝＋类型守卫＋view 无选项）均有可信测试，测试触达生产逻辑且断言用户可观察，仅 f001 minor 缺排序锁定。
- 系统性 follow-up：无

verdict: PASS

______________________________________________________________________

# Round 2（reviewer_focus: 测试）

- diff_anchor：`d25451d57a5e90e8a42e9dff23d8edc1bca33444`
- target：`git diff d25451d57a5e90e8a42e9dff23d8edc1bca33444`（+ untracked 直读：`src/main/core/token-stats/antigravity-reader.ts`、`tests/unit/main/core/token-stats/antigravity-reader.test.ts`）
- reviewed_at：2026-09-11 23:40 UTC+8
- review_level：full

## Findings

无新增 finding。

## 结论

- 前轮 finding 复核：`t470_test_f001`（minor，AC-003 排序/筛选无锁定）已消除。以 diff 为准：`tests/unit/main/core/token-stats/token-stats-store.test.ts` 末尾追加 `t470_test_f001 AC-003` 用例（agy 全 0＋zero＋big 三行）：`query_sessions({ order_by: "tokens", direction: "asc" })` 不抛错且 `big` 置末、agy 与 zero 同处前二（与生产侧 `TOKENS_EXPR` 求和排序 `src/main/core/token-stats/token-stats-store.ts:1534-1545` 一致，`min_tokens:1` 排除 agy、`max_tokens:0` 命中 agy 与 `>=`/`<=` 语义一致）；非弱化改写，属加 case。另 reader 新增 3 锁定用例（`tests/unit/main/core/token-stats/antigravity-reader.test.ts:307,320,358`：空表合法不报 `file_unreadable`、mtime 抖动不降级、无库索引跨轮保留）直达生产 sqlite fixture。两文件共 136 用例全绿（store 125＋reader 11）。
- 改测方向复核：无“迁就实现”的改测。本轮 store diff 为纯追加（+96/−0，既有用例零修改）；危险模式重扫通过——新增块无 `.skip/.only`/条件断言/`eslint-disable`（文件首行 `eslint-disable` 与 `3095 toBeTruthy` 均为既有，非本轮加入）、无 `toMatchObject` 弱化（键含 `id/source/calls` 强断言＋集合/首尾顺序双断言）、mock 边界无变化（store/reader 均直达真实 sqlite，无 mock）。
- 本轮新发现：0 条。
- 未进表提示：`asc` 单方向锁定已满足 AC-003“沉底或与 0 同序”第二析取（对称 `desc` 同一 `TOKENS_EXPR`，不另开 finding）；`order_by tokens asc` 首二顺序依赖 `ended_at DESC` 二级键但用例已 `sort()` 后比较，无时序脆弱性。
- 总体判断：f001 已真修且无新危险模式，AC-003 排序/筛选现由可信测试锁定。
- 系统性 follow-up：无

verdict: PASS

______________________________________________________________________

# Round 3（reviewer_focus: 测试，scope 证据轮）

- diff_anchor：`d25451d57a5e90e8a42e9dff23d8edc1bca33444`
- target：`git -C '/home/testuser/testuser_ubuntu/omni_panel_t470' diff d25451d57a5e90e8a42e9dff23d8edc1bca33444`
- reviewed_at：2026-09-12 08:04 UTC+8
- review_level：full（本轮为 scope 证据轮：确认 Round 2 后无实质变更＋前轮 finding 仍消除＋无新问题，不重排前轮结论）

reviewed_scope: 4b71b8989bf9c945

## Findings

无新增 finding（沿用全局编号，本轮无 `t470_test_f002`）。

## 结论

- 范围证据：`git rev-parse --show-toplevel` 精确等于工作仓库；`git status --short --untracked-files=all` 干净（无 reviewer 看不到的未跟踪交付文件）；anchor 后仅一个执行 commit `e63f012c`；`git diff` 实质内容与 Round 2 描述一致——6 测试文件共 +573/−6，其中 −6 仅三处 6→7 计数更新（`collector.test.ts`，注释同步 `t470 +antigravity`，Round 1 已归因）；自 Round 2 后的增量仅 prettier 空格重排（`token-stats-store.test.ts` f001 块 `toBe(` 换行格式，断言语义不变）与 `task.md` 笔记文字，无生产/测试语义变更。
- 前轮 finding 复核：`t470_test_f001`（minor，AC-003 排序/筛选无锁定）仍消除。以 diff 为准：f001 锁定用例仍在（agy＋zero＋big 三行，`order_by: "tokens" asc` 不抛错、`big` 置末、agy 与 zero 同处前二、`min_tokens:1` 排除 agy、`max_tokens:0` 命中 agy）；抽跑 `token-stats-store.test.ts`＋`antigravity-reader.test.ts` 共 136 passed（125＋11，与 Round 2 一致），`collector`＋`SessionCard`＋`panels_wiring`＋`token_stats_view` 共 109 passed。无换形式弱化。
- 改测方向复核：无“迁就实现”的改测。既有断言零修改（除上述 6→7 盘点更新）；f001 块重排仅换行不断言反转；危险模式重扫通过——无新增 `.skip/.only`、无 `eslint-disable`/`ts-ignore` 新增、无删测试/删断言、无 `toBe`→弱断言（`toMatchObject` 均带 `id/source/calls` 强键，`not.toContain("0 tokens")` 为 AC-003 否定断言合法）、无阈值/条件跳过弱化、无程序赋值替代交互。
- 本轮新发现：0 条。
- 未进表提示：无。spec 归档 drift 警告可忽略（`docs/archive/tasks/.../spec.md` 内容未变，契约以本 prompt 注入区为准）；上下文区「有意不测」（非 linux 目录形态、78 库全量性能）未出 finding。
- AC 复验方式：
    - AC-001（agy 进列表）：`re_verified`——重跑 reader/store/collector/schema 用例全绿，断言直达真实 sqlite fixture 与 `source_counts`。
    - AC-002（预览与续接）：`trust_prior`——本 diff 无预览/续接新分支（复用 t455 提取器＋t456 `resume_command`），依赖实施侧既有证据与前轮复核。
    - AC-003（tokens 记 0＋标未知＋排序锁定）：`re_verified`——重跑 f001 用例与 Card 未知标注用例全绿。
    - AC-004（代理面板排除）：`re_verified`——重跑 `panels_wiring` 契约拒绝＋view 无选项用例全绿。
    - `coverage = re_verified / 总 AC 数 = 3/4`。
- 总体判断：Round 2 后无实质变更，f001 仍消除且无新 blocker；补上缺失的 `reviewed_scope` 指纹行。
- 系统性 follow-up：无

verdict: PASS
