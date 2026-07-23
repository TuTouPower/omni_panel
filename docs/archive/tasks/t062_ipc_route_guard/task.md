---
tid: t062
slug: ipc_route_guard
diff_anchor: "428e5b46d2f98c7ce056b5741ca051a50d3be4c9"
branch: t062_ipc_route_guard
---

# Task t062_ipc_route_guard

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 覆盖 review_20260723_opus finding：I14(CONFIG_GET_SECRETS route) / I15(file:// 放行)

## Review 处置

### Round 1 (2026-07-23 20:15 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                             | fix_ref                      |
| -------------- | --------- | ------ | --------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| t062_code_f001 | important | 遗留   | endsWith index.html 增量防御；完整 rendererIndexPath 白名单需 helpers 注入 path（架构改），spec AC 已调整，另立 spike | spec I15 + 遗留              |
| t062_code_f002 | minor     | 已修   | hash.includes 子串 -> hash === "#setting" 精确                                                                        | helpers.ts:63                |
| t062_test_f001 | important | 已修   | CONFIG_GET_SECRETS 非 setting route 缺整合测试                                                                        | config-ipc.test.ts:857-874   |
| t062_test_f002 | minor     | 已修   | hash 子串边界未覆盖                                                                                                   | helpers.test.ts #not-setting |

### Round 2 (2026-07-23 20:30 UTC+8)

f001 遗留裁决（spec 调整 + 另立 spike），f002 已修；test R2 PASS。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t062` 查，不在此记。

### 验收标准勾选

- [x] 非 setting route 调 CONFIG_GET_SECRETS 被拒（hash === "#setting" 精确 + 整合测试）。
- [x] 非 index.html 的 file:// 调 IPC 被拒（endsWith 增量防御）；完整 rendererIndexPath 白名单遗留。
- [x] dev_url 前缀匹配改 origin 比对（防 localhost:5173evil.com）。
- [x] 设置窗正常拉密钥回填不破坏（mock url #setting）。

### Reviewer verdict

- Round 1 code：FAIL
- Round 1 test：FAIL
- Round 2 code：FAIL（f001 遗留裁决，spec 调整）
- Round 2 test：PASS

### 遗留

- `t062_code_f001`：完整 rendererIndexPath 白名单需 helpers 注入 path（架构改），另立 spike；当前 endsWith index.html 已拒非 HTML file://（比原「任意 file://」严，增量合理）。

### 结果摘要

- CONFIG_GET_SECRETS 加 assert_setting_route（hash 精确）；file:// endsWith index.html + dev_url origin 比对；完整白名单遗留。
