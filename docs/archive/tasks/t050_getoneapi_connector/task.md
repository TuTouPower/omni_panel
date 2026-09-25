---
tid: "t050"
slug: "getoneapi_connector"
title: "GetOneAPI 余额连接器"
status: "done"
branch: "t050_getoneapi_connector"
worktree: ""
review_level: "full"
diff_anchor: "0b59436dff65242ad6d4772960e38c8470e4c24f"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task t050_getoneapi_connector

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 密钥来源（脱敏引用，明文不入库）：`//wsl.localhost/Ubuntu-22.04/home/testuser/testuser_ubuntu/my_file/config/scripts/custom_env.py` 的 `API_KEY_GET_ONE_API`。实测从该文件读。
- 实测（2026-07-23）：`POST https://api.getoneapi.com/back/user/balance`（Bearer）返回 `{"code":200,"message":"success","data":{"balance":1.88}}`。`data.balance` = RMB 余额（number）。字段确认，余额反向 status。

## Review 处置

### Round 1 (2026-07-23 15:50 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t050_code_f001|important|已修|data.balance 缺失静默 0|connector.ts:68-70|
|t050_code_f002|minor|撤回|裁决不设 default（AC 缺失->unknown，同 exa）|spec 验收补记|
|t050_code_f003|minor|已修|非数 code 丢原值|connector.ts:60|
|t050_test_f001|important|已修|manifest-contract 漏 getoneapi|manifest-contract.test|
|t050_test_f002|important|已修|data:{} 无 throw 用例|connector + test:142-146|

### Round 2 (2026-07-23 16:05 UTC+8)

两轴均 PASS，零 finding，未进处置表。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t050` 查，不在此记。

### 验收标准勾选

- [x] manifest 注册成功，参数标签齐全（manifest-contract 守卫）。
- [x] 输入 API_KEY 返回余额 observation（used=balance、limit=LIMIT）。
- [x] status 余额反向；LIMIT 缺失/≤0/非数 -> unknown+null。
- [x] code != 200 throw；data 缺失或 data.balance 键缺失 throw。
- [x] 契约测试覆盖正常 / 阈值三档 / LIMIT 异常 / 错误码 / 字段缺失（9 用例）。

### Reviewer verdict

- Round 1 code：FAIL
- Round 1 test：FAIL
- Round 2 code：PASS
- Round 2 test：PASS

### 遗留

- 无（实测字段已确认 data.balance）。

### 结果摘要

- getoneapi 余额连接器完成：POST /back/user/balance，data.balance 余额反向 status，account_id 固定（t057 统一改 hash）。

### Reviewer verdict

- Round 1 code：N/A
- Round 1 test：N/A
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无

### 结果摘要

- 见上
