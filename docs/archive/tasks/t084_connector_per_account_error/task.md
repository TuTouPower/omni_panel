---
tid: t084
slug: connector_per_account_error
diff_anchor: "278247c"
branch: "t084_per_account_error"
---

# Task t084_connector_per_account_error

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 无

## Review 处置

评估型 spike，不走双审。

## 收尾报告

### 评估结论

- CPA per-account 循环（逐 auth_file）**已有** report_failed_account + continue（t059 修，connector.ts:523-546）。
- 其余 10 个 connector（claude/deepseek/exa/firecrawl/getoneapi/glm/kimi/opencode_go/tavily/tikhub）全是**单账号型**（一实例=一账号），throw = 唯一账号失败 = connector failed。runtime catch throw + refresh-service stale observation（t040 合成失败占位行）已完整覆盖。
- 无需额外迁移：单账号 connector 的 throw 行为合理（不需要 per-account catch，因为只有一个 account）。

### 验收标准勾选

- [x] CPA per-account catch + report_failed_account：已有（t059）。
- [x] 单账号 connector throw -> failed -> 占位行：已有（t040）。
- [x] 无需额外改动。

### Reviewer verdict

- 评估型 spike，未走双审。

### 遗留

- 无。

### 结果摘要

- spike close：CPA per-account 已修（t059）；单账号 connector throw 是合理行为，不需迁移。
