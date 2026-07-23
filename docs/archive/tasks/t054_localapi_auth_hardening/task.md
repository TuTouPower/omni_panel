---
tid: t054
slug: localapi_auth_hardening
diff_anchor: "0fc956789083f06a4f1dd6af5ac936914150b6c9"
branch: t054_localapi_auth_hardening
---

# Task t054_localapi_auth_hardening

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- review_20260723_opus C1：local-api server 0.0.0.0 + 敏感端点（secrets/config 读写、refresh）落 check_auth 前。与 web-panel.md §2「局域网不考虑安全」冲突，需用户决策方向。
- 评估产出 4 方案：A 保持现状（不改代码，补 §2 风险接受）/ B 端点分级（panel 用量展示免 auth，secrets/config/refresh 改 Bearer，推荐）/ C 绑定收紧 + B（默认 127.0.0.1，跨机 opt-in）/ D 全收紧（所有 /v1/ 需 Bearer）。
- **用户决策：A 保持现状**。遵循 web-panel.md §2 原决策，不改代码。
- 落地范围（t054 执行时）：仅在 web-panel.md §2 补风险接受说明 + §8 更新（C1 评估结论 + 决策 A 记录）；无代码改动；不走双审（未改代码/测试，按 Step 6「否→改必要文档后直接收尾」）。

## Review 处置

未改代码/测试，按 Step 6「否→改必要文档后直接收尾」，不走双审。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t054` 查，不在此记。

### 验收标准勾选

- [x] 产出 4 方案对比（A 保持现状 / B 端点分级 / C 绑定收紧 / D 全收紧），含利弊 + 推荐 B。
- [x] 向用户呈现决策点并等待显式选择（用户选 A）。
- [x] 按决策 A 实现：不改代码；web-panel.md §2.1 补风险接受说明 + §8 记录评估。
- [x] 测试：N/A（无代码改动）。

### Reviewer verdict

- 未走双审（文档型 task，决策 A 无代码/测试改动）。

### 遗留

- 无（若部署到不可信网络，重评改 B/C/D）。

### 结果摘要

- C1 评估完成，决策 A 保持现状，web-panel.md §2.1/§8 补风险接受记录。
