# Task review t210（reviewer_focus: 测试）

- task：`t210_session_history_watch_service`
- spec：`docs/tasks/t210_session_history_watch_service/spec.md`
- diff_anchor：`0598dab1cf063cdf6941e33dbb0be3eb7798d0dc`
- target：`git diff 0598dab1cf063cdf6941e33dbb0be3eb7798d0dc`
- round：1
- reviewed_at：2026-08-05 14:42 UTC+8

本地执行 `pnpm test`（4 个新测试文件 + 2 个 renderer 视图测试文件）全部通过，31+11 tests green。以下 finding 均基于 diff 与源码比对。

## Findings

### t210_test_f001 - AC9 preload route 分权无测试

- 严重度：important
- 锚点：AC9「preload 的会话历史 API 仅对 route `history`（及需要的 agent route）暴露。」——该 AC 完全无测试
- 位置：`src/preload/route_api.ts:54`（新增 `select_session_history_api`）；`tests/unit/preload/route_api.test.ts` 未新增用例
- 问题：`select_session_history_api` 是本 diff 新增的分权函数，但既有 `route_api.test.ts` 只覆盖 `select_grok_api` / `select_trend_api` 两个 selector（import 行仅引这两个），session_history 的「history/agent → full_api、其余 → disabled_api」分权矩阵零测试。AC9 是可自动测试的纯函数，且与同一文件里 grok/trend 的测试模式完全一致，补测试成本极低。preload 是 IPC 能力暴露的安全边界：若 `select_session_history_api` 分支被改错（如 history route 也落到 disabled、或 usage/setting route 被放行真实 IPC），没有任何测试能拦截，且 renderer 视图 mock 补充只保证 mock 形态存在，不验证真实 preload 路由逻辑。
- 建议：在 `route_api.test.ts` 仿照 `select_trend_api` 补 `select_session_history_api` 用例：`it.each(["history","agent"])` → full_api；`it.each(["usage","setting","tray","unknown"])` → disabled_api，并锁定 disabled 契约（如 `query` resolve 空数组不抛）。

### t210_test_f002 - AC6 全程只读无测试

- 严重度：important
- 锚点：AC6「全程只读：服务对会话源文件无任何写、删、移、加锁写操作。」——该 AC 完全无测试
- 位置：`tests/unit/main/core/session-history/subscription-service.test.ts`（全文无只读断言）
- 问题：spec 上下文区「测试策略」声明断言目标含「订阅表状态、增量去重、句柄释放、**只读约束**」，但本 diff 所有测试均未对源文件做修改校验：`subscribe` / `query` / 轮询推送 / `unsubscribe` 全程没有任何断言「操作前后文件字节 / mtime 不变」或「未产生新文件」。AC6 是可自动测试的硬约束（操作前后快照文件内容即可），且已在测试策略中明确列为断言目标。若服务层或提取器未来误开写句柄、改写源文件，测试全绿但硬约束违约。
- 建议：在现有轮询 / query 测试中，对 fixture 文件在操作前做内容快照，subscribe + 若干轮询周期 + query + unsubscribe 后断言文件字节与快照一致，并顺带确认目录下未新增文件。

### t210_test_f003 - fs.watch 策略分支（win+claude_code 主路径）无测试

- 严重度：important
- 锚点：AC1「订阅后会话源文件被追加内容时，订阅方窗口在 watch 触发后收到 `SESSION_HISTORY_MESSAGES_UPDATED` 增量消息」；spec 可测试性声明「AC『watcher / 轮询触发推送』：主进程集成测试，临时目录模拟 transcript 追加」
- 位置：`src/main/core/session-history/subscription-service.ts:138-164`（`create_watcher` watch 分支）、`src/main/core/session-history/subscription-service.ts:127-130`（`pick_strategy`）；测试文件 `tests/unit/main/core/session-history/subscription-service.test.ts`
- 问题：订阅服务 9 个测试全部走轮询策略（grok/kimi，`extractor_kind: "grok"` / `"kimi"`），`pick_strategy` 的 `watch` 分支（win + claude_code）与 `create_watcher` 的 `if (strategy === "watch")` 整段代码零测试——没有任何测试对 win+claude_code 的订阅触发 watcher。测试头注释「优先测轮询策略…规避 fs.watch 的平台 flaky」是 implementer 自述；spec「有意不测」仅豁免「fs watch 在 WSL 9P 路径的不可靠性」，win 本地 fs.watch 明确落在可测试性声明内。具体风险：watch 分支 `if (event === "change") on_change()` 的事件过滤在 Windows 部分场景内容更新以 `rename` 事件上报，若过滤不当，本应用主平台（win）claude_code 会话订阅将永不推送——AC1 主路径失败而测试全绿。AC1 的「watch 触发」半侧完全无验证。
- 建议：win 本地临时目录对 claude_code 文件跑真实 fs.watch 集成测试（subscribe → append → wait 增量推送只含新增），并断言 `unsubscribe` 后 watcher `close` 不再触发。

