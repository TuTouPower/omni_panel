---
tid: t100
slug: l2_state_reset_on_collapse
diff_anchor: "b5d2c4766369e593a073184d381056fc687c4a73"
branch: t100_l2_state_reset_on_collapse
---

# Task t100_l2_state_reset_on_collapse

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 2026-07-24 创建 task。背景：多账号卡片折叠后再展开仍停留「N账号」而非「概览」。根因 `ProviderCard.tsx:119` `l2open` 是 useState，与 `expanded` 正交但未定义折叠时语义。`804e3c2` (2026-06-09) 引入 L2 seg 时留下的设计漏洞。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-24 13:29 UTC+8)

| finding_id     | severity | status | rationale                                                                              | fix_ref                  |
| -------------- | -------- | ------ | -------------------------------------------------------------------------------------- | ------------------------ |
| t100_code_f001 | minor    | 遗留   | `ProviderCard.tsx` 已超 400 行；本 task 仅修复折叠状态，拆分职责超出范围。             | 后续修改该组件时处理     |
| t100_code_f002 | minor    | 遗留   | `provider_card.test.tsx` 已超 600 行；本 task 仅补最小状态序列回归，拆分测试超出范围。 | 后续修改该组件测试时处理 |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [x] 多账号卡片展开 → 点「N账号」→ 折叠 → 再展开，显示「概览」内容，L2 高亮在「概览」。
- [x] `provider_card.test.tsx` 新增用例覆盖上述序列。
- [x] `pnpm test` 全量通过。

### Reviewer verdict

- Round 1 code：FAIL（2 项 minor 遗留）
- Round 1 test：PASS
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- `t100_code_f001`：`ProviderCard.tsx` 442 行，后续修改时拆分 L2 或内容渲染职责。
- `t100_code_f002`：`provider_card.test.tsx` 925 行，后续修改时拆分测试与共享 fixture。

### 结果摘要

- 卡片 `expanded === false` 时重置 `l2open`，防止账号明细跨折叠保留。
- 新增受控 prop 状态序列测试；`pnpm test` 158 files / 1619 tests、`pnpm typecheck`、改动文件 Prettier 通过。
- `pnpm check` 仍受未改动的 `src/renderer/components/UsageRows.tsx:92` 与 `tests/integration/connector/exa_connector.test.ts:187` lint 错误阻断。
- 运行隔离 Electron 测试实例后，当前 harness 无法驱动原生 Electron 窗口；浏览器访问 renderer dev server 缺少 preload API，GUI 实机验证未完成。
