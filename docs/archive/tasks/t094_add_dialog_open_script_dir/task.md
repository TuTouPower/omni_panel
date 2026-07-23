---
tid: t094
slug: add_dialog_open_script_dir
diff_anchor: "b4f7c9c3601fe4dde23750321873cac163cd6df0"
branch: t094_add_dialog_open_script_dir
---

# Task t094_add_dialog_open_script_dir

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 用户要求：添加账号弹窗加按钮一键打开 `userData/connectors` 脚本目录，为自定义 connector（t095）提供入口；参考 https://github.com/router-for-me/CLIProxyAPI 。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

### Round 1 (2026-07-24 06:20 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                                 | fix_ref                                                              |
| -------------- | --------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| t094_code_f001 | important | 已修   | mkdir catch 静默吞错误 + openPath 返回值 void 丢弃，失败不可观测。抽纯函数 open_connectors_dir，mkdir 失败记 warn、openPath 错误记 warn。 | src/main/core/open-connectors-dir.ts; src/main/index.ts handler 接线 |
| t094_code_f002 | minor     | 已修   | await import().then() 混合风格改顶部 `import { mkdir }`。                                                                                 | src/main/index.ts:16                                                 |
| t094_code_f003 | minor     | 已修   | shell.openPath 错误字符串检查并记 warn。                                                                                                  | src/main/core/open-connectors-dir.ts                                 |
| t094_test_f001 | important | 已修   | 补按钮渲染 + 点击调用 openConnectorsDir 两个组件测试。                                                                                    | tests/unit/renderer/components/add_account_dialog.test.tsx           |
| t094_test_f002 | important | 已修   | 抽 open_connectors_dir 纯函数 + 依赖注入，补三路径单测（成功/mkdir失败/openPath失败）。                                                   | tests/unit/main/open-connectors-dir.test.ts                          |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t094` 查，不在此记。

### 验收标准勾选

- [x] 添加账号弹窗有"打开脚本目录"按钮。
- [x] 点击后系统文件管理器打开 `userData/connectors` 目录。
- [x] 目录不存在时自动创建。
- [x] `pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿（本 task 文件零 lint 错误）。

### Reviewer verdict

- Round 1 code：FAIL（3 finding：f001 静默吞错误 / f002 import 风格 / f003 openPath 错误丢弃）-> 全已修
- Round 1 test：FAIL（2 finding：f001 按钮零测试 / f002 handler 零测试）-> 全已修
- Round 2 code：PASS（零新发现）
- Round 2 test：PASS（零新发现）

### 遗留

- 无

### 结果摘要

- 抽 `open_connectors_dir` 纯函数（src/main/core/open-connectors-dir.ts）+ 依赖注入，覆盖 mkdir/openPath 失败路径可观测。
- IPC 通道 `SETTINGS_OPEN_CONNECTORS_DIR`，preload `settings.openConnectorsDir` 暴露，类型入 `UsageboardApi.settings`。
- AddAccountDialog VendorPicker 加「打开脚本目录」按钮。
- 测试：open-connectors-dir.test.ts 三路径 + add_account_dialog.test.tsx 按钮渲染/点击两用例。
- spec：docs/specs/connector-user-scripts-entry.md。
