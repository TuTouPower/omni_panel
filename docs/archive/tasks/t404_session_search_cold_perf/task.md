---
tid: "t404"
slug: "session_search_cold_perf"
title: "会话库内容搜索冷缓存性能修复:候选分块+增量反馈"
status: "done"
branch: "t404_session_search_cold_perf"
worktree: ""
review_level: "full"
diff_anchor: "d51983074bda02abab9f3dba2cd01fdb192639e6"
depends_on: ""
conflicts_with: "t414,t415,t419,t421,t422,t424"
schedule_status: "scheduled"
note: "p186;4000 会话冷缓存首次搜索 45s+;searchContent 全量解析+无进度反馈"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

### 需求确认（2026-08-16，用户）

- 用户报：会话库搜「启用」只出 21 个，怀疑搜索逻辑错。
- task-bug 复现：功能正常，4000 会话冷缓存首次内容搜索 45s+，UI 无进度，用户中断看到中间态。
- 用户批准立项修复：降低冷缓存首次响应、加进度反馈、增量结果。

### Step 1 SPIKE

- doctor：无
- s004 编号重复致 `spikes.py new` 失败 → 手建 `docs/spikes/s030_search_content_incremental_ipc/`
- 选型 (A) renderer 分块多次 searchContent：Request `offset`/`limit`，Response `progress`；HTTP/IPC 同形
- findings：d039；preflight `--require-verified` PASS

### 实现要点

- `clamp_search_content_range` 纯函数 + IPC/local-api 仅 resolve 本批 slice
- renderer `CONTENT_SCAN_BATCH_SIZE=64` 循环合并；`live_ref` 防 abort 后覆盖新搜索终态
- 末批后写终态前再读 live_ref（竞态修复）

### 验证

- `pnpm test`：3272 passed
- `pnpm typecheck`：PASS
- 本 task 触及文件 eslint max-warnings=0 PASS（基线另有 t401/t403 无关 lint 存量）

## Review 处置

### Round 1 (2026-08-16 03:13 UTC+8)

Round 1 零 finding，未进处置表。

### Round 2 (2026-08-16 03:20 UTC+8)

Round 2 零 finding（收尾文档致 scope 重锚；无代码变更），未进处置表。

### Round 3 (2026-08-16 03:22 UTC+8)

Round 3 零 finding（finish 归档路径变更致 scope 重锚；无代码变更），未进处置表。

## 收尾报告

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：见 `handoff.json` 的 `ac_evidence`

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：PASS
- Round 2 test：PASS
- Round 3 code：PASS
- Round 3 test：PASS

### 结果摘要

内容搜索改为候选分块 + 进度「已扫描 N/M」+ 增量结果；取消中止分块循环。闭环 p186；ADR 020；d039。
