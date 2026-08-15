# Task review t388（reviewer_focus: 测试）

- task：`t388_session_search_truncated_flag`
- spec：`docs/tasks/t388_session_search_truncated_flag/spec.md`
- diff_anchor：`0fb69385a9ddc366f93dcd8853424a3b609a2936`
- target：`git diff 0fb69385a9ddc366f93dcd8853424a3b609a2936`
- round：1
- reviewed_at：2026-08-15 07:56 UTC+8

## Findings

### t388_test_f001 - 边界值未测：总数恰等于 SEARCH_ENUM_CAP 时 truncated 判定未被固定

- 严重度：minor
- 锚点：AC-001（"会话库超 SEARCH_ENUM_CAP 时 truncated=true"）与 AC-002（"未超限 truncated=false"）之间的边界语义未锁定
- 位置：`src/main/ipc/session-history-ipc.ts:103-106` / `src/main/core/local-api/server.ts:274-277`（实现）；新增测试仅覆盖「恒满页远超 cap → true」与「少量行未超 → false」
- 问题：实现 `truncated = rows.length >= SEARCH_ENUM_CAP && page.length === CONTENT_SEARCH_PAGE_SIZE` 在「库总数恰等于 100_000、枚举自然结束于 cap」时返回 true（last page 满页、rows 恰达 cap），此时无任何行被截断，为边界误报。新增 AC-001 用例（provider 恒满页）与 AC-002 用例（provider 返回 1 行）都不触达该边界，测试无法拦截此行为偏差。AC-001 字面语义「超限才 true」与该边界结果可能矛盾；若 conservative-true（「结果受限于 cap 上限」）为有意设计，也应补一条边界用例把语义钉死，否则后续改动可能无感知翻转。
- 建议：补边界用例——provider 恰好返回 SEARCH_ENUM_CAP 行后返回空页（自然结束），断言 truncated=false（或按确认后的语义断言 true），并据此微调实现（如需「真截断」可在循环退出后再 probe 一页）。

### t388_test_f002 - renderer 缺 truncated=false/undefined 时不展示提示的负向断言

- 严重度：minor
- 锚点：AC-003（提示仅在 truncated=true 时展示）
- 位置：`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:841-856`
- 问题：AC-003 测试只验证「truncated=true → 提示出现」正向路径。若实现被改成「搜索有响应即展示提示」（`set_content_truncated(response.truncated !== false)` 或直接恒渲染），该测试与既有 renderer 搜索测试（mock 返回对象或空数组，未断言 hint 缺失）都不会挂。正向 mutation（不消费 truncated）已被拦截，负向「恒展示」方向无测试锁定。
- 建议：在既有「未截断搜索」用例（如 t248 AC5 或本文件其他 searchContent mock 返回无 truncated 字段的用例）追加 `expect(screen.queryByTestId("search-truncated-hint")).toBeNull()`，锁定「非 true 不展示」。

## 结论

- 前轮 finding 复核（Round 1）：无
- 改测方向复核：无。三个测试文件 diff 均为纯新增（git diff 确认无删除/修改既有测试行），无迁就实现的改测。
- 本轮新发现：2 条（均 minor）
- 未进表的提示：web AC-002 用例请求未带 `filters.search`，只走 candidates 枚举路径、metadata 走空分支，未覆盖 metadata 枚举的 truncated=false；该路径已由 IPC AC-002（带 search + 空 provider）覆盖，不阻断。另「`candidates.truncated || metadata.truncated` 弱化为只取其一」类 mutation 因两个用例中 candidates 与 metadata 均同时达 cap 而无法区分，属过度细化，不表。
- 总体判断：三条 AC 均由可达生产逻辑的测试覆盖（IPC/web 双入口各 AC-001/002 走真实 query_all_sessions 枚举到 cap；renderer AC-003 走真实 SessionLibrary 组件），mock 均在系统边界，mutation 敏感性核验通过（truncated 恒 false → IPC/web AC-001 各挂；renderer 不消费 truncated → AC-003 挂），无危险模式命中，仅 2 条 minor 边界/负向覆盖缺口，可 PASS。
- 系统性 follow-up：无

verdict: PASS
reviewed_scope: 93b81a9b4341d8ca

---

## Round 2 复核

- round：2
- reviewed_at：2026-08-15 08:01 UTC+8

### 前轮 finding 复核

**t388_test_f001（minor，恰满 cap 边界误报）——已声明意图，可接受。** 修法为注释声明而非行为变更：`src/main/ipc/session-history-ipc.ts:102-104` 新增注释说明边界（总数恰等于 CAP 且最后页满时误报 true，循环因 `rows.length < CAP` 失配退出、cap 之后那页未 fetch 无法区分），并声明「仅误报、无数据丢失、极罕见」。IPC 侧 diff 核实仅注释（+2 行），无行为改动。判定：该边界既非 AC-001「超限」也非 AC-002 清晰「未超限」，conservative-true（可能截断即提示）为安全方向，且 cap=100k 下极罕见，注释声明意图足以关闭 minor。残留：`src/main/core/local-api/server.ts` 的 `session_history_query_all_sessions` 未加平行注释，两入口注释不对称——后续维护者只读 server.ts 无法获知该边界意图；属文档一致性问题，不阻断，列入未进表提示。

**t388_test_f002（minor，renderer 缺负向断言）——已修。** 新增 `SessionLibrary.test.tsx:860`「t388 AC-002 负向」用例：mock `searchContent` 返回 `truncated: false`，先 `waitFor` 「会话 hit」文本渲染（确认响应已被消费、`set_content_truncated(false)` 已执行），再断言 `queryByTestId("search-truncated-hint")` 不在文档。断言与渲染顺序正确，「恒展示 hint」类 mutation 会被该用例拦截。附带改进：`SessionLibrary.tsx` 在 toggle-off 分支（224-229 行区）与搜索起点（228 行区）新增 `set_content_truncated(false)` 重置（Round 1 无），消除新旧搜索间 stale 提示，使负向断言可观察性成立。运行确认 40 passed（含两用例均 313ms 通过）。

### 改测方向复核

本轮无既有测试改动，仅新增用例与注释，无迁就实现的改测。

### 本轮新发现

0 条新 finding（server.ts 注释不对称归入 f001 残留，不新增独立 finding，避免过度细化）。

### 未进表的提示

- server.ts 缺 f001 边界注释（见上）；如需统一可在 server.ts `session_history_query_all_sessions` 补同说明。
- 负向用例 mock 返回显式 `truncated: false`，未覆盖响应缺 `truncated` 字段（undefined）时 `response.truncated !== false` 类 mutation；该变体由既有 searchContent mock 返回无字段对象的测试存在，但未断言 hint 缺失，属可选扩展，不阻断。

### 总体判断

2 条 minor 均处置：f001 以注释声明意图（行为不变，安全方向，可接受），f002 以负向测试修复并附加组件 stale 重置。全部相关测试通过（SessionLibrary 40 / IPC 21 / server 88），无新增危险模式，PASS。

- 系统性 follow-up：无

verdict: PASS
reviewed_scope: aab8d0eca82163b8
