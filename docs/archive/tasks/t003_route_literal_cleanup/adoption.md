# Adoption T003

逐条处置 `review_code.md` 和 `review_test.md` 的 finding。流程见 AGENTS.md step 7。

| finding_id     | decision | rationale                                                                                                    | status   |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------------ | -------- |
| T003_code_f001 | 不采纳   | info：L121 修正正确（route 语义）                                                                            | 无需修改 |
| T003_code_f002 | 不采纳   | info：L126/L181 shell mode 保留正确                                                                          | 无需修改 |
| T003_code_f003 | 不采纳   | info：route_values 五处断言与真相源一致                                                                      | 无需修改 |
| T003_code_f004 | 不采纳   | low：`not.toContain` 限定子串无误报，脆性权衡可接受                                                          | 无需修改 |
| T003_code_f005 | 采纳     | suggestion：spec checkbox 收尾在 task_report 勾选                                                            | 已修     |
| T003_code_f006 | 采纳     | suggestion：log.md 填记录                                                                                    | 已修     |
| T003_test_f001 | 采纳     | medium：App.tsx route->view 消费方漏断言，route 改名静默 fall through 风险                                   | 已修     |
| T003_test_f002 | 不采纳   | low：main/index.ts 调用点多，核心定义层（WINDOW_CONFIGS/VALID_ROUTES/preload）已守，调用点漂移靠真相源间接守 | 无需修改 |
| T003_test_f003 | 采纳     | low：VALID_ROUTES/WINDOW_CONFIGS 闭集语义，补 `new Set([...])` 精确断言                                      | 已修     |
| T003_test_f004 | 不采纳   | info：`not.toContain` 设计稳                                                                                 | 无需修改 |
| T003_test_f005 | 不采纳   | info：测试命名组织合理                                                                                       | 无需修改 |

## Round 1 (2026-07-20 03:50 UTC+8)

- T003_test_f001 采纳当场修：`route_values.test.ts` 加 `App.tsx route->view switch consumes the four routes` it（断言 case setting/tray/agent/default，not case settings/popup）。
- T003_test_f003 采纳当场修：`renderer use-route VALID_ROUTES` it 改为断言 `new Set(["usage", "setting", "agent", "tray"])` 精确闭集。
- T003_code_f005 采纳：spec 验收 checkbox 在本 task_report 勾选（spec 归档不改）。
- T003_code_f006 采纳：log.md 填本 task 记录。
- 重跑黑盒：`pnpm test` 1338 全绿（route_values 6 用例）。
