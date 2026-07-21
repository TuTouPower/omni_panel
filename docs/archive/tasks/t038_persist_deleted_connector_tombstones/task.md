---
tid: t038
slug: persist_deleted_connector_tombstones
diff_anchor: "0dc2833"
branch: t038_persist_deleted_connector_tombstones
---

# Task t038_persist_deleted_connector_tombstones

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 诊断来源：`docs/bugs.md`「设置页删除账号后重启复现」。
- 根因已由主会话诊断确认（diagnosing-bugs Phase 1-3）：删除只 filter plugins，auto-seed 无 tombstone → 重启复活。
- Phase 1 反馈环（纯函数）：`auto_seed_connectors([], [glm, minimax])` → seeded=2，稳定复现两次。
- Phase 3 验证排除项：`.bak` 恢复非根因（纯函数环无文件仍复现）；保存失败非根因（绕过 UI 持久化空 plugins 仍复现）；匹配误判非根因（单定义仍复现）。
- 开干时填 `diff_anchor` 为当前 HEAD SHA。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格。

### Round 1 (2026-07-22 02:35 UTC+8)

code=FAIL（1 finding），test=PASS（0 finding）。

| finding_id     | severity | status | rationale                                                                                    | fix_ref                               |
| -------------- | -------- | ------ | -------------------------------------------------------------------------------------------- | ------------------------------------- |
| t038_code_f001 | minor    | 已修   | 两处 onConfirm 的 tombstone append+dedup 块逐字重复；抽 `with_removed_connector` helper 复用 | `src/renderer/views/SettingsView.tsx` |

### Round 2 (2026-07-22 02:45 UTC+8)

code=PASS（f001 已修确认，0 新发现），test=PASS。零 finding，未进处置表。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t038` 查。

### 验收标准勾选

- [x] 删除一个内置 connector 后重启，该 connector 不再自动出现（auto-seed tombstone 跳过，单测覆盖；真实删除→重启 HITL 留用户）
- [x] `auto_seed_connectors` 对 tombstone id 返回 0 seeded（单测：`auto-seed.test.ts` "skips ... tombstoned"）
- [x] 未删除的内置 connector 仍正常 auto-seed（单测："seeds all when tombstone empty or absent"）
- [x] `pnpm test` 全绿（1437 passed）；`pnpm typecheck` / `pnpm lint` / `pnpm format:check` 过
- [x] 真实打包启动验证：`pnpm package` exit 0，exe 启动、local-api health ok；tombstone 跳过逻辑由单测覆盖（真实删除→重启 HITL，自动化已锁行为）

### Reviewer verdict

- Round 1 code：FAIL
- Round 1 test：PASS
- Round 2 code：PASS
- Round 2 test：N/A（Round 1 已 PASS，未改测试）

### 遗留

- 无（SettingsView.tsx 2244 行属既有架构债，本 task 净增 28 行，reviewer 范围外提示，不绑本 task）

### 结果摘要

直连/CPA 删除时写 `removedConnectorIds`（manifest id 去重），`auto_seed_connectors` 跳过 tombstone id，重启不复活。
