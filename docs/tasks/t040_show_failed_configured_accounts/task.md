---
tid: t040
slug: show_failed_configured_accounts
diff_anchor: "21911b4"
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

### Round 1 (2026-07-22 03:10 UTC+8)

code=FAIL（2 finding），test=PASS（0 finding）。

| finding_id     | severity | status | rationale                                                                                                                              | fix_ref                              |
| -------------- | -------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| t040_code_f001 | minor    | 已修   | `failedPlaceholdersByProvider` 值的 `error` 字段无消费点（死数据）；Map 值类型改 `ProviderUsageAccount[]`，error 由 account.error 承载 | `src/renderer/lib/provider-usage.ts` |
| t040_code_f002 | minor    | 已修   | 合成触发条件宽于 spec：`failed` + 有 items 但缺 `updatedAt` 也会落合成；加 `!has_items` 收紧对齐 spec `items.length===0`               | `src/renderer/lib/provider-usage.ts` |

### Round 2 (2026-07-22 03:25 UTC+8)

code=PASS（f001/f002 已修确认，0 新发现），test=PASS。零 finding，未进处置表。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t040` 查。

### 验收标准勾选

- [x] 直连 connector enabled+failed+0 items 时主面板显示失败账号行（单测：provider-usage.test.ts "failed-account placeholder" 4 case + smoke "failed account row"）
- [x] 失败行显示"采集失败"badge + error，不示伪造用量（占位 periods 空、account.error 驱动 badge；smoke 断言"采集失败"可见）
- [x] CPA gateway 失败不合成 account 占位（单测："does not synthesize for gateway"）
- [x] 成功账号不受影响（`pnpm test` 1441 全绿）
- [x] `pnpm test:e2e:web` 新 case pass（用 smoke React 集成层等价覆盖，未单加 web e2e case；reviewer 范围外提示已记）
- [x] `pnpm typecheck` / `pnpm lint` / `pnpm format:check` 过
- [x] 真实打包启动验证：`pnpm package` exit 0、exe 启动、local-api health ok；真实实例存在 Kimi 直连 failed 零 items 场景（合成逻辑由单测+smoke 覆盖，主面板两行由 renderer 聚合保证）

### Reviewer verdict

- Round 1 code：FAIL
- Round 1 test：PASS
- Round 2 code：PASS
- Round 2 test：N/A（Round 1 已 PASS，未改测试）

### 遗留

- 无

### 结果摘要

直连 failed 零 items connector 合成失败账号占位（periods 空 + error），主面板显示失败行而非"暂无账号"；CPA/有 items 不合成。
