---
tid: t160
slug: fix_grok_zero_percent_omission
diff_anchor: "d9cf0499d7600b814f44bbadda660494e16f4bb6"
branch: t160_fix_grok_zero_percent_omission
---

# Task t160_fix_grok_zero_percent_omission

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 2026-07-29 03:12 UTC+8：复用当前正式 Grok OAuth bearer 做只读请求矩阵。`/v1/billing?format=credits` 返回 HTTP 200 与完整 weekly `currentPeriod`，其结束时间换算 UTC+8 后与网页重置时间 `2026-08-04 07:10` 一致；响应未包含 `creditUsagePercent`，网页显示 `0%`。
- 2026-07-29：确认根因是 proto3 JSON 省略默认零值。当前 parser 将缺失字段当作无数据；t039 随后把零 observations 转为 failed，t159 又把 unified billing 金额三项全零误判为“无可用额度”。
- 2026-07-29：排除 OAuth、Vault、bearer、endpoint、CLI headers、`x-userid`、订阅权益与用户封禁。请求前后 `config.json`、`secrets.vault`、`vault.key` 大小、mtime、SHA-256 均未变化。
- 2026-07-29：纠正一次诊断误读。无 `format` 的 `/v1/billing` 返回 `monthlyLimit.val=15000`、`used.val=13434`；两者是 deprecated USD cents 月度金额字段（USD 150.00 / USD 134.34），不是 SuperGrok weekly percent，禁止以 `used / monthlyLimit` 映射周用量。
- 2026-07-29：task 创建为 backlog；尚未创建分支、启动实现或修改产品代码。
- 2026-07-29：Step 1 启动分支 `t160_fix_grok_zero_percent_omission`，`diff_anchor=d9cf0499d7600b814f44bbadda660494e16f4bb6`。
- 2026-07-29：Step 2 红灯。新增 weekly `currentPeriod` 完整但 `creditUsagePercent` 省略、显式 0 等价、deprecated 月度美分字段禁用回归；专项结果 9 passed / 2 failed，旧实现把合法 0% 响应上报 failed_account。
- 2026-07-29：按用户反馈将测试中的真实响应时间改为匿名固定 7 天周期；文档保留真实重置时间作为诊断证据，自动化 fixture 不依赖真实日期。
- 2026-07-29：Step 3 绿灯。connector 仅在 `USAGE_PERIOD_TYPE_WEEKLY` 且 start/end 可解析、end 晚于 start 时，将省略的 `creditUsagePercent` 解释为 0；删除 t159 的“on-demand/prepaid 全零即无额度”误判。专项 11 passed。
- 2026-07-29 04:03 UTC+8：Step 4 真实 packaged 验证。启动当前分支构建，复用正式 Grok 登录执行一次自动刷新和一次手动强制刷新；两次均为 HTTP 200、`1 valid observations (from 1 raw)`、`refreshed: 1 items`，无 failed_account。UI 连续显示“一周 0% / 08.04 07:10”，与网页一致；日志只记录 URL、状态码和响应字节数，未记录 bearer、Authorization 或响应体。截图存于 `visual_evidence/grok_zero_percent.png`。
- 2026-07-29：Step 4 门禁。专项 Grok 测试 11 passed；全量 `pnpm test` 184 files / 1866 tests passed；`pnpm test:packaged` 3 passed。`typecheck`、`lint`、task 变更文件格式检查、架构检查通过。完整 `pnpm check` 仍被仓库既有 42 个 archive/visual_evidence 格式问题和 3 个既有 unused files 阻断；本 task 文件均不在剩余失败清单。
- 2026-07-29：Round 1 双审为 code FAIL（4 findings）/ test FAIL（3 findings）。先补 12 个失败用例，确认专项 16 passed / 7 failed；随后区分字段省略与显式非法值、校验周期字符串、支持 weekly/monthly 映射、拆分总额度与产品 reset，并补齐周期无效、完整等价和 deprecated 共存覆盖。专项转为 23 passed。
- 2026-07-29 04:50 UTC+8：Round 1 修复后重新执行 Step 4。全量 `pnpm test` 184 files / 1878 tests passed，`pnpm test:packaged` 3 passed；重新打包并手动刷新正式 Grok，日志再次显示 HTTP 200、1 valid observation、1 refreshed item，UI 保持“一周 0% / 08.04 07:10”。
- 2026-07-29 04:58 UTC+8：Round 2 双审为 code FAIL（3 个新 finding）/ test FAIL（1 个新 finding）。已达到 `max_review_round=2`，未修项全部登记为遗留，按门禁转 blocked，等待用户决定加轮或 dropped。
- 2026-07-29：用户批准将 `max_review_round` 提升至 4；执行 `task.py resume t160`，轮次累计不清零，从 Step 3 修复 Round 2 finding 后继续黑盒与 Round 3 双审。
- 2026-07-29：Round 2 finding TDD。新增非法日历日期、缺失/无效 `currentPeriod` 下显式 percent 的 legacy 兼容测试，先确认专项 24 passed / 2 failed；随后严格校验 RFC3339 日历字段、提取总额度归一化 helper，并仅限制省略 percent 的周期要求，专项转为 26 passed。
- 2026-07-29 05:25 UTC+8：Round 2 修复后重新执行 Step 4。全量 `pnpm test` 184 files / 1881 tests passed；`typecheck`、`lint`、task 文件格式、架构检查通过；重新打包后 `pnpm test:packaged` 3 passed。复用正式 Grok 登录手动刷新，日志为 HTTP 200、1 valid observation、1 refreshed item，UI 显示“一周 0% / 08.04 07:10”；最终截图存于 `visual_evidence/grok_zero_percent_round3.png`，未记录或提交敏感值。
- 2026-07-29：Round 3 双审为 code FAIL（f007 修不彻底、1 个新 finding）/ test FAIL（1 个新 finding）。新增小写 RFC3339 `t/z` 与省略 monthly percent 组合测试，先确认专项 27 passed / 1 failed；随后拆分日期、时间、时区校验 helper 并兼容小写分隔符，专项转为 28 passed。
- 2026-07-29 05:49 UTC+8：Round 3 修复后重新执行 Step 4。全量 `pnpm test` 184 files / 1883 tests passed；`typecheck`、`lint`、task 文件格式、架构检查通过；重新打包后 `pnpm test:packaged` 3 passed。正式 Grok 手动刷新仍产出 1 valid observation，UI 显示“一周 0% / 08.04 07:10”；截图存于 `visual_evidence/grok_zero_percent_round4.png`。
- 2026-07-29 05:55 UTC+8：Round 4 双审为 code FAIL（1 个新 minor finding）/ test PASS（零 finding）。功能、正确性与测试 finding 均已闭合；仅新增模块常量命名不符合 `UPPER_SNAKE_CASE`。已达到用户批准的 `max_review_round=4`，按门禁登记遗留并转 blocked。
- 2026-07-29：用户批准将 `max_review_round` 提升至 5；执行 `task.py resume t160`，轮次累计不清零。将新增模块常量重命名为 `RFC3339_PATTERN` / `DAYS_IN_MONTH`，不改变行为。
- 2026-07-29 06:43 UTC+8：Round 4 finding 修复后重新执行 Step 4。Grok 专项 28 passed；全量 `pnpm test` 184 files / 1883 tests passed；`typecheck`、`lint`、task 文件格式、架构检查通过；重新打包后 `pnpm test:packaged` 3 passed。复用正式 Grok 登录连续手动刷新两次，UI 均显示“一周 0% / 08.04 07:10”；截图存于 `visual_evidence/grok_zero_percent_round5.png`，未记录或提交敏感值。
- 2026-07-29 06:53 UTC+8：Round 5 双审 code/test 均 PASS，零新 finding，所有历史 finding 闭合。`check_review_status.py --max-review-round 5` 输出 `overall=PASS`，但其轮次解析仍报告 `round=4`，与两份报告已追加 Round 5 不一致；该脚本限制不影响两轴最终 verdict。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-29 04:50 UTC+8)

