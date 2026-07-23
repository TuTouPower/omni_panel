---
tid: t096
slug: fix_panel_refresh_freeze
diff_anchor: "<SHA>"
branch: t096_fix_panel_refresh_freeze
---

# Task t096_fix_panel_refresh_freeze

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 用户反馈：用量面板所有数据一起更新时暂时卡死。静态走查确认机制链（渲染 ×3 / 高度回环 / 主进程同步阻塞 / 调度对齐），主因权重未实测。
- spec 要求：先按 plan 阶段一/二实测归因（数字记本节），再按归因修复，修复后同法复测对比。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t096` 查，不在此记。

### 验收标准勾选

- [ ] `task.md` 过程记录含基线实测数字：main 事件循环 lag 峰值、vm 执行与 sqlite 写入分项耗时、renderer longtask 次数与总时长、refreshAll 期间状态事件数。
- [ ] `task.md` 过程记录含归因结论（主因阵营：renderer 渲染 / 主进程阻塞 / 高度回环，及依据）。
- [ ] 修复后同场景复测，主因指标较基线下降 ≥50%，对比数字记入 `task.md`。
- [ ] 数据更新行为无回归；`pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿。
- [ ] 实测引入的临时 instrumentation / env 消融开关：收尾时移除或转为正式 debug 配置，处置记入 `task.md`。

### Reviewer verdict

- Round 1 code：N/A
- Round 1 test：N/A

### 遗留

- 无

### 结果摘要

- 待填
