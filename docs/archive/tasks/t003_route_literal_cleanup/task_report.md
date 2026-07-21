# Task report T003

本报告所在 commit 即 task commit，SHA 由 `git log --grep T003` 查，不在此记录。

## spec 验收标准勾选

- [x] `main-panel-controller.ts` L121 = `get_renderer_url("usage")`，无 `get_renderer_url("popup")` 残留
- [x] `route_values.test.ts` 断言五处 route 值统一（实际 6 用例：preload / route_api / main-panel / window-manager / use-route 五真相源 + App.tsx 消费方）
- [x] `pnpm test` 全绿（1338，含新 test）

## adoption 处置摘要

- 已修 4 项 / 遗留 0 项 / 无需修改 7 项（review_code 6 + review_test 5 = 11 finding）
- T003_test_f001 - 补 App.tsx route->view 消费方断言（medium，防 route 改名静默 fall through）
- T003_test_f003 - 补 VALID_ROUTES `new Set([...])` 闭集断言（low，闭集语义显式化）
- T003_code_f005 - spec checkbox 在本 report 勾选
- T003_code_f006 - log.md 填记录
- T003_test_f002 不采纳：main/index.ts 调用点漂移靠核心定义层间接守
- 其余 info/low 无需修改

## 遗留问题

- 无。T001_test_f001（preload route switch 行为测试）+ T002_test_f003（main-panel "popup" 残留）两项遗留由本 task 合并收口：main-panel 字面量已修，route 值统一由 route_values.test.ts 静态断言守护。
