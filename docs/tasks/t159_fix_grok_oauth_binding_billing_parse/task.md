---
tid: t159
slug: fix_grok_oauth_binding_billing_parse
diff_anchor: "<SHA>"
branch: ""
---

# Task t159_fix_grok_oauth_binding_billing_parse

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 2026-07-28 日志诊断确认两段独立故障：
    - 首次新增账号登录写入临时 id `grok-1785205934131-61sec0rq`，正式实例 `cc9934d9-5ebf-42f6-ad95-f6c4c25279f7` 首次刷新返回 `401 ... reason=no auth context`。
    - 对正式实例重新登录后连续 billing HTTP 200，但 connector 报 `billing response has no usable usage fields`。
- 代码链路确认：OAuth manager 按传入 instance id 写 vault；采集按正式 instance id 读；`buildSecretParamKeys` 未把 manifest auth 字段加入保存白名单，Grok `parameters: []` 导致正式实例 OAuth secrets 被静默跳过。
- t039 已规定零有效 usage 字段必须 failed/stale；本 task 先取得值脱敏响应结构，再决定解析新字段或明确无权益错误，不伪造 observation。
- 开干时填写 `diff_anchor` 与 `branch`。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

### Round 1 零 finding

两轴均 0 finding 时写：「Round 1 零 finding，未进处置表。」不必建表。

### Round N (YYYY-MM-DD HH:MM UTC+8)

| finding_id     | severity                 | status | rationale | fix_ref   |
| -------------- | ------------------------ | ------ | --------- | --------- |
| t159_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t159` 查，不在此记。

### 验收标准勾选

- [ ] 新增 Grok 账号后 OAuth token 保存到正式 instance id，首次刷新不再因 `no auth context` 返回 401。
- [ ] oauth_device secret 白名单由 manifest auth 描述符推导，非 OAuth 保存行为不变。
- [ ] temp OAuth token 成功迁移后清理，失败/取消/重复路径不影响其他实例。
- [ ] 正式实例自动刷新使用同一 instance id。
- [ ] billing HTTP 200 响应形成脱敏 fixture，并按真实语义解析或报告明确无权益错误。
- [ ] t039 零观测不变量及历史保留行为无回归。
- [ ] `pnpm check`、`pnpm test`、live contract、packaged smoke 与真实账号验证通过。

### Reviewer verdict

- Round 1 code：N/A
- Round 1 test：N/A
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无

### 结果摘要

- 待实施。
