---
tid: "t308"
slug: "token_stats_env_local_paths"
title: "TokenStatsEnv 重构 win→local + 平台感知路径层纯函数 + DB 迁移"
status: "done"
branch: "t308_token_stats_env_local_paths"
worktree: ""
review_level: "full"
diff_anchor: "a5962cfab4c269c4e7627a7b7c74c5ae8b66c588"
depends_on: ""
conflicts_with: "t312,t313"
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 路径层 `src/main/core/token-stats/paths.ts`：`(input, env) -> string|null` 纯函数（input 含 host/homedir/win_home/wsl_distro/wsl_user），`host_from_platform` 映射 win32→windows/darwin→macos/其余→linux；windows 宿主 local 源用 `path.win32.join(win_home,…)`（保证 Linux 测试机上也产出反斜杠路径），非 Windows 用 `path.join(homedir,…)`；wsl 源仅 `host==="windows" && wsl_user!==""` 生成 UNC。grok 仅 wsl 源（spec §3.2）。
- collector 导出 path builder 签名 `(cfg, env, host?, homedir?)` 默认 `collector_host`/`os.homedir()`；新增 `set_collector_host(host)` 测试注入（生产不调用）。sources 数组 key `claude_costs_win` 等 4 个改名 `_local`（scan-state 旧 key 失效触发一次全量重扫，可接受）；`grok_wsl` 不变。`read_source` 对 null 路径直接返回空结果（静默跳过不可达源）。
- 迁移 v7：五表（records/sessions/daily/buckets/hour_rollup）`UPDATE ... SET env='local' WHERE env='win'`，幂等；user_version 6→7。
- dashboard platform schema 同步 `["all","local","wsl"]`，UI 选项 "Win"→"Local"（`TokenStatsView.tsx`）；`scripts/token-stats-baseline.ts` ENVS 同步。
- 测试：`paths.test.ts` 纯函数三平台注入（AC-001/002/003 + schema 断言 AC-004）；`collector-local.test.ts` 非 Windows 宿主 local 源真实读取（`vi.mock(import("node:os"),…)` 重定向 homedir，零 reader mock）；collector.test.ts / collector-state.test.ts 用 `set_collector_host("windows")` 保留 wsl 源集成语义；store 迁移测试灌 win 行跑 v7 断言行数/聚合不变（AC-005/006）。
- 踩坑：`vi.mock("node:os", async (importOriginal)=>…)` 的 `{...actual}` 触发 TS2698（spread unknown）与 lint `no-unnecessary-type-assertion`；改用 vitest 官方 `vi.mock(import("node:os"), …)` 形式（泛型推断模块类型）解决。`vi.spyOn(os,"homedir")` 对 node:os ESM namespace 不可行（Cannot redefine property）。
- session-history 系统（session-locator/subscription-service 等）残留 `env==="win"` 属 spec 非范围（t310 共用路径层）；仅 `src/main/index.ts` sessions_provider 一处 `s.env as Env` cast 保证编译，运行时值透传。
- 全量验证：`pnpm test` 2873 通过，唯一失败为 `designmd.test.ts` 存量 drift（主仓同样失败，与 t308 无关）；`pnpm typecheck`、`pnpm lint`（--max-warnings=0）全过。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **仅有 minor（无 critical / important）**：Round 1 code 1 条 minor、test 0 finding，处置见下表。

### Round 1 (2026-08-11 18:10 UTC+8)

| finding_id     | severity | status | rationale                                                                  | fix_ref                                                                                                         |
| -------------- | -------- | ------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| t308_code_f001 | minor    | 已修   | paths.test.ts 新增「no win env literal remains」扫描断言（8 文件正则校验） | tests/unit/main/core/token-stats/paths.test.ts:「no win env literal remains in collector/ipc/readers (AC-004)」 |

### Round 2 (2026-08-11 18:20 UTC+8)

| finding_id     | severity | status | rationale       | fix_ref |
| -------------- | -------- | ------ | --------------- | ------- | --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------ | --------------------- |
| t308_code_f002 | minor    | 已修   | 守卫正则扩展 `: | =       | === | !==` 形态、白名单补 manager/scan-state/paths/ipc | tests/unit/main/core/token-stats/paths.test.ts:「no win env literal remains…」正则 `/env\s\*(?:: | ={1,3} | !==)\s\*["']win["']/` |

### Round 3 (2026-08-11 18:30 UTC+8)

| finding_id     | severity | status | rationale            | fix_ref                                                           |
| -------------- | -------- | ------ | -------------------- | ----------------------------------------------------------------- | ------ | --- | -------------------- |
| t308_code_f003 | minor    | 已修   | 守卫正则补 `!=` 形态 | tests/unit/main/core/token-stats/paths.test.ts 正则 `/env\s\*(?:: | ={1,3} | !== | !=)\s\*["']win["']/` |

### Round 4 (2026-08-11 18:40 UTC+8)

code Round 4 PASS（0 新 finding，f003 复核真修）；test Round 2 PASS（0 新 finding，Round 1 结论维持）。无处置项。

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
- 证据：AC-001/002/003 由 `paths.test.ts` 三平台注入单测 + `collector-local.test.ts` 真实 homedir 集成覆盖；AC-004 由 schema 运行时断言 + 类型 + 全仓残留守卫断言（12 文件六形态正则）；AC-005/006 由 store 迁移 v7 测试（五表行数/聚合不变）覆盖。详见 `handoff.json` ac_evidence。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS（1 minor）
- Round 1 test：PASS（0 finding）
- Round 2 code：PASS（f002 minor）
- Round 3 code：PASS（f003 minor）
- Round 4 code：PASS（0 新 finding，f003 复核真修）
- Round 2 test：PASS（0 新 finding，Round 1 结论维持）

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- TokenStatsEnv 重构 win→local 完成：env 枚举 `local|wsl`、平台感知路径层 paths.ts（(host,env,cfg)->path|null）、collector/readers 全走路径层、DB 迁移 v7（五表 env='win'→'local'）；AC 六条全绿，review 4 轮 code + 2 轮 test 全 PASS（3 minor 均修）。存量 designmd 失败见 p142。session-history 残留 win 归 t310。
