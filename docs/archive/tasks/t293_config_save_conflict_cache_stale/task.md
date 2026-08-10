---
tid: "t293"
slug: "config_save_conflict_cache_stale"
title: "修复 config 并发 save 冲突检测被内存缓存击败（lost update）"
status: "done"
branch: "t293_config_save_conflict_cache_stale"
worktree: ""
review_level: "full"
diff_anchor: "4c98f4f789c6d73c4b874df28948fcd3df3388fc"
depends_on: ""
conflicts_with: ""
note: "Grok 2026-08-11 全仓评审 Issue 2：configStore.load 服务内存缓存直到 save 完成，重叠 CONFIG_SAVE/POST /v1/config 双写后写覆盖先写；需单调 generation/内容 hash 或锁内重读"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

## 根因

config-ipc `handleConfigSave` 冲突检测用 `configStore.load()` 重读（旧 ~193-197）。config-store 内存缓存（t195）在 save 完成前不更新，两个重叠 CONFIG_SAVE / POST /v1/config 都读到同一缓存、都过 reload 比对、都入队 save——后写全量覆盖先写，先写变更静默丢失。

## 方案

按 spec「在 save 互斥下做冲突检查」选 merge+validate 入锁临界区方案：config-store 新增 `saveIfBaseMatches(base, config)`，检查与写入同在 save 串行队列内执行（`enqueue` 泛型化复用 tail/inflight 记账）。临界区内 `cached_config ?? load_uncached()` 即最后提交状态，与调用方 `load()` 快照比较；不一致返回 `"conflict"` 不落盘。handleConfigSave 移除旧 reload 检查，改调 `saveIfBaseMatches(current, stripped)`，`"conflict"` 映射为 CONFLICT fail。

单测覆盖重叠 save 断言先写者变更保留、后写者拒绝；非冲突路径 `"saved"` 正常落盘。受接口影响的 AppConfigStore mock 全量补齐 `saveIfBaseMatches`。

## 验证记录

- RED：`tests/integration/config/config-store.test.ts` 两新用例（重叠 save 拒绝 + 非冲突 saved）先失败（TypeError: saveIfBaseMatches is not a function）。
- GREEN：config-ipc + config-store 79 测试通过。
- typecheck：接口新增波及 12 个测试文件 mock，全部补齐后 `tsc --noEmit` 0 错误。
- 受影响 10 文件 257 测试通过。

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

### Round 1 (2026-08-11 02:30 UTC+8)

零 finding，未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/AC-002 由 `tests/integration/config/config-store.test.ts` 重叠 save 用例（恰一 saved 一 conflict、胜者版本落盘）+ `tests/unit/ipc/config-ipc.test.ts` conflict 映射用例覆盖；AC-003 由全量 `pnpm test` 254 files / 2840 passed 守护

### Reviewer verdict

`full`：

- Round 1 code：PASS（零 finding）
- Round 1 test：PASS（零 finding）

### 结果摘要

冲突检测移入 config-store save 串行队列（新增 `saveIfBaseMatches`），以已提交 `cached_config` 为基准，重叠写先提交者胜、后提交者 `CONFLICT` 不落盘，lost update 根治。全量测试与 typecheck 绿。

- 一句话；无额外说明可写「见上」
