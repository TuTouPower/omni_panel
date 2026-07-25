---
tid: t117
slug: split_collector_serde
diff_anchor: "be9dbb3447dd211b95969533da1b0c645721c9e4"
branch: t117_split_collector_serde
max_review_round: 5
---

# Task {tid}\_{slug}

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 2026-07-26 start。diff_anchor `be9dbb3`（t116 drop 后 main HEAD）。collector.ts 517 行超 400 阈值（t114 遗留 f003）。
- 新建 `src/main/core/token-stats/scan-state.ts`（181 行）：迁移 `SerializedScanState`/`SerializedScanBucket`/`ScanStateMaps` 类型 + `serialize_bucket`/`deserialize_bucket`/`serialize_state`/`save_state`/`load_state`。函数接 `ScanStateMaps` 参数（不持有模块级状态）+ `on_warn: (msg) => void` 回调（避免反向依赖 collector 的 `forward_log`）。
- `collector.ts`：删内联 serde（~170 行），import scan-state（别名 `scan_serialize`/`scan_save`/`scan_load` 避免与 wrapper 同名），保留薄 wrapper（`serialize_state`/`save_state`/`load_state` 旧签名，读模块级 maps + 传 `forward_log` 作 on_warn）——测试透明（collector-state.test.ts 不改）。删 `writeJsonAtomic` import（迁至 scan-state）。
- 行数：collector.ts 517 -> 395（< 400 阈值，达标）；scan-state.ts 181。
- 验证：`pnpm test` 1739 passed / 167 files；`pnpm typecheck` 0 错误（含原 pre-existing write-json/TS4111 已在 main hotfix 修）；改动文件 ESLint 0 错误。serde 行为不变（collector-state.test.ts 7 用例全绿，round-trip/损坏回退/records 丢弃/auto-save 集成均通过）。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 零 finding

两轴均 0 finding 时写：「Round 1 零 finding，未进处置表。」不必建表。

### Round N (YYYY-MM-DD HH:MM UTC+8)

（有 finding 时用本表；每条 finding 一行。）

| finding_id       | severity                 | status | rationale | fix_ref   |
| ---------------- | ------------------------ | ------ | --------- | --------- |
| {tid}\_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [x] `collector.ts` 行数 < 400（517 -> 395，serde 已迁出）。
- [x] `pnpm test` 全绿（collector-state.test.ts 7 用例不回归）。
- [x] `pnpm typecheck` 0 新增错误（原 pre-existing 已在 main hotfix 修）。
- [x] serde 行为不变：`load_state` 损坏/缺失回退、save round-trip 与 t114 一致（既有 7 用例 + auto-save 集成验证）。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：PASS

### 遗留

- 无本 task 遗留。test reviewer 范围外建议：scan-state.ts 作为独立公开模块无直接单测；后续若 wrapper 引入参数变换或该模块被其他调用方直接使用，建议补 `tests/unit/main/core/token-stats/scan-state.test.ts`。

### 结果摘要

- serde 从 collector.ts 抽到 `src/main/core/token-stats/scan-state.ts`（181 行）：类型 + serialize_bucket/deserialize_bucket/serialize_state/save_state/load_state，接 `ScanStateMaps` 参数 + `on_warn` 回调（不反向依赖 collector）。
- collector.ts 517 -> 395 行，薄 wrapper（旧签名，读模块级 maps + 传 forward_log）保持测试透明（collector-state.test.ts 0 改动）。删 writeJsonAtomic import（迁至 scan-state）。
- `pnpm test` 1739 passed / 167 files；`pnpm typecheck` 0 错误；改动文件 ESLint 0 错误。
