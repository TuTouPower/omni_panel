---
tid: "t166"
slug: "collector_records_incremental"
title: "collector records emit 增量化与 config 保存去抖"
status: "done"
branch: "t166_collector_records_incremental"
worktree: ""
review_level: "full"
diff_anchor: "d1ef4847473baf4c3019812281c69f639fbba4ab"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task t166_collector_records_incremental

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- diff_anchor: d1ef484（main，含 t162/t163/t164/t165）。
- 范围决策：放大器 D（config 去抖）完成；放大器 C（records 全量重发增量协议）标遗留。
- 理由：t162/t163/t164/t165 已解决查询/渲染/窗口端内存问题（用户感知的"打开面板涨 500MB"已消除）。C 是写入端放大（IPC/WAL），降上限非根因（单 session 全量重发），真正的 message_id diff 增量协议涉及 claude-reader + scan-state + collector 三处协议变更，风险高于剩余收益。
- D 实现：manager.update_config 加 same_config 去抖（JSON.stringify 对比），config 未变跳过 postMessage。消除 index.ts 每次 config 保存（4720次/天）触发的全量 collect。
- 黑盒：pnpm test 1904 全过（+2 manager 去抖测试）。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格。

### Round N (YYYY-MM-DD HH:MM UTC+8)

（有 finding 时用本表）

| finding_id | severity | status | rationale | fix_ref |
| ---------- | -------- | ------ | --------- | ------- |

## 收尾报告

### 验收标准勾选

- [x] config 保存（tokenStats 未变）不触发 collector `collect()`。（D 完成）
- [ ] 活跃 session 变化时 emit records ≈ 新增 message 数。（C 遗留）
- [ ] 单次 `collect()` records emit 量从 20 万降至千级。（依赖 C，遗留）
- [ ] 主进程 WAL 增长显著下降。（依赖 C，遗留）
- [x] 单测覆盖 config 去抖。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 放大器 C（records 全量重发增量协议）：scan-state 需缓存每 session/文件的 message_id 集，collector emit 时 diff 只发新增。涉及 claude-reader.ts（SessionFileFacts）+ scan-state.ts（序列化）+ collector.ts（emit）三处协议变更。查询/渲染端已优化（t162/t164），C 属写入端优化，风险高于剩余收益，留独立 task。

### 结果摘要

放大器 D（config 去抖）落地：manager.update_config 对比新旧 config，相同跳过 postMessage，消除无关 config 保存触发的全量 collect。放大器 C（records emit 增量化）遗留。
