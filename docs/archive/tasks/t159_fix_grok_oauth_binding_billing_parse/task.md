---
tid: t159
slug: fix_grok_oauth_binding_billing_parse
diff_anchor: "89bc31f9350241ad48039678bec1477691fc97bf"
branch: "t159_fix_grok_oauth_binding_billing_parse"
---

# Task t159_fix_grok_oauth_binding_billing_parse

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 2026-07-28 日志诊断确认两段独立故障：
    - 首次新增账号登录写入临时 instance id，正式实例首次刷新返回 `401 ... reason=no auth context`。
    - 对正式实例重新登录后连续 billing HTTP 200，但 connector 报 `billing response has no usable usage fields`。
- 代码链路确认：OAuth manager 按传入 instance id 写 vault；采集按正式 instance id 读；`buildSecretParamKeys` 未把 manifest auth 字段加入保存白名单，Grok `parameters: []` 导致正式实例 OAuth secrets 被静默跳过。
- t039 已规定零有效 usage 字段必须 failed/stale；本 task 先取得值脱敏响应结构，再决定解析新字段或明确无权益错误，不伪造 observation。
- 2026-07-28：从 `89bc31f9350241ad48039678bec1477691fc97bf` 启动，分支 `t159_fix_grok_oauth_binding_billing_parse`。
- 2026-07-28：脱敏 live 诊断确认 413-byte 响应只含 weekly period、on-demand cap/used、unified billing、prepaid balance、top-up method 与 billing period；当前 cap、used、balance 均为 0，不含 `creditUsagePercent` / `productUsage`，按“账号无可用额度或用量数据”分类，不伪造 observation。
- 2026-07-28：TDD 红灯确认 OAuth 白名单模块缺失、temp instance id 未透传、正式保存后未清 temp namespace；实现后专项测试 17 项通过。Grok 脱敏 fixture 精确错误测试先红后绿，connector 回归 9 项通过。
- 2026-07-28：黑盒验证：`pnpm test` 182 files / 1861 tests 通过；`pnpm typecheck`、`pnpm lint`、task 相关格式检查通过；`pnpm package` 成功；修复 packaged smoke 固定 CDP 端口无法 bind 后，`pnpm test:packaged` 3 项通过。`pnpm test:contract:live` 无匹配测试文件；全量 `pnpm check` 仍被 42 个既有 archive 格式文件及 3 个既有 unused files 阻断。实际已登录 Grok 实例请求 billing 返回 HTTP 200（413 bytes），按确认语义进入 failed/stale，错误为 `billing account has no available quota or usage data`，未出现 `no auth context`。
- 2026-07-28：Round 1 发现后补跨层回归：真实 config IPC、file vault、白名单、刷新排程与本地 HTTP bearer 注入均覆盖；同时抽离 OAuth 共享类型、preload API 工厂与添加账号参数类型。复验 `pnpm test` 184 files / 1864 tests、`pnpm typecheck`、`pnpm lint`、`pnpm package`、`pnpm test:packaged` 均通过。
- 2026-07-28：Round 2 code review 新增 `t159_code_f004`，指出临时 OAuth 凭证清理失败被吞没。已按 TDD 改为向调用方传播清理失败并完成全量黑盒复验；但此 finding 发生在 `max_review_round=2` 的第二轮，尚无独立复审确认。已按 review 门禁将 t159 置为 `blocked`。
- 2026-07-28：用户先批准将 `max_review_round` 提升至 3，随后提升至 5；已 resume t159，轮次累计，进行 Round 3 双审。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

### Round 1 零 finding

两轴均 0 finding 时写：「Round 1 零 finding，未进处置表。」不必建表。

### Round 1 (2026-07-28 13:10 UTC+8)

| finding_id     | severity  | status | rationale                                                           | fix_ref                                                               |
| -------------- | --------- | ------ | ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| t159_code_f001 | minor     | 已修   | 抽离 Grok/Kimi preload OAuth API 类型，避免继续增长超阈值入口文件。 | `src/preload/oauth_api.ts:26`                                         |
| t159_code_f002 | minor     | 已修   | 抽离添加账号共享参数类型，避免继续增长超阈值对话框文件。            | `src/renderer/components/add_account/add_account_params.ts:4`         |
| t159_code_f003 | minor     | 已修   | 抽离 OAuth 登录结果共享类型，避免继续增长超阈值 IPC 类型聚合文件。  | `src/shared/types/oauth.ts:1`                                         |
| t159_test_f001 | important | 已修   | 补正式实例 vault 保存、刷新排程与 bearer 注入跨层回归。             | `tests/integration/connector/grok_oauth_account_lifecycle.test.ts:92` |

### Round 2 (2026-07-28 13:40 UTC+8)

| finding_id     | severity  | status | rationale                                                       | fix_ref                                                                                                         |
| -------------- | --------- | ------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| t159_code_f004 | important | 已修   | 临时凭证清理失败向调用方传播，避免把残留 token 迁移报告为成功。 | `src/renderer/hooks/use_connector_catalog.ts:70`、`tests/unit/renderer/hooks/use_connector_catalog.test.ts:116` |

### Round 3 零 finding

code/test 双审均 PASS；Round 1 与 Round 2 finding 均已修，未进新处置表。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t159` 查，不在此记。

### 验收标准勾选

- [x] 新增 Grok 账号后 OAuth token 保存到正式 instance id，首次刷新不再因 `no auth context` 返回 401。（跨层回归覆盖；现有正式实例运行时验证未再出现 `no auth context`。）
- [x] oauth_device secret 白名单由 manifest auth 描述符推导，非 OAuth 保存行为不变。
- [x] temp OAuth token 成功迁移后清理，失败/取消/重复路径不影响其他实例。
- [x] 正式实例自动刷新使用同一 instance id。
- [x] billing HTTP 200 响应形成脱敏 fixture，并按真实语义报告明确无权益错误。
- [x] t039 零观测不变量及历史保留行为无回归。
- [ ] `pnpm check`、`pnpm test`、live contract、packaged smoke 与真实账号验证通过。（`pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm package`、`pnpm test:packaged` 通过；`pnpm check` 被既有 archive 格式与 deadcode 阻断，live contract 无测试文件；未删除真实账号重走 device-code。）

### Reviewer verdict

- Round 1 code：FAIL（t159_code_f001–f003，均已修）
- Round 1 test：FAIL（t159_test_f001，已修）
- Round 2 code：FAIL（t159_code_f004，已修）
- Round 2 test：PASS
- Round 3 code：PASS
- Round 3 test：PASS

### 遗留

- 环境验证限制：`pnpm check` 的既有 archive 格式与 deadcode 失败、空 live contract suite，以及未在真实删除账号后重走 device-code；不影响已通过的本 task 自动化与现有正式实例运行时验证。

### 结果摘要

- OAuth token 现保存至正式实例 namespace；临时 token 仅在正式保存成功后清理，清理失败不再伪装成功。
- Grok 无额度 billing 响应保持 failed/stale，并输出精确错误。
- Round 3 双审通过。
