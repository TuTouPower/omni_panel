---
tid: t050
slug: getoneapi_connector
diff_anchor: ""
branch: ""
---

# Task t050_getoneapi_connector

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 密钥来源（脱敏引用，明文不入库）：`//wsl.localhost/Ubuntu-22.04/home/testuser/testuser_ubuntu/my_file/config/scripts/custom_env.py` 的 `API_KEY_GET_ONE_API`。实测从该文件读。

## Review 处置

（双审结束后追加轮次小节与表格。）

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t050` 查，不在此记。

### 验收标准勾选

- [ ] manifest 注册成功，参数标签齐全。
- [ ] 输入 API_KEY 返回余额 observation（used=balance、limit=LIMIT）。
- [ ] status 余额反向（0.01 critical / 充足 normal）。
- [ ] code != 200 throw；data 缺关键字段 throw。
- [ ] 契约测试覆盖正常 / 错误码。

### Reviewer verdict

- Round 1 code：N/A
- Round 1 test：N/A
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无

### 结果摘要

- 见上
