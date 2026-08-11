---
tid: "t296"
slug: "vault_bak_file_permissions"
title: "vault .bak 无 0600 权限硬化"
status: "done"
branch: "t296_vault_bak_file_permissions"
worktree: ""
review_level: "single"
diff_anchor: "af1710e3cb2fd4d22ea66aba3920885b5a2af467"
depends_on: ""
conflicts_with: ""
note: "Grok Issue 5：主 vault 文件 chmod 0600，.bak 用裸 writeFile 依 umask 可能 world-readable；与主文件同硬化"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

## 根因

`write_vault` 主文件写 `writeJsonAtomic(chmod 0o600)` + `set_file_permissions`；`.bak` 副本用裸 `writeFile`（无 mode），多用户 Unix 下依 umask 可能 world-readable，弱于主文件。

## 方案

`.bak` 写入后补 `set_file_permissions(${vault_path}.bak)`（win32 icacls / 其它 chmod 0600），与主文件一致。原有 try/catch 保留（best-effort）。

## 验证记录

- RED：新用例断言 `.bak` mode 0600 失败（实际非 0600）。
- GREEN：vault 33 测试全过。
- typecheck：`tsc --noEmit` 0 错误。

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

### Round 1 (2026-08-11 03:25 UTC+8)

| finding_id    | severity | status | rationale                                         | fix_ref    |
| ------------- | -------- | ------ | ------------------------------------------------- | ---------- |
| t296_gen_f001 | minor    | 已修   | spec 范围「原子路径」与实现不符，改为权限硬化措辞 | spec.md:11 |
| t296_gen_f002 | minor    | 已修   | task.md 遗留孤立「无」占位行，删除                | task.md    |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001 由 `tests/integration/vault/file-vault-backend.test.ts` 新用例断言 `.bak` mode `& 0o777 === 0o600`；AC-002 由既有 vault 32 用例回归 + 全量 `pnpm test` 2848 passed

### Reviewer verdict

`single`：

- Round 1 general：PASS（2 minor）
- Round 2 general：PASS（f001/f002 已修）

### 结果摘要

`write_vault` 的 `.bak` 写入后补 `set_file_permissions`（win32 icacls / 其它 chmod 0600），与主文件一致，备份密文不再随 umask 放宽为 group/other 可读。全量测试 2848 passed + typecheck 绿。
