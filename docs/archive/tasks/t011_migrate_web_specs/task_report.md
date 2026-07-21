# Task report T011

本报告所在 commit 即 task commit，SHA 由 `git log --grep T011` 查，不在此记录。

## spec 验收标准勾选

- [x] 可平移 + openSettings rewrite 的 spec 迁到 `tests/e2e/web/`。 — 5 个：app_lifecycle、popup_demo_alignment、popup_platform_behavior、popup_view、scheduler。
- [x] `pnpm test:e2e:web` 全绿（含新迁 spec）。 — 21 passed（5 新迁 + T010 示范 popup_theme + 既有 web spec）。
- [x] 迁移失败的 spec 留 `specs/`（T012 收 electron/），不强行迁。 — settings_view 回退（web SPA UI 差异，2 case 失败）；23 个留 specs/（Electron 专属 / restart / 窗口约束 / seed_fake_plugin 硬编码）。
- [x] `pnpm test`（vitest）不受影响。 — 138 files / 1407 passed。

## adoption 处置摘要

- 已修 3 项 / 遗留 1 项 / 无需修改 1 项
- T011_code_f001 — 采纳：log 分类补 popup_token_panel + settings_view（21→23）
- T011_code_f002 — 无需修改：T014 行顺带提交合理
- T011_test_f001 — 采纳：现场跑 vitest 闭合验收第 4 条
- T011_test_f002 — 采纳：popup_view 补回 CPA 负向断言（业务规则）
- T011_test_f003 — 遗留：settings_view case 级拆迁留 T012

## 遗留问题

- **settings_view case 级拆迁**（test_f003）：文件级回退 specs/ 合理，但 4 个 web 可跑 case（sidebar/nav/颜色/样式）丢失 web 侧覆盖。T012 转 electron/ 时评估 case 级拆（web 能跑的拆 web/）。
- **留 specs/ 的 23 个**（T012 转 electron/）：托盘/多窗口/powerMonitor/restart/窗口约束/seed_fake_plugin 硬编码 fake 断言——这些需 Electron 驱动或重写断言才能 web 化，T012 整理为独立 electron project 手动跑。
- **T010 遗留 vite.web.config unused directive**：本 task 顺手修（call site @ts-expect-error 删，allowDefaultProject 让 .mjs 有类型），typecheck 干净。
