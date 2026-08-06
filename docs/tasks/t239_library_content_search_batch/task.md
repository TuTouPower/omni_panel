---
tid: "t239"
slug: "library_content_search_batch"
title: "会话库查询通道优化（内容搜索批量化 + 摘要轻量通道）"
status: "active"
branch: "t239_library_content_search_batch"
worktree: "../omni_usage_t239"
review_level: "full"
diff_anchor: "e6e0b6bb1fc7212d413f3a5d0af1ee38796a4c6b"
depends_on: "t235"
conflicts_with: "t232,t233,t234,t237"
schedule_status: "scheduled"
note: "merged from t240"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 新增共享 IPC 类型与通道：`SESSION_HISTORY_SEARCH_CONTENT` / `SESSION_HISTORY_SUMMARIES` 及对应 request/response 类型，扩展 `SessionHistoryApi`。
- 提取器新增轻量首条 user 扫描：`extract_*_first_user`，JSONL 源从头按行解析，opencode 走 `rowid` 升序、limit 50 的只读 SQL；均不调用全量提取。
- `SessionHistorySubscriptionService` 新增 `searchContent`（默认并发 3、`AbortSignal`）与 `summaries`（默认并发 5），复用提取缓存；为便于单测插桩，将 `extract_full` / `extract_incremental` / `extract_first_user` 改为 `protected` 方法。
- IPC handler 注册两个新通道，resolve 失败时跳过未命中 loc。
- preload 三档（full / open-only / disabled）均暴露 `searchContent` / `summaries`；web bridge 提供兼容空实现。
- `SessionLibrary` 改为 300ms 防抖批量内容搜索 + `AbortController` 取消旧查询；摘要改为按可见会话批量 `summaries` 并复用 t237 的 pending/flush 机制合批更新；`content_filtered` 用 `Set` 去重避免 O(n²)。
- 测试覆盖：extractor 首条 user 各种场景、subscription-service 批量搜索/并发/中断/缓存、IPC handler 新通道、renderer 防抖/取消/批量摘要。
- 发现并同步更新多处测试 mock（popup/settings/route_api）以匹配扩展后的 `SessionHistoryApi`。
- 生成 `src/generated/build-info.ts` 用于 typecheck，不纳入 commit。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id     | severity                 | status | rationale | fix_ref |
| -------------- | ------------------------ | ------ | --------- | ------- |
| t000_code_f001 | critical/important/minor | 已修   | 一句话    | 文件:行 |
| t000_test_f002 | minor                    | 遗留   | 一句话    | pNNN    |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
  - AC1/2/3：`SessionLibrary.test.tsx` 中「内容搜索防抖」与「内容搜索切换关键词时丢弃旧查询结果」通过 fake timers 断言 300ms 防抖与旧结果被丢弃。
  - AC4：`SessionLibrary.test.tsx` 中「包含消息内容」并集测试保持通过，结果与改前一致。
  - AC5：`subscription-service.test.ts` 中「并发上限不超过 3」插桩断言 `max_running <= 3`。
  - AC6：`subscription-service.test.ts` 中「summaries 缓存命中时不调用轻量扫描」与 opencode 摘要测试插桩断言未走全量提取。
  - AC7：extractor 首条 user 测试覆盖顶部 user、非 user 后 user、无 user、缺失文件/db 回空串；subscription-service summaries 测试断言 80 字符截断。
  - AC8：`SessionLibrary.test.tsx` 中「批量摘要：一次 summaries 更新全部可见卡片」断言只调用一次 `summaries` 且 `query` 不被调用。
  - AC9：全部现有 `SessionLibrary` 测试与新增测试通过，卡片选择/预览/打开交互未改动。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS
- Round 1 test：PASS

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

实现并通过了批量内容搜索与轻量摘要 IPC、主进程批量接口、renderer 防抖/取消/批量摘要以及全部相关单测；lint/typecheck 通过。
