---
tid: t038
slug: persist_deleted_connector_tombstones
diff_anchor: "<SHA>"
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

### Round 1 零 finding

两轴均 0 finding 时写：「Round 1 零 finding，未进处置表。」

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t038` 查。

### 验收标准勾选

- [ ] 删除一个内置 connector 后重启，该 connector 不再自动出现
- [ ] `auto_seed_connectors` 对 tombstone id 返回 0 seeded（单测）
- [ ] 未删除的内置 connector 仍正常 auto-seed（单测）
- [ ] `pnpm test` 全绿；`pnpm typecheck` 过
- [ ] 真实打包启动验证：删除 → 重启 → 不复活

### Reviewer verdict

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL
- Round 2 code：N/A / PASS / FAIL
- Round 2 test：N/A / PASS / FAIL

### 遗留

- 无

### 结果摘要

- 见上