### t210_test_f004 - opencode db 经订阅服务轮询增量未测

- 严重度：minor
- 锚点：AC2「WSL 路径与 opencode db 会话走 2s mtime 轮询，追加后同样推送增量」——轮询机制已测，opencode 源未测
- 位置：`tests/unit/main/core/session-history/subscription-service.test.ts`（无 `extractor_kind: "opencode"` 用例）
- 问题：AC2 明确点名 opencode db，但订阅服务集成测试只覆盖 grok / kimi 两种 JSONL 源；opencode（sqlite）经 poll 触发 `extract_opencode_incremental` 的接入路径未直接验证。opencode 增量提取器本体在 t209 `opencode-extractor.test.ts` 已有覆盖，轮询触发机制已由 grok/kimi 验证，此处缺的是第三个源接入的端到端确认。
- 建议：复用现有 poll 测试模式补一条 opencode fixture（构造临时 `.db`，追加行断言增量）。

### t210_test_f005 - grok locator 命中路径未测（UNC 无法构建）

- 严重度：minor
- 锚点：locator 命中/未命中覆盖——grok 命中分支完全未测
- 位置：`tests/unit/main/core/session-history/session-locator.test.ts`（grok describe 仅测 wsl_user 空→null）
- 问题：`resolve_grok` 的目录名匹配逻辑（`parts[file_idx - 1] === session_id`，`src/main/core/session-history/session-locator.ts:214-230`）零测试，因 `grok_sessions_dir` 硬编码 `wsl_home`（UNC 路径），测试环境无法构建 `\\wsl.localhost\...` 目录结构；现有测试只验证了 wsl_user 缺失时的优雅返回。该匹配结构与 kimi 的 `agents_idx` 匹配不同（按 `chat_history.jsonl` 前一个目录段判 session_id），属测试基础设施缺口（根目录不可注入）。
- 建议：把 grok（及 opencode/kimi 的 wsl 分支）根目录改为可注入，补命中路径用例；或作为测试基础设施改进单独立项。

### t210_test_f006 - unsubscribe_all 测试断言过弱

- 严重度：minor
- 锚点：AC4「注销订阅后不再推送，句柄被释放」——unsubscribe_all 行为未验证
- 位置：`tests/unit/main/core/session-history/subscription-service.test.ts`（"unsubscribe_all 清空所有订阅" 用例）
- 问题：`unsubscribe_all` 测试只断言 `not.toThrow()`（幂等 smoke），未行为验证清空后追加文件不再推送；单个 `unsubscribe` 有「append 后 150ms 无推送」的行为断言，但 `unsubscribe_all`（窗口关闭路径）没有对应行为验证。`not.toThrow()` 即便 watcher 未真正停止也不会失败。
- 建议：仿照单 `unsubscribe` 用例，`unsubscribe_all` 后 append → 推进数周期 → 断言 received 仍为空。

## 结论

- 前轮 finding 复核：本轮为首轮，无
- 改测方向复核：无。diff 未改动任何既有测试的既有断言预期；`tests/unit/renderer/views/` 4 处仅新增 `sessionHistory` mock 字段，是 `UsageboardApi` 新增必填字段后维持既有测试编译的必要加法，无「迁就实现」的预期改动
- 本轮新发现：6（3 important + 3 minor）
- 未进表提示：
    - AC2 的 WSL 轮询路径已覆盖（grok/kimi）；AC7 singleton 在 `history-window-controller.test.ts` 服务层/controller 层覆盖（全窗口环境 [deploy] 由 t213）；AC5 由 `unsubscribe_all` 服务层测试覆盖，窗口 `closed` 联动（`main/index.ts`）为 [deploy]
    - IPC 测试未覆盖 `assert_valid_sender` 拒绝路径——共享 helper 在 `tests/unit/ipc/helpers.test.ts` 已有覆盖，per-channel 重复测试属冗余，不阻断
    - query 分页游标 `byte_offset.offset` 编码「累计已返回消息数」（非文件字节）属服务内部约定，测试按黑盒透传游标验证翻页，符合调用方不感知契约；分页三页翻到顶 `next_cursor: null` 边界已覆盖
    - 订阅服务测试统一用 `wait_for`（2s 超时抛错）而非静默等待，无阈值掩盖问题；无 `.skip`/`.only`/`@ts-ignore`/恒真断言
- 总体判断：AC1 watcher 主路径、AC6 只读、AC9 route 分权三处无测试，存在 3 个未解决 important，FAIL
- 系统性 follow-up：无

verdict: FAIL

---

