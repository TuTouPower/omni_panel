---
tid: "t524"
slug: "connector_worker_packaged_fix"
title: "修复打包后连接器隔离子进程崩溃与全量采集失败"
status: "done"
branch: "t524_connector_worker_packaged_fix"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "f4fe9a67cc17ba9cbc7efc2450ceec8bcdcae94d"
depends_on: ""
conflicts_with: ""
note: "来源: p259"
---

# Task 过程总账

**front matter 是状态权威**，只经 `.repo_template/scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

1. `electron.vite.config.ts` 在 `main.build.rollupOptions.input` 中补齐 `connector-worker` 入口。
2. `electron-builder.yml` 与 `electron-builder.test.yml` 将 `out/main/connector-worker.js` 加入 `asarUnpack` 列表。
3. `src/main/core/connector/worker/connector-worker-entry.ts` 适配 Electron `parentPort` 与 Node `process.send` 双模 IPC 监听。
4. `src/main/core/connector/isolated-process-runner.ts` 优先使用 Electron 原生 `utilityProcess.fork` 启动编译后的 worker，新增 `resolve_connector_worker_path` 正确解析 `app.asar.unpacked` 路径，并在单测纯 Node 环境保留 `child_process.fork` 回退。
5. 补充针对构建配置、解包路径解析以及打包应用下连接器运行的集成测试与 smoke E2E 用例。
6. `pnpm check`（包含 typecheck / lint / format:check / deadcode / arch / schema:check / 333 套件 4097 用例）全部通过。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `.repo_template/scripts/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

Round 1 零 finding，未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：每条 AC 在 `handoff.json` 的 `ac_evidence` 有对应引用（覆盖闭合门禁强制）；此处写一句话摘要，不复制 AC 正文

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS
- Round 1 test：PASS

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

修复了打包后由于 runAsNode: false 导致连接器隔离子进程崩溃并使所有连接器采集失败的缺陷。构建配置增加了 connector-worker 入口与 asarUnpack 列表；运行时适配 Electron utilityProcess 与单测 Node 双模支持；全量测试与门禁验证通过。

