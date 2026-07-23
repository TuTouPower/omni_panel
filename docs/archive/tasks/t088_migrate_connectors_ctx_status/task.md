---
tid: t088
slug: migrate_connectors_ctx_status
diff_anchor: "278247c"
branch: "spike_batch"
---

# Task t088_migrate_connectors_ctx_status

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 无

## Review 处置

评估型 spike，不走双审。

## 收尾报告

### 评估结论

9 连接器逐个删内联 helper 改 ctx.status，工作量大（纯 DRY 迁移，行为不变），需专门 session。

裁决：spike close，需专门 session 实施。

### Reviewer verdict

- 评估型 spike，未走双审。

### 遗留

- 9 连接器逐个删内联 helper 改 ctx.status，工作量大（纯 DRY 迁移，行为不变），需专门 session。

### 结果摘要

- spike close：9 连接器逐个删内联 helper 改 ctx.status，工作量大（纯 DR...
