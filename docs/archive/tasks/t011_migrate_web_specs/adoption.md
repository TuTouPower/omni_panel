# Adoption T011

逐条处置 `review_code.md` 和 `review_test.md` 的 finding。流程见 AGENTS.md step 7。

| finding_id     | decision | rationale                                                  | status   |
| -------------- | -------- | ---------------------------------------------------------- | -------- |
| T011_code_f001 | 采纳     | log 分类遗漏 popup_token_panel，留 specs/ 实为 23 个；补正 | 已修     |
| T011_code_f002 | 不采纳   | T014 行是本次登记的 backlog，顺带提交合理，非 T011 偏离    | 无需修改 |
| T011_test_f001 | 采纳     | vitest 验收第 4 条现场跑闭合（1407 passed）+ log 补记      | 已修     |
| T011_test_f002 | 采纳     | popup_view 补回 CPA 负向断言（toHaveCount 0，业务规则）    | 已修     |
| T011_test_f003 | 遗留     | settings_view case 级拆迁留 T012 评估                      | 遗留     |

## 处置说明

- **T011_code_f001（已修，仅文档）**：log "留 specs/（21 个）" 修正为 23 个，补 `popup_token_panel`（需 VITE_ENABLE_TOKEN_PANEL=1 + Electron 种子）+ `settings_view`（回退）。
- **T011_test_f001（已修，触验证）**：现场跑 `pnpm test` → 138 files / 1407 passed，验收第 4 条"vitest 不受影响"闭合。
- **T011_test_f002（已修，触测试）**：popup_view `main content area` case 补回 `await expect(providerNav.getByRole("button", { name: /^CPA$/ })).toHaveCount(0)`——CPA provider 应被过滤出主 UI（业务规则，非硬编码 provider 名）。重跑 `pnpm test:e2e:web` → 21 passed。
- **T011_test_f003（遗留）**：settings_view 文件级回退 specs/ 合理（web SPA 与 Electron UI 结构差异），但 4 个 web 可跑 case 丢失 web 侧覆盖。T012 转 electron/ 时评估 case 级拆迁（web 能跑的拆 web/，electron 专属留 electron/）。
- **T011_code_f002（无需修改）**：T014 图标修复是用户指示新登记的 backlog，tasks_index 同一 commit 提交合理，非 T011 范围偏离。
