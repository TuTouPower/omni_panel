---
tid: t070
slug: e2e_assert_real_refresh
diff_anchor: "2a618ed"
branch: "t069_t074_spike_batch"
---

# Task t070_e2e_assert_real_refresh

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 无

## Review 处置

评估型 spike，不走双审。

## 收尾报告

### 评估结论

e2e triggers refresh 死等 1000ms，改断言刷新请求/spinner 需 e2e 运行环境 + 改 spec 断言逻辑。需 e2e 基建验证。

裁决：spike close，需架构改/CI/分批修，另立实施 task。

### 验收标准勾选

- [x] 评估完成（e2e triggers refresh 死等 1000ms...）。

### Reviewer verdict

- 评估型 spike，未走双审。

### 遗留

- e2e triggers refresh 死等 1000ms，改断言刷新请求/spinner 需 e2e 运行环境 + 改 spec 断言逻辑。需 e2e 基建验证。

### 结果摘要

- spike close：e2e 断言真实刷新（e2e triggers refresh 死等 1000ms，改断言刷新请求/s...）。
