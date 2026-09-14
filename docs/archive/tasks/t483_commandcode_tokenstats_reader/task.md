---
tid: "t483"
slug: "commandcode_tokenstats_reader"
title: "Command Code 代理面板用量采集（token-stats reader）"
status: "done"
branch: "t483_commandcode_tokenstats_reader"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "d1e55a55de216183b7dc7b18dd119902be7a49c7"
depends_on: ""
conflicts_with: ""
note: "来源 s037/d059；新增 commandcode-reader.ts + collector kind + AgentFilter 接线；累计差分须处理回落"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

### 2026-09-14 文档修订（review 意见落地，未实施）

本轮按已批准审阅意见修订 `spec.md`，未开始实现：

- 采纳证据边界：s037 探针只统计 `inputTokens` 首末/递增，**不能证明** output/cache/cost 是累计，也不能排除 context 增长解释。原 spec 直接断言「usage 是累计值」「`fresh = inputTokens - cacheReadTokens`」已降级为待验证项，不当作已核实事实。
- 未知契约清单新增 `UNVERIFIED-SPIKE`：各字段数值语义、包含关系、context 增长替代解释，由受控只读探针在用户放行轮次复核后再固定口径；无法安全取得明确期望则保持 `UNVERIFIED-BLOCKING`，不杜撰。
- AC-005 加前置条件「仅当 AC-007 实验确认子集/同口径时成立」；新增 AC-007（先实验后固定口径）、AC-008（幂等/增量/重启）、AC-009（回落数值可复算）。原 AC-001..006 编号保持不动。
- 明确公共类型/筛选接线归 t484，本 task 只负责 reader/collector/口径与采集侧，避免重复。
- 本轮不读真实用户会话、不做上游实验。

调查路径：读 `docs/spikes/s037_commandcode_token_session_source/report.md`、`docs/findings/d059_commandcode_session_jsonl_format.md`、`src/main/core/token-stats/codex-reader.ts`（累计差分/回落/幂等对齐基准）。

### 2026-09-15 实施与验证

- 新增 `commandcode-reader.ts`：读取 Linux/macOS 的
    `~/.commandcode/projects/<encoded-cwd>/<session-id>.jsonl`，仅接收 assistant
    message usage；从 session header 取得 session id、cwd，从同目录 meta 文件取得
    title；跳过 checkpoints、根目录 history 和非 assistant/无 usage 行。
- 按 d059 口径把每轮 `inputTokens`、output、cache read/write、cost 作为独立值累加；
    存储 input 时拆出 cache read，保证 token 总量重建原始 input 且不重复计算，并保留
    cost 到 reader facts/state 供采集侧验收。
- 接入 collector source kind、平台路径和 scan state；按文件 mtime 增量扫描，文件变更
    时对 session 完整重算，删除/追加/进程重启均通过序列化 scan state 保持幂等。
    公共 source/agent union 与 dashboard filter 接线按 spec 留给 t484。
- 定向验证：4 个 token-stats 测试文件、83 tests 全部通过；直接 TypeScript 检查、
    ESLint、Prettier、`git diff --check` 通过。全量 Vitest 为 3718 tests（3343
    passed、9 skipped、366 failed），失败集中于环境缺少 `better-sqlite3` native
    binding，未出现 Command Code 新增用例失败；`pnpm` 门禁仍受已知 non-TTY/native
    依赖环境限制。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-15 22:44 UTC+8)

Round 1 零 finding。实现 review 与测试 review 均 PASS，`reviewed_scope=35fd7b5a8c049164`。
AC-006 的公共 source/agent union、dashboard agent_totals 与 AgentFilter 接线按 spec
由 t484 承接；其余 reader/collector/scan-state AC 已由定向测试和代码复验覆盖。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：t483 范围内全部满足；t484 接线项按任务拆分承接
- 测试：定向 4 files / 83 tests PASS；直接 tsc、ESLint、Prettier、`git diff --check` PASS
- 黑盒：全量直接 Vitest 3718 tests 中 3343 PASS、9 skipped、366 failures；失败集中于
    环境缺少 `better-sqlite3` native binding，`pnpm test` 另受 non-TTY/native 依赖门禁阻塞
- review：Round 1 code + test PASS，0 finding，scope `35fd7b5a8c049164`
- AC 证据：见 `handoff.json`

### 结果摘要

- 已完成 Command Code reader、路径、collector source kind 与 scan-state 持久化；每轮
    usage 直接累加并保留缓存归一、回落值和 cost facts。遗留仅为 t484 的公共类型/筛选/
    dashboard 接线，不在本 task 内重复实现。
