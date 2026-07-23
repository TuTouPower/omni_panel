---
tid: t073
slug: eslint_recommended_enable
diff_anchor: "2a618ed"
branch: "t069_t074_spike_batch"
---

# Task t073_eslint_recommended_enable

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 无

## Review 处置

评估型 spike，不走双审。

## 收尾报告

### 评估结论

启用 7 插件 recommended 会爆千错，需分批修 + --max-warnings 过渡。大量 lint 修复工作。

裁决：spike close，需架构改/CI/分批修，另立实施 task。

### 验收标准勾选

- [x] 评估完成（启用 7 插件 recommended 会爆千错，需分批修 ...）。

### Reviewer verdict

- 评估型 spike，未走双审。

### 遗留

- 启用 7 插件 recommended 会爆千错，需分批修 + --max-warnings 过渡。大量 lint 修复工作。

### 结果摘要

- spike close：eslint recommended 分批（启用 7 插件 recommended 会爆千错，需分批修 + --max-wa...）。
