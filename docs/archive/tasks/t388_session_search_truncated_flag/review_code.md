# Task review t388（reviewer_focus: 代码）

- task：`t388_session_search_truncated_flag`
- spec：`docs/tasks/t388_session_search_truncated_flag/spec.md`
- diff_anchor：`0fb69385a9ddc366f93dcd8853424a3b609a2936`
- target：`git diff 0fb69385a9ddc366f93dcd8853424a3b609a2936`
- round：1
- reviewed_at：2026-08-15 22:10 UTC+8

## Findings

### t388_code_f001 - query_all_sessions 截断判定在「总数恰等于 SEARCH_ENUM_CAP」时误报 truncated=true

- 严重度：minor
- 锚点：AC-002 边界（未超限应 false）；行为缺陷——枚举恰在 cap 处完整结束但信号为 true
- 位置：`src/main/ipc/session-history-ipc.ts:105`、`src/main/core/local-api/server.ts:276`（双入口同式）
- 问题：循环 `while (page.length === CONTENT_SEARCH_PAGE_SIZE && rows.length < SEARCH_ENUM_CAP)` 在 `rows.length < CAP` 失配时退出，此时刚 push 完最后满页，**cap 之后那一页从未被 fetch**。故「匹配会话总数恰为 100_000（1000 个满页）且无更多数据」时：`rows.length==100_000 && page.length==100` → `truncated=true`。数据实际完整，却误报截断。审查方判据「正好达 cap 但无更多页时该 false」未满足。可复现：provider 返回 1000 个满页后空页，断言 truncated 应为 false 而实现给 true。无数据丢失（rows 完整），仅错误提示；该边界需库总量恰为 100_000，实际极罕见。
- 建议：循环退出且 `rows.length >= CAP` 时，额外 fetch 一页（offset=CAP，仅探测不 push，上限 CAP+PAGE_SIZE 仍受限）判定是否真无后续；或接受歧义并在注释/文案中说明「恰等于上限时保守报截断」。

### t388_code_f002 - content_truncated 在搜索清空/新搜索开始时未重置，残留旧提示

- 严重度：minor
- 锚点：AC-003 行为缺陷——提示显隐与当前搜索结果不同步
- 位置：`src/renderer/components/session-library/SessionLibrary.tsx:223-231`
- 问题：搜索 effect 两个清空路径（`!search || !search_content` 分支 line 223-227、新搜索开始 line 229-231）都只重置 `content_sessions` / `content_searching` / `content_search_error`，未重置 `content_truncated`。上一轮 truncated=true 的搜索被清空或换关键词后，提示框在空态/常规列表上方残留，直到下一次响应或错误路径才清除；清空搜索后则无限期残留。可观察：清空搜索框后仍显示「结果已截断」。
- 建议：两个路径补 `set_content_truncated(false)`（与 error 重置并列）。

### t388_code_f003 - 降级提示文案使用渲染端分页计数 `visible`，数字误导且随加载变化

- 严重度：minor
- 锚点：AC-003 提示准确性——用户可感知的数字与实际截断位置不符
- 位置：`src/renderer/components/session-library/SessionLibrary.tsx:506`
- 问题：文案「结果已截断，仅显示前 {visible} 条匹配项」中 `visible` 是渲染端 on-screen 分页量（`PAGE_SIZE=50` 起步，`load_more` 递增，SessionLibrary.tsx:20/35/285）。后端枚举截断发生在上限 `SEARCH_ENUM_CAP=100_000`，`visible` 永远到不了该值，故提示数字始终错误（初始「前 50 条」），且随用户加载更多而跳变（50→100→150）。应传达「枚举达上限截断」，非「屏幕显示条数」。
- 建议：去掉数字，改为「结果已达上限，已截断」类固定文案；或引入 cap 常量并显示「前 {SEARCH_ENUM_CAP} 条」。

## 结论

- 前轮 finding 复核（Round N≥2）：无（首轮）
- 本轮新发现：3 条（全 minor）
- 未进表的提示：
  - 文件过大（预存大文件，本 task 小幅净增，无因过大引发的行为缺陷）：`src/main/core/local-api/server.ts` 1775 行（+23）、`src/preload/index.ts` 704 行（+4）、`src/renderer/components/session-library/SessionLibrary.tsx` 575 行（+14）、`tests/integration/local-api/server.test.ts` 2789 行（+54）、`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx` 1259 行（+19）、`tests/unit/ipc/session-history-ipc.test.ts` 695 行（+41）。
  - spec「风险与回退」称 truncated 为「新增可选字段」，实现为 TS 必填 `boolean`；仓库内全部构造点已更新、JSON 线上多余字段对旧客户端可忽略，无实际破坏，仅措辞差异，未出 finding。
- 总体判断：AC-001/002/003 双入口与 renderer 全落地且有测试覆盖；IPC 与 web server 截断计算、响应结构、legacy/metadata 分支、abort 早退路径完全一致；`SessionHistorySearchContentResponse` 全部构造点（ipc 297/314、preload 292/315、server 490、renderer 257 数组分支）已补 `truncated`，web 客户端 `usageboard-web.ts:758` 仅 cast 不构造，无遗漏；契约向后兼容成立。3 条 minor 均为边界/文案/状态重置级，无未解决 critical / important → PASS。
- 系统性 follow-up：无

verdict: PASS
reviewed_scope: 93b81a9b4341d8ca

## Round 2 复核

- round：2
- reviewed_at：2026-08-15 22:30 UTC+8
- 复核范围：`git diff 0fb69385a9ddc366f93dcd8853424a3b609a2936` 相对当前工作区，逐条核对 f001-f003 修复；全量 IPC + SessionLibrary 测试 60 passed（implementer 自述，行为性修复以代码核对为准）

### 前轮 finding 复核

- **f001（minor）——修不彻底**：边界注释仅补在 IPC（`src/main/ipc/session-history-ipc.ts:103-104`），server 双份逻辑 `src/main/core/local-api/server.ts:261-278` 仍无该边界说明，函数头仅有 t388 AC-001 一句。行为未变（恰满 cap 边界仍误报 true），但因修复方案选「注释说明已知误报」，注释落一半即文档缓解未完整覆盖双入口。严重度维持 minor（纯注释、无行为回归），server 侧仍开。建议：server.ts 函数内补同注释。
- **f002（minor）——已修**：`src/renderer/components/session-library/SessionLibrary.tsx` 两个清空路径均补 `set_content_truncated(false)`（`!search || !search_content` 分支 line 230、新搜索开始 line 233）。上一轮残留提示问题消除。
- **f003（minor）——已修**：文案改为「结果已截断，仅显示部分匹配项」（SessionLibrary.tsx:506）。renderer 测试断言 `textContent` 含「结果已截断」，新文案仍为该子串，测试兼容。

### 本轮新发现

- 无新问题。修复引入的改动均为状态重置/文案/注释，无逻辑分支变化。

## 结论（Round 2）

- 前轮 finding 复核：f002、f003 已消除；f001 修不彻底（IPC 已补注释、server 缺同注释），严重度 minor。
- 本轮新发现：0 条。
- 未进表的提示：无
- 总体判断：f001 残留为纯注释缺口（双份实现文档不一致），无行为缺陷、无 critical / important；仅有 minor 可 PASS。
- 系统性 follow-up：建议 server.ts 补 f001 边界注释（可在 finalization 一并处理，或登记极低优先级 pending）

verdict: PASS
reviewed_scope: aab8d0eca82163b8
