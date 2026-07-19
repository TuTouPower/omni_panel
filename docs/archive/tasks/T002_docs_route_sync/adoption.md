# Adoption T002

逐条处置 `review_code.md` 和 `review_test.md` 的 finding。流程见 AGENTS.md step 7。

| finding_id     | decision | rationale                                                                                                                                                                               | status   |
| -------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| T002_code_f001 | 不采纳   | task spec 描述 before->after 理所当然会含旧值字面；验收时归档后 grep 或 --exclude-dir=tasks 即可，非产出质量缺陷                                                                        | 无需修改 |
| T002_code_f002 | 采纳     | URL 行 tray `v=<version>` 括注描述不可达行为（getRendererUrl 不注入），误导读者；改为注释说明历史兼容                                                                                   | 已修     |
| T002_test_f001 | 不采纳   | 本次验收零漏报；pattern 优化属未来 task，非本 task 缺陷                                                                                                                                 | 无需修改 |
| T002_test_f002 | 采纳     | 同 T002_code_f002，同一观察，改同处                                                                                                                                                     | 已修     |
| T002_test_f003 | 不采纳   | main-panel-controller.ts:121 `"popup"` 是 T001 范畴字面量残留，use_route 兜底故行为无差异；T002 spec 前提措辞轻微不准但 docs 对齐 WINDOW_CONFIGS 真相源本身无误。开 follow-up task 清理 | 遗留     |
| T002_test_f004 | 采纳     | 同意不补 docs-code 一致性单测；first_paint_theme.test.ts 已守 URL 格式，docs 一致性宜 grep CI 守门                                                                                      | 无需修改 |

## Round 1 (2026-07-20 03:30 UTC+8)

- T002_code_f002 / T002_test_f002 采纳当场修：`docs/specs/window-management.md` URL 行删 tray `v=<version>` 误导括注，改为注释说明 TrayMenu 渲染层历史兼容解析、当前 main 未注入。
- 文档事实类改动，范围极小（删一句括注 + 补一句注释），review 已确认该行为不可达，属澄清非改变事实，不触发完整局部重审。
- T002_test_f003 遗留：`main-panel-controller.ts:121` 仍传 `"popup"` 给 `getRendererUrl`，与 route 统一前提表面冲突；`use_route` 兜底故行为无差异。建议 follow-up task（与 T001_test_f001 行为测试缺口同类）清理。
