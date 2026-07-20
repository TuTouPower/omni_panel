# Task report T013

本报告所在 commit 即 task commit，SHA 由 `git log --grep T013` 查，不在此记录。

## spec 验收标准勾选

- [x] CI web e2e 策略明确。 — ci.yml packaged smoke 步骤加注释（web e2e 不 CI）；testing.md "CI 策略"小节说明 CI 只跑 vitest + packaged smoke，electron nightly。
- [x] webServer 顶层决策记录。 — ADR 008（webServer 选 B 保留顶层 + CI 选 B 跳过 web project + synthetic seed 遗留）。
- [x] testing.md 补 web e2e 章节（录制 + CI + 三路对照）。 — "web e2e 录制与 CI 策略"章节含录制三步（含 packaged/dev 命令 + health 验证）+ CI 策略 + 三路 project 对照表。
- [x] handoff.md 追加 e2e 改造交接段。 — 2026-07-21 02:50 UTC+8 段（branch main / head_commit a41cbad / 已完成 T009-T012 / 未完成 T013-T014 / 陷阱 / 下一步 T014）。

## adoption 处置摘要

- 已修 4 项 / 遗留 0 项 / 无需修改 0 项
- T013_code_f001 — 采纳："61 responses" 硬编码 → "全部 + 基线 61"
- T013_test_f001 — 采纳：录制步骤 1 补 packaged/dev 命令 + health 验证
- T013_test_f002 — 采纳：三路对照表 web 行补 fixture 前置提示
- T013_test_f003 — 采纳：CI 策略补 ADR 008 synthetic seed 遗留回引

## 遗留问题

- **CI web SPA 数据链路覆盖缺口**（ADR 008 遗留）：web e2e 不 CI，CI 由 vitest + packaged smoke 兜底；恢复通道为 synthetic seed fixture（脱敏假账号）入库供 CI smoke，未来需求触发。
- **settings_view case 级拆迁**（T011 遗留）：留 electron/ 原样。
- **trend query 多录**（T010 遗留）：T011 范围外，留 trend 相关 spec 评估时做。