## Round 2 (2026-08-05 15:10 UTC+8)

- task：`t210_session_history_watch_service`
- diff_anchor：`0598dab1cf063cdf6941e33dbb0be3eb7798d0dc`
- target：`git diff 0598dab1cf063cdf6941e33dbb0be3eb7798d0dc`
- round：2
- reviewed_at：2026-08-05 15:10 UTC+8

本地复跑 6 个 t210 新增/修改测试文件（68 tests）+ 3 个 renderer 视图测试文件（19 tests）全绿，无 `.skip`/`.only`/`@ts-ignore`/`eslint-disable`（本次 diff 范围内）。以下基于 diff 与源码比对，不采信 task.md 处置表自称。

## Findings（Round 2）

### t210_test_f007 - route_api disabled 契约未锁定（disabled_api 共享 full_api mock）

- 严重度：minor
- 锚点：AC9「preload 的会话历史 API 仅对 route `history`（及需要的 agent route）暴露」——分权路由已测，disabled 侧契约未验证
- 位置：`tests/unit/preload/route_api.test.ts:114`（`disabled_api: { ...full_api }`）、`:135`（`expect(open_spy).not.toHaveBeenCalled()`）
- 问题：`select_session_history_api` 的分权矩阵已补齐（history/agent→full、其余→disabled，identity 断言触达生产 selector），AC9 路由半侧成立。但 disabled 用例的 `disabled_api` 是 `{ ...full_api }` 浅拷贝、与 full 共享同一组 vi.fn spy，其方法全部 resolve 真实数据形态；`expect(open_spy).not.toHaveBeenCalled()` 对纯 selector（从不调用方法）恒真。因此「非 history route 的会话历史 API 不触碰真实 IPC」这一安全属性无有效断言：若 `preload/index.ts:240-254` 的 `session_history_disabled_methods` 被改成抛错或走真实 IPC，本测试全绿。同文件 `select_trend_api` 的 disabled 用例用 distinct 实现并锁定 `resolves.toEqual([])` 契约，session_history 未沿用该模式。
- 建议：disabled 用例构造与 full 不同的 noop 实现（如 `query: vi.fn().mockResolvedValue({ messages: [], next_cursor: null })`、`subscribe: vi.fn().mockResolvedValue({ subscribed: false })`），逐个调用断言 resolve 空值/不抛；与 trend 模式对齐。

### t210_test_f008 - getRendererUrl route_query 编码无测试

- 严重度：minor
- 锚点：AC7「`SESSION_HISTORY_OPEN` 幂等：窗口未开则创建」——首次创建经 URL route_query 传初始定位是 OPEN 契约（spec 上下文区已核实）的一部分，URL 构造侧未验证
- 位置：`src/main/window/window-manager.ts:104-117`（新 `route_query` 参数与 `encodeURIComponent` 拼接）；`tests/unit/main/window_manager.test.ts` 仅测 `setWindowOpenHandler`，未触达 `getRendererUrl`
- 问题：getRendererUrl 重构新增的 `route_query` 路径（`main/index.ts` 用 `route_query: { loc: JSON.stringify(loc) }` 传递 OPEN 首次创建的初始定位）零测试。`history-window-controller.test.ts` 验证了 `create_window` 收到 loc，但 loc → URL query 的编码与拼接（`encodeURIComponent`、`&` join、hash 位置）无断言。若该拼接产出畸形 URL 或漏参数，OPEN 首次创建的目标会话定位丢失，测试全绿。
- 建议：在 `window_manager.test.ts` 补 `createWindowFor("history", { route_query: { loc: "..." } })`，断言 `loadURL` 收到 `?ou_theme=...&loc=...` 且含 `#history`；或直接断言 `getRendererUrl("history", { loc: "…" })` 返回串含编码后的 loc。

## 结论（Round 2）

