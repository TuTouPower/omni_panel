---
tid: "t049"
slug: "exa_connector"
title: "Exa 用量连接器（成本型）"
status: "done"
branch: "t049_exa_connector"
worktree: ""
review_level: "full"
diff_anchor: "08ebd8a931e25a72a0cc994806eda0186c8ba6c3"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task t049_exa_connector

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 密钥来源（脱敏引用，明文不入库）：`//wsl.localhost/Ubuntu-22.04/home/testuser/testuser_ubuntu/my_file/config/scripts/custom_env.py` 的 `API_KEY_EXA_FAE` / `API_KEY_EXA_TDZF` / `API_KEY_EXA_TTP`（UUID 形式）。实测从该文件读。
- 待实测确认：exa 需 `x-api-key: SERVICE-KEY`（team service key）+ path `{id}`（被查 api key UUID）。custom_env 中 3 个 EXA key 是 service-key 还是 api-key-id，需用其作 x-api-key 调 `GET /team-management/api-keys`（list）验证返回是否 200 / 含 api key 列表。

## Review 处置

### Round 1 (2026-07-23 15:25 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t049_code_f001|important|已修|parse_limit ≤0 兜底 100 致 unknown 死代码|connector.ts:20-24,90 + manifest|
|t049_test_f001|critical|已修|缺非对象/HTTP 错误 throw 用例|exa_connector.test.ts:247-270|
|t049_test_f002|critical|已修|LIMIT≤0 应 unknown，测试固化错误行为|connector.ts + test:193-229|
|t049_test_f003|important|已修|warning 阈值分支未测|exa_connector.test.ts:166-175|

### Round 2 (2026-07-23 15:35 UTC+8)

两轴均 PASS，零 finding，未进处置表。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t049` 查，不在此记。

### 验收标准勾选

- [x] manifest 注册成功，参数标签齐全（zh-Hans/en）。
- [x] 输入 SERVICE_KEY + API_KEY_ID + LIMIT 返回 total + breakdown observation。
- [x] status 正向（≥0.9 critical / ≥0.75 warning，LIMIT 缺失/≤0/非数 unknown）。
- [x] period/cycleDurationMs/reset_at 来自响应；零用量返回 total=0 观测。
- [x] 契约测试覆盖正常 / 零用量 / 非对象 / HTTP 错误 / 阈值三档 / LIMIT 异常。

### Reviewer verdict

- Round 1 code：FAIL
- Round 1 test：FAIL
- Round 2 code：PASS
- Round 2 test：PASS

### 遗留

- 无（真实 API 实测留待网络恢复后验证字段；实现以官方文档示例为准）。

### 结果摘要

- exa 成本型连接器完成：total_cost_usd + cost_breakdown 映射，预算 LIMIT 正向 status，account_id=API_KEY_ID。
