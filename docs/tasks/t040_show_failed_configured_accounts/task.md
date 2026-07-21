---
tid: t040
slug: show_failed_configured_accounts
diff_anchor: "<SHA>"
branch: t040_show_failed_configured_accounts
---

# Task t040_show_failed_configured_accounts

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 诊断来源：`docs/bugs.md`「Kimi 多账号中失败账号未在主面板展示」。
- 根因已确认（diagnosing-bugs Phase 1-3，真实打包实例）：
    - `build_provider_usage_groups` 只从 `snapshot.items` 建 account；failed+0 items 直连 connector 不产生 account → 主面板无该账号行。
    - 已有 stale error 机制（T026-T029）只覆盖曾成功过的账号；首次失败无 observation → 无 MetricRecord → 无账号行。
- Phase 1 反馈环（真实 local-api :17863）稳定复现两次：成功实例 items=2、失败实例 status=failed items=0 error=HTTP 401 → `configured=2 visible=1` → throw。
- Phase 3 排除：account override 误隐藏非根因（失败账号从未进 group）；provider 级 providerErrors 存在但只供概览、不产 account 行。
- 与 t039 互补：建议 t039 先行（避免零观测被误判 ready 污染本 task 的 failed 判定）。
- 开干时填 `diff_anchor`。

## Review 处置

**本文件本小节 = 处置表唯一落点。**

### Round 1 零 finding

两轴均 0 finding 时写：「Round 1 零 finding，未进处置表。」

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t040` 查。

### 验收标准勾选

- [ ] 直连 connector enabled+failed+0 items 时主面板显示失败账号行（单测 + e2e）
- [ ] 失败行显示"采集失败"badge + error，不示伪造用量
- [ ] CPA gateway 失败不合成 account 占位（单测）
- [ ] 成功账号不受影响（`pnpm test` 全绿）
- [ ] `pnpm test:e2e:web` 新 case pass
- [ ] `pnpm typecheck` 过
- [ ] 真实打包启动验证：Kimi 两账号一失败，主面板两行，失败行标注采集失败

### Reviewer verdict

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL
- Round 2 code：N/A / PASS / FAIL
- Round 2 test：N/A / PASS / FAIL

### 遗留

- 无

### 结果摘要

- 见上
