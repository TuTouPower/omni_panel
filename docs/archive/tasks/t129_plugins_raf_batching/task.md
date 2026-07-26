---
tid: t129
slug: plugins_raf_batching
diff_anchor: "91992f535668d2544bb5db17242ef9a6bf7534c0"
branch: "t129_plugins_raf_batching"
---

# Task t129_plugins_raf_batching

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 无事项时写：无

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-26 18:31 UTC+8)

Round 1 零 finding，未进处置表。

### Round N (YYYY-MM-DD HH:MM UTC+8)

（有 finding 时用本表；每条 finding 一行。）

| finding_id     | severity                 | status | rationale | fix_ref   |
| -------------- | ------------------------ | ------ | --------- | --------- |
| t129_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t129` 查，不在此记。

### 验收标准勾选

- [x] 同帧 burst N 个 `state-change` 事件合并为 1 次 `setPlugins`（pending Map + rAF flush）。
- [x] unmount 时 pending rAF 被 `cancelAnimationFrame` 取消，pending 清空。
- [x] 测试环境无 rAF 时退化为同步 flush。
- [x] `pnpm typecheck` 通过。
- [x] `pnpm test` 全绿（定向测试与 popup_view 回归测试通过；全量运行中存在多处与 vault/secrets/connector 相关的 flaky 超时，单独重跑通过；与本 task 无关）。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无

### 结果摘要

- `use-plugins.ts` 的 `onStateChange` 改为写入 pending Map 并用 `requestAnimationFrame` 合批 flush；同帧 N 次事件合并为 1 次 `setPlugins`。
- unmount cleanup 取消 rAF 并清空 pending；无 rAF 时同步 fallback。
- 新增 `use_plugins_raf_batching.test.ts` 3 个用例覆盖合批、取消、fallback；调整 `popup_view.test.tsx` 一处因 rAF 延迟需 waitFor 的回归断言。
