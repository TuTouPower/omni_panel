---
tid: "t537"
slug: "flowercloud_multi_service_metrics"
title: "花云多服务账号用量采集"
status: "done"
branch: "t537_flowercloud_multi_service_metrics"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "3b8ea11bead74f5ba07f38ceadf7e4ef0332ad34"
depends_on: ""
conflicts_with: ""
note: "来源: p267"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

- 未知契约（UNVERIFIED-SPIKE）：spike `s041`（`docs/spikes/s041_flowercloud_multi_service_dom/`）按 spec 允许的「WHMCS 结构构造 fixture 并验证」执行——真实单服务样本同构的 3 服务卡列表 + WHMCS 表格 probe 全 PASS；链接卡首反例实测**错配表现为命中而非缺失**，据此定下生产规则「任一卡窗不完整 → 丢弃全部窗口结果 → 逐服务 HTTP 详情页补数 → 失败逐服务登记」。spec 未知契约区已改写为该结论与验证方式，preflight --require-verified PASS。
- 宿主（`flowercloud_dom.ts`）：新增 `flower_service_ids`（有序去重）与 `compose_flower_sections`；`poll_flower_usage_html` 重写为服务队列导航（列表发现 → 逐服务详情结算 → 分段入库）；`flower_snapshot_url` 移除（直跳首个详情页会让其余服务永远不被发现），快照统一从列表页开始；单服务结果保持裸 HTML 退化形态（存量载荷兼容），多服务写 composite，未达服务带 `error` 标注，全败不写快照保留旧值（t535 语义）。
- 连接器（`connectors/flowercloud/connector.ts`）：三形态解析（composite 分段 / 多服务卡窗 / 单服务整页）；缺数条目逐服务 HTTP 详情页补数（快照完整时零请求）；失败走 `ctx.report_failed_account` → `result.failed_accounts`（runtime wrapper 收集，测试断言 result 而非注入 spy）；`account_id` 单服务 `flowercloud_default`、多服务 `flowercloud_service_<id>`；HTTP 当场取数 `stale: false`、快照解析按快照年龄；p267 的「只统计首个」warn 及其占位测试被 AC-001 测试替代（占位语义已被真实功能取代，非就地迁就实现）。
- 展示（`provider-usage.ts`）：实例备注（displayName）覆盖采集层账号名是既有单账号契约（保留全部既有测试）；同一实例贡献多账号时回退 `collected_label`（采集层服务名），保证多服务可区分——AC-004 测试用「设备注 + 2 服务」构造最严场景。
- 既有测试语义变更（各带理由注释）：`session-manager.test.ts` 「直跳存储的服务详情页」→「从列表页开始以发现服务」（多服务发现的必然结果，t537 范围）；`flowercloud_connector.test.ts` p267 warn 占位测试 → AC-001 真实多服务输出（spec 功能取代最小措施）。
- 门禁：`pnpm check` 7 段全绿（typecheck/lint/format/deadcode/arch/schema/test，341 文件 4264 passed / 8 skipped）、`pnpm build` 绿。注：首跑 `pnpm check` 曾出现 3 个测试文件级失败且其后两次全量重跑均未复现（无测试断言失败），按瞬态记录，未定位。
- 文档：`domain.md` 新增「花云多服务账号指标与账号标识（t537）」；`specs/flowercloud_usage.md` 契约区/UI/验证方式按多服务语义累积更新；`specs_index.md` flowercloud_usage 行追加 t537。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-30T10:05:09+08:00)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t537_gen_f001|minor|已修|补单服务退化契约断言：快照路径（uses session DOM directly）与 HTTP 路径（follows product details link…，id=999 单服务）均锁定 `account_id = flowercloud_default`|tests/integration/connector/flowercloud_connector.test.ts|
|t537_gen_f002|minor|已修|回退判定改为 `instance_label_applied` 标志（to_period 记录备注是否命中），不再拿清洗后的 accountLabel 反比原始 displayName；补 70 字符截断备注下仍回退服务名的测试|src/renderer/lib/provider-usage.ts；tests/unit/renderer/components/flowercloud_multi_service_card.test.tsx|
|t537_gen_f003|minor|已修|导航后经 `read_page_hint` 核对落点 URL 属于当前服务，不匹配判该服务失败（hint 不可用不拦）；补错配防护测试（错服务用量绝不进分段）|src/main/core/session/flowercloud_dom.ts poll 导航段；tests/unit/session/flowercloud_dom.test.ts|

### Round 2 (2026-09-30T10:17:30+08:00)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t537_gen_f004|minor|已修|落点核对改 `hint_belongs_to_service`（URL 解析取 `id` 参数精确比对，解析失败按不匹配），导航后与结算落盘前双重复核；补前缀 id（8848 vs 88480）拒绝测试|src/main/core/session/flowercloud_dom.ts；tests/unit/session/flowercloud_dom.test.ts|
|t537_gen_f005|minor|已修|`collected_label` 存储即 sanitize（与无覆盖路径同一 64 字符上限 + 控制字符过滤语义）；补脏标签回退仍清洗的测试|src/renderer/lib/provider-usage.ts to_period；tests/unit/renderer/components/flowercloud_multi_service_card.test.tsx|

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm check` 7 段全绿（typecheck / lint / format:check / deadcode / arch / schema:check / test），`pnpm test` 342 文件 4275 passed / 1 skipped（4276 tests）；`pnpm build` 绿
- 黑盒：默认层级 `pnpm test`（主链）；本 task 不触碰窗口/打包/真实 Electron 行为面，无需弹窗类验证。注：首轮 `pnpm check` 曾出现 3 个文件级失败且两次全量重跑未复现（无断言失败），按瞬态记录于实施笔记
- review：single 级。`review_general.md`：Round 1 PASS（f001-f003 minor）→ Round 2 PASS（f004/f005 minor）→ Round 3 PASS 零 finding。`check_review_status`：overall=PASS、review_scope=ok、round=3；5 条 finding 全部已修，无遗留 critical/important；reviewer 独立复跑 test/typecheck/lint 绿、AC coverage 4/4 re_verified
- AC 证据：见 `handoff.json`

### 结果摘要

- AC-001~AC-004 全部满足：多服务逐服务观测（单服务 `flowercloud_default` 退化契约锁定）、失败隔离（`failed_accounts` 逐服务）、仅列表快照 HTTP 补数与显式标注、面板/弹窗可区分服务名与用量（含备注截断/脏标签边缘）
- 遗留：无（finding 全部已修；reviewer 结论段提示「落点核对未校验 action 参数」不可构造失败场景，未立 finding）；系统性建议 `per_account_failed_placeholder` 为非阻断 follow-up 建议，未立 pending
- 关联：p267 由本 task 闭环（创建期已归档）；spike `s041` 结论入 spec 未知契约区与 `docs/findings` 体系（未新增 dNNN，结论直接固化在 spec/blueprint）
