# Adoption T001

逐条处置 `review_code.md` 和 `review_test.md` 的 finding。流程见 AGENTS.md step 7。

| finding_id     | decision | rationale                                                                                                                      | status   |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ | -------- |
| T001_code_f001 | 不采纳   | info：实现与 spec 范围一致                                                                                                     | 无需修改 |
| T001_code_f002 | 不采纳   | info：已对齐 window-manager + use-route + App.tsx 真相源                                                                       | 无需修改 |
| T001_code_f003 | 不采纳   | info：preload 层 route 字面量 0 残留，其余出现为 API surface key / 变量名 / MainPanelMode，非 route 语义                       | 无需修改 |
| T001_code_f004 | 不采纳   | 代码注释 `// popup` 描述窗口角色（PopupView）非 route 值，语义正确；超 T001 范围                                               | 无需修改 |
| T001_code_f005 | 不采纳   | info：spec/plan/log 真实反映代码                                                                                               | 无需修改 |
| T001_test_f001 | 不采纳   | preload route switch 行为测试需 jsdom + contextBridge mock，静态源码断言脆；应开单独 task 做正经行为测试，不在本 task 范围内塞 | 遗留     |
| T001_test_f002 | 采纳     | test 描述 "to settings" 与实参 "setting" 错位，文案误导                                                                        | 已修     |
| T001_test_f003 | 采纳     | `it.each` 显式列 `agent`（VALID_ROUTES 之一）提升文档价值                                                                      | 已修     |
