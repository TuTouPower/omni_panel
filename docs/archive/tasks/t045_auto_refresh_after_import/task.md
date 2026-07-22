---
tid: t045
slug: auto_refresh_after_import
diff_anchor: "6cebf74abcd845574d3f4d0d5cbee23b80662416"
branch: t045_auto_refresh_after_import
---

# Task t045_auto_refresh_after_import

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- backlog，未开干。

## Review 处置

### Round 1 (2026-07-22 16:30 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                                                                                                                                                                      | fix_ref                                                     |
| -------------- | --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| t045_test_f001 | important | 已修   | 抽 onConfigImported 为工厂 `createOnConfigImported`（`src/main/config-callbacks.ts`）使 wiring 可单测；新增 `tests/unit/main/config-callbacks.test.ts` 断言 `refreshAll` 被调用 + 错误路径不逃逸。index.ts 装配行靠 typecheck 守（同既有 TRAY_REFRESH_ALL/onConfigSaved 惯例） | config-callbacks.ts; config-callbacks.test.ts; index.ts:341 |
| t045_code_f001 | minor     | 遗留   | index.ts 抽 onConfigImported 后仍超 800 行；onConfigSaved 依赖多（currentConfigSnapshot/secretParamKeys/orchestrator/grokOAuthManager/tokenStatsManager/BrowserWindow/main_panel_controller），整体外移是独立重构，不属本 task                                                 | 转独立重构 task                                             |

## 收尾报告

### 验收标准勾选

- [x] 导入配置成功后，所有 enabled connector 自动刷新一次；日志可见 `Refreshing all N enabled connectors` 及各 connector refresh 记录。
- [x] 新增账号无需手动刷新即在用量面板出现。
- [x] 导入取消 / 格式无效 / secrets 写入失败回滚时，不触发全局刷新（`refreshAll` 未被调用）。
- [x] 现有导入流程行为（rebuild scheduler、`secretsStore.importAll`、UI 重载）保持不变。
- [x] 测试覆盖「import 成功 → `refreshAll` 被调用」（config-ipc 契约 + `createOnConfigImported` 工厂单测）与「import 失败/取消 → 不调用」。

### Reviewer verdict

- Round 1 code：FAIL（t045_code_f001 minor → 遗留）
- Round 1 test：FAIL（t045_test_f001 important → 已修）
- Round 2 code：PASS
- Round 2 test：PASS

### 遗留

- `t045_code_f001`（minor）：`src/main/index.ts` 仍超 800 行阈值。`onConfigSaved` 闭包依赖 ~14 个，整体外移属独立重构 task；本 task 仅抽 `onConfigImported`（依赖少）到 `src/main/config-callbacks.ts`，index.ts 净增由 +13 行收敛到 +3 行。后续立独立重构 task 把 `onConfigSaved` + `onConfigImported` 一并外移。

### 结果摘要

- CONFIG_IMPORT 成功后自动全局刷新（抽 `createOnConfigImported` 工厂 + main 装配 `refreshService.refreshAll()`）；import 三态/secrets 回滚路径不触发；tsc 过，vitest 1502 pass。
