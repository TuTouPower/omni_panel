---
tid: t051
slug: tikhub_connector
diff_anchor: ""
branch: ""
---

# Task t051_tikhub_connector

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- TikHub 文档研读（subagent 抓取 Apifox OpenAPI 规格）：余额查询 endpoint = `GET https://api.tikhub.io/api/v1/tikhub/user/get_user_info`，认证 `Authorization: Bearer {token}`，响应 `user_data.balance`（付费余额 USD）/ `user_data.free_credit`（免费额度）/ `user_data.email`（账户标识）。无总额度/已用量字段。来源：https://docs.tikhub.io/186826050e0.md。
- 已据研读结果填定 spec 范围与验收。
- 密钥来源（脱敏引用，明文不入库）：`//wsl.localhost/Ubuntu-22.04/home/testuser/testuser_ubuntu/my_file/config/scripts/custom_env.py` 的 `API_KEY_TIKHUB`。实测从该文件读。

## Review 处置

（双审结束后追加轮次小节与表格。）

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t051` 查，不在此记。

### 验收标准勾选

- [ ] manifest 注册成功，参数标签齐全。
- [ ] 输入 API_KEY 返回 balance + free_credit 两条 observation。
- [ ] account_id = user_data.email（非固定字符串）。
- [ ] balance status 余额反向；free_credit 无 limit normal/unknown。
- [ ] code != 200 throw；user_data 缺失 throw。
- [ ] 契约测试覆盖正常 / 错误码 / email 缺失回退。

### Reviewer verdict

- Round 1 code：N/A
- Round 1 test：N/A
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无

### 结果摘要

- 见上
