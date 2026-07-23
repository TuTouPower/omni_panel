---
tid: t060
slug: vault_auth_robustness
diff_anchor: "deedfbd2a60efb5c2f35e3c70aa4be6651525680"
branch: t060_vault_auth_robustness
---

# Task t060_vault_auth_robustness

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 覆盖 review_20260723_opus finding：I1(vault 静默覆盖) / I2(is_auth_error 误匹配)

## Review 处置

### Round 1 (2026-07-23 19:40 UTC+8)

| finding_id     | severity  | status | rationale                         | fix_ref                                     |
| -------------- | --------- | ------ | --------------------------------- | ------------------------------------------- |
| t060_code_f001 | important | 已修   | vault throw 信息引用不存在的 .bak | file-vault-backend.ts:79 改 external backup |

### Round 2 (2026-07-23 19:55 UTC+8)

两轴均 PASS，零 finding，未进处置表。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t060` 查，不在此记。

### 验收标准勾选

- [x] vault key 文件损坏（长度不对）throw，不覆盖、不丢密钥（提示 delete/external backup）。
- [x] is_auth_error 对 "unexpected token" / "token pool exhausted" 返回 false。
- [x] is_auth_error 对 401 / unauthorized / invalid_token / invalid_grant / credential 返回 true。
- [x] 单测覆盖两路径（vault corrupted + is_auth_error 边界）。

### Reviewer verdict

- Round 1 code：FAIL
- Round 1 test：PASS
- Round 2 code：PASS
- Round 2 test：N/A（R1 已 PASS）

### 遗留

- 无。

### 结果摘要

- vault ensure_master_key 区分 ENOENT 与 corrupted（throw 不覆盖）；is_auth_error 收窄避免 token 误匹配。
