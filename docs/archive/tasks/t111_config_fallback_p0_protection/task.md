---
tid: "t111"
slug: "config_fallback_p0_protection"
title: "config-store ENOENT/空文件 fallback 绕过 P0 保护"
status: "done"
branch: "t111_config_fallback_p0_protection"
worktree: ""
review_level: "full"
diff_anchor: "a85a965e34fd05c772d16ffc2bcca2b546be854e"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task t111_config_fallback_p0_protection

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 黑盒验证 `pnpm test` 通过：Test Files 164 passed，Tests 1689 passed（2026-07-25 18:03 CST）。
- 用户批准本轮起双审上限提升到 5 轮，本 task 按 `max_review_round=5` 执行。
- Round 1 发现 3 条 finding（code 2 / test 1），已修复：空/空白文件走 .bak 恢复路径、writeFileAtomic 句柄 finally 关闭、新增 write-json 原子序列 unit test。
- 修复后黑盒验证 `pnpm test` 通过：Test Files 165 passed，Tests 1691 passed（2026-07-25 23:11 CST）。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-25 23:11 UTC+8)

| finding_id     | severity  | status | rationale                                                                 | fix_ref                                          |
| -------------- | --------- | ------ | ------------------------------------------------------------------------- | ------------------------------------------------ |
| t111_code_f001 | important | 已修   | 空/仅空白主文件改为走 schema 失败路径，先尝试 .bak 恢复，不再覆盖有效备份 | src/main/core/config/config-store.ts:148-153,234 |
| t111_code_f002 | minor     | 已修   | writeFileAtomic 用 try/finally 保证 handle.close() 在 sync 抛错时仍执行   | src/main/core/storage/write-json.ts:19-26        |
| t111_test_f001 | important | 已修   | 新增 unit test 校验 open/sync/close/rename 时序及 fsync 失败时仍关闭句柄  | tests/unit/core/storage/write-json.test.ts       |

### Round N (YYYY-MM-DD HH:MM UTC+8)

（有 finding 时用本表；每条 finding 一行。）

| finding_id     | severity                 | status | rationale | fix_ref   |
| -------------- | ------------------------ | ------ | --------- | --------- |
| t111_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t111` 查，不在此记。

### 验收标准勾选

- [x] 空 config.json 启动时抛错，不触发 auto_seed。
- [x] config 目录存在但 config.json 缺失时抛错，不触发 auto_seed。
- [x] 全新安装（目录不存在）正常返回 defaults 并 auto_seed。
- [x] `writeJsonAtomic` 中断后无 null padding。
- [x] `pnpm test` 全绿。

### Reviewer verdict

- Round 1 code：FAIL
- Round 1 test：FAIL
- Round 2 code：PASS
- Round 2 test：PASS

### 遗留

- 无

### 结果摘要

- config-store `load()` 对 ENOENT / 空文件 / 仅空白字符统一走 P0 保护：不 fallback defaults，首次启动（目录不存在）除外；`writeFileAtomic` 改为 tmp → fsync → close → rename 并保证句柄关闭；双审 Round 2 两轴 PASS，`pnpm test` 1691 全绿。
