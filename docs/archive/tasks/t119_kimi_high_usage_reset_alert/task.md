---
tid: "t119"
slug: "kimi_high_usage_reset_alert"
title: "Kimi 高用量重置提醒语义与链路回归"
status: "dropped"
branch: ""
worktree: ""
review_level: "full"
diff_anchor: "<SHA>"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: "dropped: 用户取消"
---

# Task t119_kimi_high_usage_reset_alert

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- backlog：只完成问题只读排查与任务拆分；未创建分支、未改产品代码或测试。
- 已确认运行数据：Kimi 83% 的两个账号均监控 `weekly`，全局阈值 20%，但距离重置约占完整周期 72.57%，因此按现有时间筛选被排除。

## Review 处置

尚未进入 review。

## 收尾报告

### 验收标准勾选

- [ ] 已监控的 Kimi `weekly` 在 `used=83`、`limit=100`、剩余周期大于时间阈值时进入「即将重置」。
- [ ] 仅以时间阈值入选的既有场景保持可用；阈值为空时卡片仍不挂载。
- [ ] 未监控、`resetAt` 为 null/过去时间、周期无效的 Kimi 周额度不进入卡片。
- [ ] 文案准确区分「剩余时间阈值」与「高用量受监控额度」，空态不再承诺固定 7 天窗口。
- [ ] Kimi connector 到 `collect_upcoming_resets` 的组合回归覆盖真实 `weekly` 标签和 poll 源 account key。
- [ ] 定向单元/集成测试、`pnpm typecheck` 与 `pnpm test` 通过。

### Reviewer verdict

- Round 1 code：N/A
- Round 1 test：N/A

### 遗留

- 无

### 结果摘要

- backlog，未执行。
