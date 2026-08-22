---
tid: "t437"
slug: "wsl_host_collect_windows_agents"
title: "废除 local：env 改为 win/wsl/linux/mac"
status: "done"
branch: "t437_wsl_host_collect_windows_agents"
worktree: ""
review_level: "full"
diff_anchor: "80398ac99707accadaa30d343374f813873da901"
depends_on: ""
conflicts_with: ""
note: "来源 p204；逆转 t308 win→local；删死代码；为 t438 铺路"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- Step 1 spike（s032 → d048）：本机库全量统计定分类规则（盘符→win、/Users/→mac、POSIX→linux、NULL/孤儿→宿主默认），spec 未知契约清单已替换为结论，严格 preflight PASS。
- 实施派 coder subagent：schema 四值化、paths 按 env 定根、collector 平台源按宿主动态派生（key `kimi_win/linux/mac`，任一宿主只一个平台变体参与，sources_status 不增噪音；wsl 五源静态不变）、store 迁移 v8（事务内：daily 先按迁移前 sessions join 分类 → sessions/records 逐行分类+碰撞 merge（token MAX/started MIN/ended MAX）→ buckets 用既有 INSERT_BUCKETS_SQL 整体重建 → hour_rollup 清空置 unready 走异步回填；user_version=8）、subscription-service Env 四值 + watch 条件 `env!=="wsl"`、server.ts cast 改 TokenStatsEnv、TokenStatsView 筛选 all/win/wsl/linux/mac + prefs 旧值回退 all。
- AC-001 防线说明：collector→main 的 manager.ts 运行期并不 parse tokenStatsUpdateSchema（既有如此）；防线 = SourceDef.env 类型化（运行期产不出 local）+ schema 在 web/local-api 查询边界拒绝 local。按「或」语义满足，未加运行时 parse。
- 黑盒：`pnpm test` 3410 passed（独立复跑）；真实库副本（sessions 4463 / records 97.9 万行）跑 v8：行数与 token 合计逐表守恒、local 清零、wsl 不受影响、rollup 置 unready（脚本 `.scratch/t437/blackbox_migrate.ts`）。
- web e2e（`MOCK_FIXTURE=synthetic pnpm test:e2e:web`）两次尝试均被 5174 端口占用阻断——WSL 内 ss//proc/net/tcp 均无监听者但 bind EADDRINUSE，判为 Windows 侧进程经 localhost 转发占用，非本仓问题；该层黑盒未执行，dashboard 筛选改动由单测（token_stats_view/token_stats_dashboard）覆盖。
- format:check 基线 274 项告警为主仓既有（主仓同数），本 task 新增 0 项。
- Review Round 1：code PASS + 1 minor，test PASS + 4 minor；5 条 minor 全部已修（处置表 Round 1）。
- Round 4（文档轮）f002（minor）聚焦修复计划：失败项=①domain.md §3.4 插在 §3.1/§3.2 间跳号、②api.md 迁移列表 v7/v8 排在 v6 前；根因=插入位置未对齐既有顺序；最小修复=①§3.4 移到 §3.2 节之后、②迁移列表恢复 v6→v7→v8 升序；仅限这两处重排，不动文字内容。修后指纹变化 → Round 5 窄复核（仅 docs diff + 指纹）。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-23 03:55 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t437_code_f001|minor|已修|过期 local 注释改写为 win/linux/mac 语义|session-locator.ts:102-104、subscription-service.ts:7|
|t437_test_f001|minor|已修|mac 用例 query env 改 "mac"|subscription-service.test.ts:1332|
|t437_test_f002|minor|已修|两处测试 local 字面量改平台值|SessionShell.test.tsx:242、collector.test.ts:1250,1256|
|t437_test_f003|minor|已修|宿主默认断言改 HOST_DEFAULT_ENV 派生，跨平台不硬编码|token-stats-store.test.ts:1153-1156|
|t437_test_f004|minor|已修|补 dashboard platform→env 过滤测试（summary/rollup/sessions）|token_stats_dashboard.test.ts:86|

### Round 2 (2026-08-23 04:05 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t437_test_f005|minor|已修|summaries mock key 与请求 env 对齐（local→linux），三卡片摘要真触达|SessionLibrary.test.tsx:1212-1213|
|t437_test_f006|minor|已修|describe/it 名与注释「local 源」改平台称谓|session-locator.test.ts:182-318|

### Round 4 (2026-08-23 04:30 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t437_code_f002|minor|已修|domain §3.4 移至 §3.2 后、api 迁移列表恢复 v6→v8 升序（纯重排）|domain.md:68、ai-cli-token-stats-api.md:282-284|

## Review 处置（续）

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：每条 AC 在 `handoff.json` 的 `ac_evidence` 有对应引用（覆盖闭合门禁强制）；schema 四值且拒绝 local（单测）、存量迁移 v8 分类+守恒（临时库单测 + 真实库副本黑盒）、三宿主采集 env 标注（注入 host 单测）、UI 四平台筛选 + prefs 回退（单测）、local 字面量清零（守卫测试 + grep）、t308 死语义注释改写（review 复核）

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS（1 minor，已修）
- Round 1 test：PASS（4 minor，已修）
- Round 2 code：PASS（0 finding）
- Round 2 test：PASS（2 minor，已修）
- Round 3 code：PASS（0 finding，指纹复核）
- Round 3 test：PASS（0 finding）
- Round 4 code：PASS（1 minor 文档排序，已修）
- Round 4 test：PASS（0 finding）
- Round 5 code：PASS（0 finding，窄复核）
- Round 5 test：PASS（0 finding，窄复核）

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

env 枚举废除 `local` 统一 `win|wsl|linux|mac`：schema/paths/collector/store 迁移 v8/session-history/local-api/UI 全链改完；迁移经 97.9 万行真实库副本黑盒验证行数与 token 合计守恒；web e2e 因宿主 5174 端口被 Windows 侧进程占用未执行（环境阻断，非代码问题）。
