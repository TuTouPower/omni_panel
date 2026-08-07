---
tid: "t254"
slug: "session_path_persistent_index"
title: "会话文件路径持久索引（消除首屏逐目录扫描）"
status: "done"
branch: "t254_session_path_persistent_index"
worktree: ""
review_level: "full"
diff_anchor: "6d8a32560bc52a9f980dd3f387dbde933d22d8ba"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### Step 1（SPIKE s019）

- `{doctor_cmd}` 无独立命令，靠 `{test_cmd}` 失败信号判定环境。worktree 装依赖；`src/generated/` 需 `mkdir` + `gen-build-info` 生成。
- SPIKE 核实 collector 是否持有可复用 session_id→路径映射：collector 运行在 utility 进程（`utilityProcess.fork`），`SessionScanState.files` 与持久化 `token-stats-scan-state.json` 均持 file_path→session_id **反向**映射；反转后 claude_code subagent 多文件歧义（同 session_id 映射主 transcript + `<id>/subagents/agent-*.jsonl`），且只覆盖「有 usage 数据」的会话。结论：不直接复用，索引由 locator 扫描结果自建。报告 `docs/spikes/s019_collector_scan_mapping/report.md`。
- preflight `--require-verified` PASS。

### Step 2/3（实现）

- 新增 `src/main/core/session-history/session-path-index.ts`：持久索引存储（`<dataRoot>/session-path-index.json`），同步原子写（tmp+rename），损坏/版本不符整体丢弃重建；含 `wsl_user_cache`（distro→user）跨重启缓存。
- 改 `session-locator.ts`：`resolve_session_file` 三阶段——①进程内缓存（paths_key+mtime/size 校验）②持久索引（跨重启命中，stat 校验）③扫描；命中返回免整目录递归扫描；失效（文件移动/删除/内容变化）回退扫描并修正索引。`effective_wsl_user` 探测结果进程内缓存 + 随索引跨重启缓存。`LocatorPaths` 增 `index_dir?`（缺省 data root，测试注入 tmp 隔离）。
- **设计取舍**：AC3「collector 扫描到新会话时索引更新」采用被动方式——新文件出现后 locator resolve miss → 回退扫描发现 → 回填索引，无需 collector 主动联动（utility 进程隔离，s019 判直接复用歧义）。行为满足「新会话可定位打开」。
- 新增 `tests/unit/main/core/session-history/session-path-index.test.ts`（7 tests）：AC1 跨重启命中不扫描（readdirSync 计数=0）、AC2 删除回退 + 索引修正 / 移动后回填新路径、AC3 新文件可定位回填、AC4 反复定位不重复扫描 + WSL 探测一次、索引损坏重建。fs 用 `vi.mock("node:fs")` 包装 readdirSync 计数（沿用 watcher.test.ts 模式）。
- 踩坑：本机真实 WSL 存在，grok resolve 会探测到真实用户并扫描真实会话目录，WSL 探测断言须精确匹配 home 目录本身（`=== home`）而非 `includes("wsl.localhost")`。
- 完整套件：239 files / 2566 passed / 8 skipped，全绿（含 7 个新 t254 测试 + 10 个 locator 回归）。

### Step 4（黑盒）

- `pnpm test`：2566 passed / 8 skipped 全绿；typecheck + lint 通过。
- electron e2e：35 passed / 4 skipped / 0 failed。**踩坑**：首轮 1 failed（plugin_config CPA settings persist）为残留 electron 进程占用环境导致，与 t254 无关——主仓基线 4 passed、清理残留 electron 进程后 worktree 重跑也 4 passed。
- 打包 smoke：4 passed（打包形态下 resolve_session_file 用 getDataRoot() 写索引正常，无白屏/agent 面板正常）。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-07 22:00 UTC+8)

| finding_id     | severity              | status | rationale                                                                          | fix_ref                                    |
| -------------- | --------------------- | ------ | ---------------------------------------------------------------------------------- | ------------------------------------------ |
| t254_code_f001 | important             | 已修   | 探测失败（空串）不写进程内负缓存，下次 resolve 重探测自愈                          | session-locator.ts effective_wsl_user      |
| t254_code_f002 | minor                 | 遗留   | O(N²) 全量写盘：首开批 50 会话规模可接受；同步接口下批间合并破坏测试语义，收益有限 | p076                                       |
| t254_code_f003 | minor                 | 已修   | SessionIndexEntry 加 paths_key，磁盘命中校验防跨配置命中旧路径                     | session-path-index.ts / session-locator.ts |
| t254_code_f004 | minor                 | 已修   | ensure_session_index 载入时同步 wsl_user_cache，写盘保留已持久化探测缓存           | session-locator.ts ensure_session_index    |
| t254_code_f005 | minor                 | 已修   | persist_index_entry 包 try/catch，写失败记日志跳过，回退扫描                       | session-locator.ts persist_index_entry     |
| t254_test_f001 | minor                 | 已修   | 索引损坏重建断言 toBeTruthy→具体 file_path                                         | session-path-index.test.ts                 |
| t254_test_f002 | minor                 | 已修   | 新增 f001 负缓存重探测 + f003 paths_key 校验测试                                   | session-path-index.test.ts                 |
| t254_code_f006 | minor（Round 2 新增） | 已修   | effective_wsl_user 落盘包 try/catch，写失败 log.warn                               | session-locator.ts effective_wsl_user      |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC1 由 session-path-index.test.ts「跨重启命中 readdir 计数=0」断言；AC2 删除/移动回退 + 索引修正测试；AC3 新文件回填测试；AC4 反复定位不重复扫描 + WSL 探测一次测试；AC5 由完整测试 2568 passed + electron e2e（主仓基线 35 passed）+ 打包 smoke 4 passed 确认。

### Reviewer verdict

`full`：

- Round 1 code：FAIL（f001 important WSL 负缓存 + 4 minor）
- Round 1 test：PASS（2 minor）
- Round 2 code：PASS（f001-f005 已修，f002 遗留合理 p076，新增 f006 minor 修复）
- Round 2 test：PASS（f001 断言增强 + f002 换形式覆盖，0 新 finding）

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 会话文件定位建立持久索引：跨重启命中免整目录扫描，失效回退自愈，WSL 用户探测进程内 + 跨重启缓存（探测失败不写负缓存）；登记 p076（O(N²) 写盘权衡）与 p077（electron e2e plugin_config 环境 flaky）。