| finding_id     | severity  | status | rationale                                                       | fix_ref                                                          |
| -------------- | --------- | ------ | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| t160_code_f001 | important | 已修   | 仅字段真正省略且周期有效时回填 0，显式非法值进入失败。          | `connectors/grok/connector.ts:123`                               |
| t160_code_f002 | important | 已修   | start/end 先做字符串校验，再解析并校验先后关系。                | `connectors/grok/connector.ts:59`                                |
| t160_code_f003 | important | 已修   | 总额度使用 currentPeriod，产品指标保留 billingPeriodEnd。       | `connectors/grok/connector.ts:108`、`:154`                       |
| t160_code_f004 | important | 已修   | 已知 weekly/monthly 映射 window、周期时长和 reset。             | `connectors/grok/connector.ts:66`                                |
| t160_test_f001 | important | 已修   | 哨兵 reset 分离两来源，并覆盖 7 类无效周期。                    | `tests/integration/connector/grok_connector.test.ts:151`、`:315` |
| t160_test_f002 | important | 已修   | 两路径分别断言无失败，并比较除 observed_at 外完整 observation。 | `tests/integration/connector/grok_connector.test.ts:390`         |
| t160_test_f003 | important | 已修   | 0% weekly fixture 加入 deprecated 金额字段，仍断言 used=0。     | `tests/integration/connector/grok_connector.test.ts:51`、`:264`  |

