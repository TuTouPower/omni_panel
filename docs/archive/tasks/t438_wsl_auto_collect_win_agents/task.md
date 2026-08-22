---
tid: "t438"
slug: "wsl_auto_collect_win_agents"
title: "WSL 宿主自动采集 Windows agent 为 env=win"
status: "done"
branch: "t438_wsl_auto_collect_win_agents"
worktree: ""
review_level: "full"
diff_anchor: "4c6a0b3a51a563dc62c336df5b9b9011d4ddfff6"
depends_on: "t437"
conflicts_with: ""
note: "来源 p204；依赖 t437"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

无

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-23 05:13 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t438_code_f001|minor|已修|一次性注入改 resolve 时惰性发现（模块级缓存+`set_win_home_wsl_probe` 测试注入），index.ts 传 null；`""` 哨兵=显式禁用（对齐 wsl_user 语义）|src/main/core/session-history/session-locator.ts effective_win_home_wsl；src/main/index.ts:494|
|t438_code_f002|minor|已修|exec_windows 加 `timeout: 5000`，超时按失败处理|src/main/core/token-stats/win-home-discovery.ts:81|
|t438_code_f003|minor|已修|deps 加 `on_decision` 钩子，多候选取舍/shell 回退留痕；locator 接 `log.warn`、collector 接 `forward_log`|src/main/core/token-stats/win-home-discovery.ts:39；collector.ts effective_win_home_wsl|
|t438_code_f004|minor|遗留|spec 非范围允许不做关闭开关；遗留决策（设置 UI 开关 vs 配置文档化）|p206|
|t438_test_f001|minor|已修|补「null 轮级缓存、下轮重探自愈」用例；实现同步修正为轮级缓存（避免一轮内每源重探反复 spawn powershell）|tests/unit/main/core/token-stats/collector.test.ts t438 describe；collector.ts win_home_wsl_probed_this_round|
|t438_test_f002|minor|已修|paths_key 改用 effective win_home_wsl，补「发现结果变化→旧索引条目失效重扫」用例|src/main/core/session-history/session-locator.ts locator_paths_key；session-locator.test.ts t438 describe|

### Round 2 (2026-08-23 05:25 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t438_code_f005|important|已修|locator 发现失败（null）加 60s 负缓存时间窗节流（对齐 collector 轮级节流），窗后重探自愈；补节流与自愈两个用例|src/main/core/session-history/session-locator.ts win_home_wsl_null_until；session-locator.test.ts t438 describe|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：每条 AC 在 `handoff.json` 的 `ac_evidence` 有对应引用（覆盖闭合门禁强制）。摘要：linux 宿主零配置自动发现 `/mnt/c/Users/<u>`（s033/d049 实测规则），win 五源采成 env=win 并注入会话库候选；发现失败仅 win 源 unavailable；placeholder 按勾选态区分「win 源未发现」与「无匹配」；索引按 effective win_home_wsl 失效重建；重复采集主键幂等；黑盒对真实 /mnt/c 采到 57 个 env=win kimi 会话（AC-008 目标会话存在性已确认，部署后验证标 [deploy]）。

### Reviewer verdict

`full`：

- Round 1 code：PASS（4 minor）；Round 1 test：PASS（2 minor）
- Round 2 code：FAIL（1 important：f005 惰性发现无节流）；Round 2 test：PASS
- Round 3 code：PASS（f005 已消除）；Round 3 test：PASS
- Round 4 code：PASS（窄复核，docs 固化增量）；Round 4 test：PASS（窄复核）

遗留：p206（win 源关闭开关决策）、p207（worktree electron 依赖不完整，实施期发现）。

### 结果摘要

- WSL/Linux 宿主零配置对称采集 Windows 侧 agent 数据（env=win），p204 场景闭环；review 四轮收敛 overall=PASS。
