---
tid: t049
slug: exa_connector
diff_anchor: ""
branch: ""
---

# Task t049_exa_connector

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 密钥来源（脱敏引用，明文不入库）：`//wsl.localhost/Ubuntu-22.04/home/testuser/testuser_ubuntu/my_file/config/scripts/custom_env.py` 的 `API_KEY_EXA_FAE` / `API_KEY_EXA_TDZF` / `API_KEY_EXA_TTP`（UUID 形式）。实测从该文件读。
- 待实测确认：exa 需 `x-api-key: SERVICE-KEY`（team service key）+ path `{id}`（被查 api key UUID）。custom_env 中 3 个 EXA key 是 service-key 还是 api-key-id，需用其作 x-api-key 调 `GET /team-management/api-keys`（list）验证返回是否 200 / 含 api key 列表。

## Review 处置

（双审结束后追加轮次小节与表格。）

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t049` 查，不在此记。

### 验收标准勾选

- [ ] manifest 注册成功，参数标签齐全（zh-Hans/en）。
- [ ] 输入 SERVICE_KEY + API_KEY_ID + LIMIT 返回 total + breakdown observation。
- [ ] status 正向（≥0.9 critical / ≥0.75 warning，LIMIT≤0 unknown）。
- [ ] period/cycleDurationMs/reset_at 来自响应；零用量返回 total=0 观测。
- [ ] 契约测试覆盖正常 / 零用量 / 错误码。

### Reviewer verdict

- Round 1 code：N/A
- Round 1 test：N/A
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无

### 结果摘要

- 见上
