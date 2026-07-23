---
tid: t054
slug: localapi_auth_hardening
diff_anchor: ""
branch: ""
---

# Task t054_localapi_auth_hardening

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- review_20260723_opus C1：local-api server 0.0.0.0 + 敏感端点（secrets/config 读写、refresh）落 check_auth 前。与 web-panel.md §2「局域网不考虑安全」冲突，需用户决策方向。
- 评估产出 4 方案：A 保持现状（不改代码，补 §2 风险接受）/ B 端点分级（panel 用量展示免 auth，secrets/config/refresh 改 Bearer，推荐）/ C 绑定收紧 + B（默认 127.0.0.1，跨机 opt-in）/ D 全收紧（所有 /v1/ 需 Bearer）。
- **用户决策：A 保持现状**。遵循 web-panel.md §2 原决策，不改代码。
- 落地范围（t054 执行时）：仅在 web-panel.md §2 补风险接受说明 + §8 更新（C1 评估结论 + 决策 A 记录）；无代码改动；不走双审（未改代码/测试，按 Step 6「否→改必要文档后直接收尾」）。

## Review 处置

（双审结束后追加轮次小节与表格。）

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t054` 查，不在此记。

### 验收标准勾选

- [ ] 产出 4 方案对比（绑定收紧 / 端点分级 / token 分级 / 保持现状），含利弊 + 推荐。
- [ ] 向用户呈现决策点并等待显式选择。
- [ ] 按决策实现：敏感端点落 auth 后；绑定/token 符合所选方案。
- [ ] 测试：未授权拒敏感端点；授权后行为符合；web panel 读不破坏。

### Reviewer verdict

- Round 1 code：N/A
- Round 1 test：N/A
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无

### 结果摘要

- 见上
