---
tid: "t051"
slug: "tikhub_connector"
title: "TikHub 余额连接器"
status: "done"
branch: "t051_tikhub_connector"
worktree: ""
review_level: "full"
diff_anchor: "f307af7502aa8f32bd60509aad52d50df6e35797"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task t051_tikhub_connector

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- TikHub 文档研读（subagent 抓取 Apifox OpenAPI 规格）：余额查询 endpoint = `GET https://api.tikhub.io/api/v1/tikhub/user/get_user_info`，认证 `Authorization: Bearer {token}`，响应 `user_data.balance`（付费余额 USD）/ `user_data.free_credit`（免费额度）/ `user_data.email`（账户标识）。无总额度/已用量字段。来源：https://docs.tikhub.io/186826050e0.md。
- 已据研读结果填定 spec 范围与验收。
- 密钥来源（脱敏引用，明文不入库）：`//wsl.localhost/Ubuntu-22.04/home/testuser/testuser_ubuntu/my_file/config/scripts/custom_env.py` 的 `API_KEY_TIKHUB`。实测从该文件读。

## Review 处置

### Round 1 (2026-07-23 16:15 UTC+8)

| finding_id     | severity | status | rationale                         | fix_ref             |
| -------------- | -------- | ------ | --------------------------------- | ------------------- |
| t051_code_f001 | minor    | 已修   | balance/free_credit 重复，提 base | connector.ts base   |
| t051_code_f002 | minor    | 已修   | code!=200 丢 message              | connector.ts:53-55  |
| t051_test_f001 | minor    | 已修   | 阈值边界 0.1/0.2 未测             | test ratio 边界用例 |

### Round 2 (2026-07-23 16:25 UTC+8)

两轴均 PASS，零 finding，未进处置表。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t051` 查，不在此记。

### 验收标准勾选

- [x] manifest 注册成功，参数标签齐全（manifest-contract 守卫）。
- [x] 输入 API_KEY 返回 balance + free_credit 两条 observation。
- [x] account_id = user_data.email（缺失回退 tikhub）。
- [x] balance status 余额反向（≤0.1 critical / ≤0.2 warning 边界覆盖）；free_credit 无 limit unknown。
- [x] code != 200 throw；user_data 缺失 throw；双指标全无 throw。
- [x] 契约测试覆盖 12 用例（含边界/http 错误/email 回退）。

### Reviewer verdict

- Round 1 code：FAIL
- Round 1 test：FAIL
- Round 2 code：PASS
- Round 2 test：PASS

### 遗留

- 无。

### 结果摘要

- tikhub 余额连接器完成：balance + free_credit 双 metric，account_id=email，余额反向 status 边界覆盖。
