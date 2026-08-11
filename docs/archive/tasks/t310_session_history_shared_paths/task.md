---
tid: "t310"
slug: "session_history_shared_paths"
title: "session-history locator/subscription/path-index 共用路径层纯函数"
status: "done"
branch: "t310_session_history_shared_paths"
worktree: ""
review_level: "full"
diff_anchor: "8793c4804c7941102ce8f4569519f781c32e2669"
depends_on: "t308"
conflicts_with: "t313"
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- TDD：先写失败测试后实现。新增 locator AC-001/002/003 用例（session-locator.test.ts「t310 平台感知路径层复用」）、path-index AC-004（host 签名失效重建）、subscription AC-005（host=linux/macos 本机会话枚举），首跑红（11 failed / 6 passed，类型与新接口缺失 + env 旧值），实现后转绿。
- 设计决策（对照 spec 上下文区「未知契约」与任务指令）：
    - `LocatorPaths` 新增必填 `host`/`homedir`（对齐 t308 `TokenStatsPathInput`，host 由 index.ts 从 process.platform 推导；必填强制各调用方显式注入，避免隐藏宿主依赖）。
    - locator 路径构建改走 t308 路径层 builder（`claude_projects_path`/`opencode_path`/`kimi_sessions_path`/`grok_sessions_path`），新增导出 `locator_source_path(source, env, paths)` 纯映射函数（resolve\_\* 与单测共用，Windows 宿主路径在 Linux 测试机无法 stat，故纯映射断言 AC-002/003）。
    - `effective_wsl_user` 探测逻辑保留（t308 路径层 builder 把 `wsl_user` 当输入参数，不内置探测），locator 探测后传入；探测只在 env=wsl 时触发，local 解析不探测（避免无 WSL 宿主上不必要 UNC 探测）。
    - `Env` 类型 `"win"|"wsl"` → `"local"|"wsl"`（t308 已把 store 枚举改名，session-history 此前靠 `as Env` 强转透传，t310 对齐；index.ts 注释同步更新、去掉多余 cast）。
    - `locator_paths_key` 签名扩展为 `host|homedir|win_home|wsl_distro|wsl_user`（AC-004；索引文件版本号不变，旧条目按签名不匹配逐条失效重建）。
    - grok 路径解析从「固定 WSL」改为跟随 env（AC-001 要求非 Windows 宿主 grok local 可解析到 ~/.grok/sessions）；生产数据侧 grok 仍仅 WSL（d017），行为不变。
- 既有测试适配（语义变更，非改预期）：env `"win"`→`"local"`（unit/ipc/integration 各测试文件 + watcher pick_strategy 表）；`LocatorPaths` fixture 补 host/homedir；path-index f003 从「换 win_home」改为「换 homedir」（linux host 的 local 根是 homedir，win_home 不再驱动解析）。订阅方 id `win-a`/`win-b` 等不透明字符串不动。
- 验证：`pnpm test` 全量 254 passed / designmd.test.ts 存量失败（与 DESIGN.md drift 门禁相关，非本 task 回归）；typecheck 通过；lint --max-warnings=0 通过。
- finalization 待办（spec「Finalization 时更新的 blueprint」）：architecture.md 会话历史/数据流补充 locator 共用路径层说明；decisions.md 平台感知路径决策的 locator 应用条目。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-11 20:40 UTC+8)

| finding_id     | severity | status | rationale                                                                                                                                                 | fix_ref                                                                                                                                                                                  |
| -------------- | -------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| t310_code_f001 | minor    | 已修   | SESSION_INDEX_VERSION 1→2，旧版索引（含 win env 死条目）整体丢弃重建；补版本不符重建测试                                                                  | src/main/core/session-history/session-path-index.ts:15 + tests/unit/main/core/session-history/session-path-index.test.ts:「t310_code_f001：旧版本索引（含 win env 死条目）整体丢弃重建」 |
| t310_test_f001 | minor    | 已修   | 补 wsl_distro/win_home 单变量变化敏感性用例（locator_source_path 纯映射；windows 路径在 Linux 测试环境不可 stat，签名重建链路已由 host/homedir 用例覆盖） | tests/unit/main/core/session-history/session-path-index.test.ts:「t310_test_f001：wsl_distro/win_home 单变量变化改变 locator_source_path 解析结果」                                      |

### Round 2 (2026-08-11 20:45 UTC+8)

code Round 2 PASS（0 finding，f001 复核真修）；test Round 2 PASS（0 finding，两 f001 复核真修）。无处置项。

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
- 证据：AC-001/002/003 由 session-locator.test.ts 注入 host/homedir/win_home 断言三平台路径与不可用返回；AC-004 由 session-path-index.test.ts host/签名/版本门重建断言；AC-005 由 subscription-service.test.ts linux/macos 真实解析非空列表断言。详见 `handoff.json` ac_evidence。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS（f001 minor）
- Round 1 test：PASS（f001 minor）
- Round 2 code：PASS（f001 复核真修，0 新 finding）
- Round 2 test：PASS（两 f001 复核真修，0 新 finding）

`single`：

- N/A（full 级）

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- session-history 系统共用 t308 平台感知路径层完成：locator 路径解析走 paths.ts、LocatorPaths 增 host/homedir 必填、Env 对齐 local|wsl、paths_key 五段签名 + 索引版本 bump 2；AC 五条全绿，review 2 轮 code + 2 轮 test 全 PASS（2 minor 均修）。存量 designmd 失败见 p142。
