---
tid: "t457"
slug: "session_query_title_directory_filters"
title: "会话查询支持独立标题、工作目录过滤"
status: "done"
branch: "t457_session_query_title_directory_filters"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "2f5bc2f3f9b360efe33bd0f1f86591e9c6af3674"
depends_on: ""
conflicts_with: ""
note: "查询契约：title/directory 独立 AND；下游 UI 与 skill 依赖"
---

# Task 过程总账

**front matter 是状态权威**，只经 `.repo_template/scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

- TDD：store 层先行红 6 例（字段被忽略 4 例 + 夹具断言自身错误后修正），实现后全绿；再逐层打通 shared types → store → HTTP `/v1/sessions` 解析 → web `getSessions` 序列化 → IPC/HTTP searchContent 候选与 metadata 透传。
- LIKE 转义策略与既有 `search` 完全一致（`replace(/[\\%_]/g)` + `ESCAPE '\\'` + 命名参数绑定）；probe 实验证实 SQLite `ESCAPE` 折叠语义后，新增含字面反斜杠的 `literal-bs` 行作为判别夹具。
- 门禁修复（非范围扩大）：`token-stats-store.ts` `fallback && ...` 改 optional-chain——t445 在 main 遗留的 eslint error，阻塞 lint 门禁；local-api/server.ts 4 行既有超长 `agent as` 行由 prettier 重排、`src/shared/types/token-stats.ts` 同步格式化——main 上 format:check 本就红（25 文件），本 task 触及文件全绿，分支不新增违规（22 文件遗留，全在 base 既有集合内）。code reviewer 已独立实测复核。
- worktree 环境：electron dist 与 path.txt 从主仓复制（pnpm 安装未下载二进制）；门禁命令全部按 testing.md worktree 注意事项执行（gen-build-info、ensure_sqlite_abi node、pnpm install）。
- 黑盒验证：按 testing.md 层级选择——查询契约层走 `pnpm test`（默认层）+ HTTP 集成测试触达可观察行为（真实 better-sqlite3 store + LocalAPI 全链路），未定义项目级单命令，不伪写。
- review Round 1 后补收尾文档（specs 沉淀 / specs_index / architecture.md），指纹变化触发 Round 2 复审（两报告均 PASS、scope ok）。
- 遗留：test review 3 条 minor（覆盖补强）登记 `docs/pending/todo/p224_session_query_filter_test_coverage_gaps.md`。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `.repo_template/scripts/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-09-08 05:48 UTC+8)

code 零 finding，未进处置表。test 3 条 minor 建表处置：

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t457_test_f001|minor|遗留|store 级 AC-004 缺 `search` 与新条件同用例；参数绑定路径风险低，t458 前闭合|p224|
|t457_test_f002|minor|遗留|AC-001 id 串字段无判别用例；夹具局限，不阻断|p224|
|t457_test_f003|minor|遗留|桌面 IPC 通道无 title/directory 行为断言；handler 纯透传，类型背书|p224|

### Round 2 (2026-09-08 06:12 UTC+8)

收尾文档更新触发重审（指纹 0e8da6ec74d0e24a → 8e8e69b64bfe5e0d）。Round 1 三条 finding 维持遗留处置，无新 finding，未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：每条 AC 在 `handoff.json` 的 `ac_evidence` 有对应引用；store/IPC/HTTP/web 四层测试 12 个 t457 用例全绿，HTTP 集成测试以真实 store 端到端验证三入口过滤语义

### Reviewer verdict

- Round 1 code：PASS（0 finding）
- Round 1 test：PASS（3 minor，已处置）
- Round 2 code：PASS
- Round 2 test：PASS

### 结果摘要

- 会话查询与正文搜索候选过滤新增独立 `title`/`directory`（大小写不敏感子串、全条件 AND、空/省略不约束），三入口同语义；LIKE 转义与参数绑定同 `search` 策略。