- 前轮 finding 复核（以 diff 与源码为准）：
    - **t210_test_f001（important，AC9）— 已消除**。`route_api.test.ts:118-137` 补 `select_session_history_api` 全矩阵：`it.each(["history","agent"])` → full_api、`it.each(["usage","setting","tray","unknown"])` → disabled_api，identity 断言触达生产 selector。核心分权路由已验证（disabled 侧契约缺口转新 minor f007）。
    - **t210_test_f002（important，AC6）— 已消除**。`subscription-service.test.ts:260-293`「全程只读」：subscribe+query 后断言源文件字节与 `readdirSync(tmp_dir).sort()` 恒为 `["chat_history.jsonl"]`；append+推送后断言文件 == `first+appended`、目录仍无额外文件。真实走生产 subscribe/query/handle_change，非 mock 替代。
    - **t210_test_f003（important，AC1）— 已消除**。`watcher.test.ts`：`pick_strategy` 8 组合矩阵（win+claude_code→watch、其余 7 组→poll）+ `create_watcher` watch 分支（change→on_change、rename/close→不触发、error→不抛、stop→close 幂等、watch 抛错→退化轮询）。fs.watch 在系统边界 mock（文件系统属合法 mock 边界），测试触达生产 `pick_strategy`/`create_watcher` 真实逻辑。Round 1 建议的真实 fs.watch 集成未照做，改 mock 单测；组合覆盖（start_watcher 策略选择 + on_change→handle_change→增量推送）由 watcher.test + poll 集成测试传递覆盖，按 mock 边界规则判定可接受。
    - **t210_test_f004（minor，opencode 经订阅服务轮询增量）— 修不彻底**。处置表 f004 标注「已修」的内容是 `subscription-service.test.ts:295-325` 的 **claude_code 经 wsl 轮询接入**，这是第三个 JSONL 源、确实新增价值，但原 finding 指名的是 opencode（sqlite `.db`）经 poll 触发 `extract_opencode_incremental` 的接入；当前文件 grep 无任何 `extractor_kind: "opencode"` 用例。opencode 缺口仍在（win 本地 `.db` fixture 可在临时目录构建，可测）。换对象补测不算消除原缺口。
    - **t210_test_f005（minor，grok locator 命中路径）— 仍存在**。`session-locator.test.ts` grok describe 仍仅「wsl_user 未配置时返回 null」一条；`resolve_grok` 的目录段匹配（`session-locator.ts:228-244`）零测试。该行在处置表缺失（见下「编号错位」）。本轮 spec 可测试性声明新增了「WSL 路径 resolve 与 wsl_user 自动探测」豁免（UNC 无法建、t213 验收），可视为对 grok 命中路径测不了的理由补充，但该声明是 diff_anchor 后的 drift（无法从仓内确认用户签核），且原 f005 未走撤回流程。
    - **t210_test_f006（minor，unsubscribe_all 断言过弱）— 已消除**（处置表误标为 f005）。新增「unsubscribe_all 后追加不再推送（行为断言）」（`subscription-service.test.ts:236-258`）：unsubscribe_all 后 append + 推进多周期断言 received 空。原 `not.toThrow()` smoke 用例保留无碍。
    - **处置表编号错位（提示 implementer 修正）**：task.md 处置表 f004 行实为新增的 claude_code 用例（原 f004 是 opencode）；f005 行实为原 f006（unsubscribe_all 行为）；f006 行实为新增的「分页追加新消息不重复不遗漏」用例（本不在 Round 1 findings 中）；原 f005（grok 命中）无对应行。
- 改测方向复核：`first_paint_theme.test.ts` 字面量拆分——**判断为合理调整，非「迁就实现」**。该测试读 window-manager 源文本，重构把字符串拼接改为 query 数组 join 后源中不再存在 `?ou_theme=${theme}#${route}` 字面量（改为 `?${query}#${route}`），原断言必然失败，属「实现变更使旧断言语义失效」的合法适配。拆分后的 `ou_theme=${theme}` + `#${route}` 保留两个契约片段（主题 query 参数 + route hash）。轻微削弱：丢了 `?` 前缀与「theme 紧邻 #route」的顺序约束；若想维持更严可改 `?ou_theme=${theme}`，属 minor 建议，不阻断。renderer view utils 4 处改动仅新增 `sessionHistory` 必填字段 mock，为类型满足的必要加法。本轮无「把旧断言预期改成新实现输出」的改测。
- 本轮新发现：2（均 minor：f007、f008）
- 未进表提示：
    - contract drift（spec.md）：可测试性声明新增「WSL 路径 resolve 与 wsl_user 自动探测」一条 + 未知契约清单 `UNVERIFIED-SPIKE` → 已核实。两者均与实现及现有测试一致（session-locator.test.ts 覆盖显式配置分支与探测失败优雅 null），非 AC 弱化；进程要求核对是否用户签核，仓内无法确认，建议 implementer 收尾时向用户确认该 drift。
    - watcher.test.ts「rename 不触发」固化了当前 change-only 事件过滤。若 win 上编辑器以原子替换（rename 事件上报）写文件会漏推——属实现/设计问题（code review 职责），测试如实反映当前实现，不构成测试可信问题。
    - getRendererUrl 无 route_query 时 URL 仍为 `?ou_theme=${theme}#${route}` 字面组合，原断言本可维持；拆分属选择而非必需，不因此放宽契约判断。
- 总体判断：Round 1 三个 important（f001/f002/f003）均已由触达生产逻辑的测试消除；剩余 2 个 Round 1 minor（opencode 接入、grok 命中）未彻底消除，另有 2 个新 minor。无未解决 critical/important，PASS。
- 系统性 follow-up：无

verdict: PASS
