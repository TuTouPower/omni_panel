---
tid: t102
slug: remove_stale_amber_border
diff_anchor: "53862bb9e5e8a3327dc649aaa4d745f27d33fd78"
branch: t102_remove_stale_amber_border
---

# Task t102_remove_stale_amber_border

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 2026-07-24 创建 task。背景：用户要求卡片报错/stale 时不要再渲染黄色边框，只保留报错信息文字。位置 `globals.css:615-617` `.card.stale { border-color: color-mix(amber 34%) }`，触发于 `ProviderCard.tsx:117`。
- 2026-07-24 双审 Round 2 code verdict 为 FAIL，达到 `max_review_round=2`。`t102_code_f002` 因索引仅允许由 `scripts/task.py` 修改而遗留；已执行 `scripts/task.py block t102 --reason review`，等待用户决定加轮或 dropped。
- 2026-07-24 用户批准将 `max_review_round` 提升至 5；review 计数累计，执行 `scripts/task.py resume t102` 后从 Step 5 继续。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-24 22:08 UTC+8)

| finding_id     | severity  | status | rationale                                                                                     | fix_ref                                                                                              |
| -------------- | --------- | ------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| t102_code_f001 | minor     | 已修   | 移除 ProviderCard 与 ProviderAccountRow 无消费者的 `stale` class，保留 stale 徽章与错误内容。 | `src/renderer/components/ProviderCard.tsx:114`；`src/renderer/components/ProviderAccountRow.tsx:123` |
| t102_test_f001 | important | 已修   | 恢复 t004 中断点双列断言，另增 stale CSS 回归断言。                                           | `tests/unit/renderer/globals_css.test.ts:90`                                                         |

### Round 2 (2026-07-24 22:14 UTC+8)

| finding_id     | severity | status | rationale                                                                                                                                     | fix_ref                                      |
| -------------- | -------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| t102_code_f002 | minor    | 遗留   | `docs/tasks_index.json` 只能由 `scripts/task.py` 修改；本 task 不手工修改索引格式。需另立 task 修复脚本的 LF/4 空格序列化后再由脚本重写索引。 | `docs/tasks_index.json:1`；`scripts/task.py` |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [x] 卡片报错或 stale 时，卡片外圈不再有黄色边框；只显示错误信息或「已过期」徽章。
- [x] 正常卡片样式不受影响。
- [x] `pnpm test` 全量通过；如有断言 `.card.stale` 的测试同步更新。

### Reviewer verdict

- Round 1 code：FAIL
- Round 1 test：FAIL
- Round 2 code：FAIL
- Round 2 test：PASS
- Round 3 code：FAIL
- Round 3 test：PASS

### 遗留

- `t102_code_f002`：`scripts/task.py` 将 task 索引写为 CRLF/2 空格，导致 `docs/tasks_index.json` 不能通过 `git diff --check` 与 Prettier。索引只允许脚本修改，需另立 task 修复脚本序列化并经脚本重写。

### 结果摘要

- 删除 `.card.stale` 的 amber `border-color`，保留 stale 徽章、错误文字和 stale 判定。
- `pnpm test` 全量通过（158 files / 1622 tests）；`pnpm typecheck` 通过；改动文件 Prettier 通过。
- 双审 Round 1 修复无消费者 `stale` class 与响应式断言回退；Round 3 测试通过，代码仅遗留 task 索引格式问题。