### Round 2 (2026-07-29 04:58 UTC+8)

| finding_id     | severity  | status | rationale                                                                 | fix_ref                                                  |
| -------------- | --------- | ------ | ------------------------------------------------------------------------- | -------------------------------------------------------- |
| t160_code_f005 | important | 已修   | 显式有限 percent 在周期无效或缺失时继续使用 legacy week/reset。           | `connectors/grok/connector.ts:131`                       |
| t160_code_f006 | important | 已修   | RFC3339 解析前严格校验年月日、时间和时区字段，拒绝非法日历日期归一化。    | `connectors/grok/connector.ts:64`                        |
| t160_code_f007 | important | 已修   | 总额度 presence、周期映射与 fallback 提取到 `parse_total_usage`。         | `connectors/grok/connector.ts:131`、`:149`               |
| t160_test_f004 | important | 已修   | 新增缺失/无效 currentPeriod 时显式 percent 的 legacy 兼容路径参数化测试。 | `tests/integration/connector/grok_connector.test.ts:349` |

### Round 3 (2026-07-29 05:40 UTC+8)

| finding_id     | severity  | status | rationale                                                                 | fix_ref                                                  |
| -------------- | --------- | ------ | ------------------------------------------------------------------------- | -------------------------------------------------------- |
| t160_code_f007 | important | 已修   | 时间戳格式、日历、时间和时区校验拆分，单函数复杂度降至阈值以下。          | `connectors/grok/connector.ts:67`                        |
| t160_code_f008 | important | 已修   | RFC3339 正则接受合法小写 `t` / `z`，仍保留严格日历校验。                  | `connectors/grok/connector.ts:64`                        |
| t160_test_f005 | important | 已修   | 新增省略 percent + monthly currentPeriod 组合，完整断言 0% monthly 结果。 | `tests/integration/connector/grok_connector.test.ts:471` |

### Round 4 (2026-07-29 05:55 UTC+8)

| finding_id     | severity | status | rationale                                                            | fix_ref                           |
| -------------- | -------- | ------ | -------------------------------------------------------------------- | --------------------------------- |
| t160_code_f009 | minor    | 已修   | 用户批准第 5 轮后，将新增模块常量改为项目约定的 `UPPER_SNAKE_CASE`。 | `connectors/grok/connector.ts:64` |

Round 4 test reviewer：零 finding，前轮 `t160_test_f001`–`t160_test_f005` 全部闭合。

### Round 5 (2026-07-29 06:53 UTC+8)

Round 5 code/test reviewer 均零 finding；`t160_code_f001`–`t160_code_f009` 与 `t160_test_f001`–`t160_test_f005` 全部闭合。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t160` 查，不在此记。

### 验收标准勾选

- [x] `creditUsagePercent` 缺失但 `currentPeriod` 完整有效时生成正常 0% observation。
- [x] weekly period 映射 `window="week"`，`reset_at` 使用 `currentPeriod.end`。
- [x] 显式 0、非零 percent 与 `productUsage` 行为正确。
- [x] 未知零观测响应继续 failed/stale，不产生 `ready + []`。
- [x] deprecated `monthlyLimit/used` 不映射成 weekly usage。
- [x] 当前正式账号真实刷新与网页 0% 和重置时间一致。
- [x] 日志、fixture、文档保持脱敏。

### Reviewer verdict

- Round 1 code：FAIL（4 findings，已修）
- Round 1 test：FAIL（3 findings，已修）
- Round 2 code：FAIL（3 findings，已修）
- Round 2 test：FAIL（1 finding，已修）
- Round 3 code：FAIL（1 新 finding，前轮复杂度 finding 修不彻底；均已修）
- Round 3 test：FAIL（1 finding，已修）
- Round 4 code：FAIL（1 minor finding，已修）
- Round 4 test：PASS
- Round 5 code：PASS
- Round 5 test：PASS

### 遗留

- 无

### 结果摘要

- 修复 Grok credits proto3 默认 `0` 字段省略误判：有效 weekly/monthly 周期可生成正常 0% observation，真正未知响应继续 failed/stale。
- deprecated 月度 USD cents 字段保持禁用，不映射 SuperGrok weekly usage。
- 自动化验证：Grok 专项 28 passed；全量 184 files / 1883 tests passed；typecheck、lint、架构、格式与 packaged smoke 通过。
- 正式 packaged app 连续刷新稳定显示“一周 0% / 08.04 07:10”，与网页一致。
- Round 5 code/test 双审 PASS，零遗留。
