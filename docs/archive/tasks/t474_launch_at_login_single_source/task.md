---
tid: "t474"
slug: "launch_at_login_single_source"
title: "主进程状态单一来源：自启与暂停态（tray/CLI/control 同步）"
status: "done"
branch: "t474_launch_at_login_single_source"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "64dc717caf5be8630c1c5dd3516461f68b60140a"
depends_on: ""
conflicts_with: ""
note: "合并原 t475（暂停态单一来源）"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

### 2026-09-14 文档修订（review 意见落地，未实施）

本轮按已批准审阅意见修订 `spec.md`，未开始实现：

- 自启改为「以 config 为准、双向应用」：删除原「只补开启、不做反向关闭」的回退矛盾；config 为假时也关闭 OS 登录项（AC-004 重写）。依据 `index.ts:1162-1167` 与 `client.ts:230-240` 现状均不回写 config。
- Linux 本批能力明确不可用（`index.ts:1078` `hasLoginItemApi`、`client.ts:230-240`），不再作为未定产品问题留在未知契约清单。
- orchestrator 暂停态查询：查实**当前无**只读查询 API（`scheduler-orchestrator.ts:41-48` 只公开 `startAll/rebuild/reconcile/suspend/resume/shutdown`，`pauseReasons` 私有），明确为本 task 新增实现，不再标 `UNVERIFIED-BLOCKING`。
- 新增 AC-008（Web 自启由宿主执行、两端一致）、AC-009（无 API 平台返回能力不可用）；原 AC-001..007 编号保持不动，AC-008 由原 `[deploy]` 条目顺延为 AC-010。
- Web/CLI/tray 同一实际调度状态（AC-005/007 保留）。

调查路径：读 `index.ts:700-731,1047-1167`、`scheduler-orchestrator.ts`、`cli/client.ts:230-252`、d058。

### 2026-09-14 实施与验证（attempt 1，execution_id `862db22827f44d69834e4fb181cfc3d0`）

- 新增 `launch-at-login` 主进程适配层：启动按 config `launchAtLogin` 双向应用 OS 登录项；配置保存、导入、tray 与宿主控制端点均复用该路径。Linux/无 Electron 登录项 API 返回 `available:false`，不写 OS 状态。
- scheduler orchestrator 暴露 `get_pause_state()` 与 `on_pause_state()`；tray 删除主进程本地 `is_paused`，LocalAPI 新增 `/v1/control/status`、`/v1/control/autostart`，CLI 在支持平台经宿主端点切换，所有入口读取同一实际状态。
- 定向回归：launch-at-login 2、orchestrator 26、CLI 22、LocalAPI control 2，共 52 tests PASS；changed-file ESLint、全仓 Prettier、Knip、dependency-cruiser、`git diff --check` PASS。
- LocalAPI 完整控制集成在 `better-sqlite3` 原生绑定 setup 阶段阻塞，未进入业务断言；全仓 `tsc --noEmit` 仅报既有缺失的 `src/main/generated/build-info`。生成脚本又被受限环境的 `tsx` IPC `listen EPERM` 阻塞，生产构建无法在本环境启动。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round N (YYYY-MM-DD HH:MM UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t000_code_f001|critical/important/minor|已修/遗留/撤回|一句话|文件:行 / pNNN / tid|

无 finding 时写“Round N 零 finding”。

### Round 1 (2026-09-14 08:05 UTC)

Round 1 零 finding。

实现侧复核确认 OS 登录项只有主进程适配层写入，config 保存与启动均走同一双向应用路径；暂停原因集合仍只在 orchestrator 内维护，tray/CLI/LocalAPI 通过查询与订阅读取。

测试侧复核确认 config/OS 双向应用、Linux 不可用、暂停原因组合与通知、LocalAPI 状态/自启端点、CLI 宿主转发均有回归；SQLite 原生绑定与 generated build-info 阻塞均按环境证据记录。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：AC-001..009 全部满足；[deploy] AC-010 保留真实 macOS/Windows 重启签收，Linux 能力不可用已自动验证
- 测试：定向 52 tests PASS；全仓 Prettier、changed-file ESLint、Knip、dependency-cruiser、diff-check PASS
- 黑盒：LocalAPI control 单元 HTTP 回归 PASS；完整 LocalAPI 集成被 better-sqlite3 native binding 阻塞；生产构建被生成脚本 IPC 权限阻塞
- review：Round 1 code + test PASS，0 finding
- AC 证据：见 `handoff.json`

### 结果摘要

- 自启由 config 双向驱动 OS 登录项，暂停态由 orchestrator 单一来源驱动；无 pending/finding。[deploy] AC-010 需在支持平台实际重启签收。
