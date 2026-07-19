# Task report T002

本报告所在 commit 即 task commit，SHA 由 `git log --grep T002` 查，不在此记录。

## spec 验收标准勾选

- [x] `grep -rn "route=popup\|route=settings" docs/` 无匹配（仅 T002 spec 自身描述命中，归档后验零匹配）
- [x] `grep -rn "popup/settings/tray" docs/` 无匹配（architecture L103 已改 usage/setting/tray/agent）
- [x] ui-views.md 含 TokenStatsView 章节（L72，6 组件 + 数据管线 + 过滤维度）
- [x] window-management.md 含 agent 行（L12，900×700 frame:true）
- [x] `pnpm test` 仍全绿（重跑 1332，纯文档不影响代码）

## adoption 处置摘要

- 已修 2 项 / 遗留 1 项 / 无需修改 3 项（review_code 2 + review_test 4 = 6 finding）
- T002_code_f002 + T002_test_f002 - window-management.md URL 行删 tray `v=<version>` 误导括注，改注释说明历史兼容（同一观察，两 agent 各报一条）
- T002_test_f003 - 遗留：main-panel-controller.ts:121 `"popup"` 残留，use_route 兜底故行为无差异，开 follow-up
- T002_code_f001 / T002_test_f001 / T002_test_f004 - 无需修改（task 描述惯例 / grep pattern 本次未漏报 / 同意不补单测）

## 遗留问题

- `src/main/core/main-panel-controller.ts:121` 仍传 `"popup"` 给 `getRendererUrl`，与 route 统一前提表面冲突；`use_route` VALID_ROUTES 兜底（popup -> usage）故用户可见行为无差异。建议开 follow-up task 清理（与 T001_test_f001 preload route switch 行为测试缺口同类合并处理）。非阻塞。
- `pnpm test` 偶现 1 flaky（integration 长跑超时），重跑稳定；非本 task 引入。
