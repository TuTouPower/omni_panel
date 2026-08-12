---
tid: "t309"
slug: "token_stats_source_visibility"
title: "collector 源清单声明式(hosts 数据化)+ 采集不可用源级可见"
status: "done"
branch: "t309_token_stats_source_visibility"
worktree: ""
review_level: "full"
diff_anchor: "1842d8e4ac09acf97b6e75c0c607b316bcf4eb17"
depends_on: "t308"
conflicts_with: "t312"
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 数据流定案：`sources_status` 随 `TokenStatsUpdate` 上抛 → manager 写入 store（内存态，进程重启复位）→ dashboard IPC 处理器把最新一轮源状态并入 status 快照 → query worker → DTO.status.sources_status → renderer 在新鲜度旁渲染。采集开始前 store 无报告，handler 省略该字段（面板按空处理），保持 dashboard status 精确断言类测试（`toEqual({running,last_updated})`）语义不变。`TOKEN_STATS_STATUS` 通道未扩展（面板只经 dashboard.status 读取）。
- 源状态语义：path null / host 过滤 / grok sessions 目录缺失 → `unavailable` + 原因；reader 抛错（含 ENOENT，替换 t308 前 ENOENT 静默）→ `failed` + 错误信息；正常 → `ok`。
- warn 去重：`grok_missing_warned` 泛化为 `source_warned`（按 src.key，每进程一次），保留 t197 grok 缺失 warn 文案（`grok_wsl sessions dir missing: <path>`）与只告警一次的行为；unavailable/failed 消息格式沿用既有 `${key} <原因>` 约定（key 编码 source/env）。
- 语义变更删除的旧测试（整体删除，理由）：
    1. `collector.test.ts` "one source failure doesn't prevent other sources from being collected"——AC-003 把读取失败日志从 error 级改为 warn 级且文案改为 `${key} read failed: <err>`，旧断言（level=error、消息含 `read failed` 前缀格式）与新语义冲突；隔离语义由新测试 `AC-002/AC-003: a throwing reader is marked failed with the error and warns once` 覆盖（断言其他源仍被采集 + 状态 ok）。
    2. `collector-local.test.ts` "skips unreachable wsl sources without errors"——AC-003 替换 ENOENT/不可用静默后，非 Windows 宿主 wsl 源不再静默（现输出 5 条 unavailable warn + 状态），旧断言（恰好 1 条 postMessage、无日志）失效；由新测试 `t309: marks unreachable wsl sources unavailable on a non-Windows host` 覆盖。
    3. `collector-local.test.ts` "reads local claude jsonl from os.homedir()..." 与 "collect() no-ops when homedir lacks any install data"——同因：缺失 costs.jsonl 的真实 reader ENOENT 抛错现产生 warn（2 条消息），旧"恰好 1 条消息"断言失效；会话读取核心断言与空 home 不崩溃语义分别由新测试 `t309: posts local claude jsonl sessions and reports the missing costs source failed` / `t309: an empty home collects without crashing and reports the missing source failed` 保留。
- 旧测试 mock 仅机械补充接口方法（非改断言）：manager.test `set_sources_status`/`sources_status`、token-stats-ipc.test `sources_status`。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **有 critical / important**：Round 1 code 1 important（f001）、test 1 minor（f001），处置见下表。

### Round 1 (2026-08-11 19:45 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                  | fix_ref                                                                                                                    |
| -------------- | --------- | ------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| t309_code_f001 | important | 已修   | collector-local.test.ts「marks unreachable wsl sources」测试显式注入 set_collector_host("linux")，消除 Windows CI 平台耦合 | tests/unit/main/core/token-stats/collector-local.test.ts:「t309: marks unreachable wsl sources unavailable…」              |
| t309_test_f001 | minor     | 已修   | token-stats-ipc.test.ts 补「store 无报告时 dashboard status 快照省略 sources_status」断言                                  | tests/unit/ipc/token-stats-ipc.test.ts:「TOKEN_STATS_DASHBOARD omits sources_status when the store has no reports (t309)」 |

### Round 2 (2026-08-11 20:00 UTC+8)

| finding_id     | severity | status | rationale                                                                                     | fix_ref                                                            |
| -------------- | -------- | ------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| t309_code_f002 | minor    | 已修   | afterEach 恢复平台推导 host（set_collector_host(process.platform…）），消除文件内测试顺序依赖 | tests/unit/main/core/token-stats/collector-local.test.ts:afterEach |
| t309_code_f003 | minor    | 已修   | 提取 make_dashboard() fixture 工厂，替换三处 verbatim 重复                                    | tests/unit/ipc/token-stats-ipc.test.ts:make_dashboard              |

### Round 3 (2026-08-11 20:10 UTC+8)

| finding_id     | severity | status | rationale                                                                                      | fix_ref                                                            |
| -------------- | -------- | ------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| t309_test_f002 | minor    | 已修   | afterEach 改用 host_from_platform(process.platform) 恢复，与生产推导单一来源，消除 darwin 偏差 | tests/unit/main/core/token-stats/collector-local.test.ts:afterEach |

### Round 4 (2026-08-11 20:20 UTC+8)

code Round 4 PASS（0 finding）；test Round 4 PASS（f002 复核真修，0 新 finding）。无处置项。

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
- 证据：AC-001/002/003 由 collector.test.ts / collector-local.test.ts 注入 host 断言源过滤与三态状态+warn 覆盖；AC-004 由 token_stats_view.test.tsx 状态标记渲染断言；AC-005 由既有 collector 落库回归保持绿。详见 `handoff.json` ac_evidence。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：FAIL（f001 important）
- Round 1 test：PASS（f001 minor）
- Round 2 code：PASS（f002/f003 minor）
- Round 2 test：PASS（0 finding）
- Round 3 code：PASS（0 finding）
- Round 3 test：PASS（f002 minor）
- Round 4 code：PASS（0 finding）
- Round 4 test：PASS（f002 复核真修，0 新 finding）

`single`：

- N/A（full 级）

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- collector 源清单声明式（hosts 数据化 + 按 host 过滤）+ 源级状态可见性（ok/unavailable/failed + lastError 经 TokenStatsUpdate.sources_status 同步面板，warn 日志替换静默）完成；AC 五条全绿，review 4 轮 code + 4 轮 test 全 PASS（1 important + 4 minor 均修）。存量 designmd 失败见 p142。
