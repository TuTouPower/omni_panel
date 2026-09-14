---
tid: "t480"
slug: "web_bridge_parity"
title: "Web bridge 补齐：日志导出/主题/token-stats 方法对齐"
status: "done"
branch: "t480_web_bridge_parity"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "6df9760d289824218961de0461482600055926b5"
depends_on: ""
conflicts_with: ""
note: "与 t476 有交集，建议错开实施"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

### 2026-09-14 文档修订（review 意见落地，未实施）

本轮按已批准审阅意见修订 `spec.md`，未开始实现：

- 删除「实现或者禁用或者移除」的随意降级分支：改为 Web 等价实现，逐项行为 AC（`recent`/`snapshot`/`forceCollect`/`getBuckets`/`getRecords`），filters 与 limit 不丢；宿主能力由宿主实现，呈现可异但不区权限。
- 调用图已查（2026-09-14）：`snapshot`/`getBuckets`/`getRecords`/`recent` 当前无 renderer 调用点，`forceCollect` 仅 `SessionShell.tsx:163`；据此**只用于确定实现方式，不砍功能**。原 `UNVERIFIED-BLOCKING` 解除。
- 保留日志导出错误语义统一、主题去重与 `config.save({theme})` 同步主进程 `nativeTheme`（`event-ipc.ts:78` 现状仅 THEME_SET 更新）。
- 新增 AC-009（宿主能力经 bridge 执行、权限一致）；原 AC-001..008 编号保持不动。
- 与 t476 协调：t476 定共享查询契约与校验，本 task 只做 bridge/HTTP 接线。

调查路径：读 `usageboard-web.ts`（snapshot/recent/forceCollect/getBuckets/getRecords/logs/theme）、`preload/index.ts`、`server.ts:1091`、`log-ipc.ts`、`renderer/lib/theme.ts`、`event-ipc.ts`、d058。

### 2026-09-14 实施记录

- Web bridge 已把 `snapshot`、`recent`、`forceCollect`、buckets/records filters 和宿主控制操作接到 LocalAPI；不支持的浏览器呈现能力改为明确错误，不再静默 no-op。
- LocalAPI 新增 connector snapshot、theme、forceCollect 接线；buckets/records 完整透传过滤条件；日志缺失统一返回 `LOG_NOT_FOUND`；主题配置保存和 Web 设置均同步主进程 `nativeTheme`。
- renderer 与 Web 复用 `src/renderer/lib/theme.ts::apply_theme`，Web popup 专属 hooks 在浏览器环境跳过 Electron-only 调用。
- 定向单元回归：5 个文件、101 tests passed；类型检查、Prettier、Knip、dependency-cruiser 和 ESLint（提高 Node 堆上限）通过。
- LocalAPI 集成测试 116 tests 在 setup 阶段被 `better-sqlite3` Node ABI 缺失拦截；Node headers 下载解包又被环境 `fchown/EINVAL` 阻塞，未进入业务断言。Electron ABI 已成功编译验证；直接 Electron/Web 构建通过，完整 `pnpm build` 仍受 `tsx` IPC 管道 `EPERM` 阻塞。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1（2026-09-15 00:08 UTC+8）

Round 1 零 finding。独立 review 结论为 PASS，review scope fingerprint 为 `8f4cc2cd44c40566`。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足；AC-008/009 的真实 Electron/托盘部署态签收保留为人工抽查项。
- 测试：定向单元 5 files / 101 tests 通过（Web bridge 65 tests）；typecheck、ESLint、Prettier、Knip、dependency-cruiser 通过。
- 黑盒：LocalAPI 集成 116 tests 在 `better-sqlite3` Node ABI 缺失的 setup 阶段阻塞；Node headers 解包遇 `fchown/EINVAL`。Electron ABI 已编译验证；直接 Electron/Web 构建通过；完整 `pnpm build` 的 `tsx` IPC 管道遇 `EPERM`。
- review：single Round 1 PASS，零 finding；详见 [`review_general.md`](review_general.md)。
- AC 证据：见 `handoff.json`。

### 结果摘要

- Web bridge 的共享业务能力已接入 LocalAPI/宿主，浏览器专属呈现能力改为明确错误；参数透传、日志错误语义、主题同步和宿主控制状态均有代码与测试证据。
- 环境遗留仅为 native SQLite/tsx 启动器限制，已在 `handoff.json` 记录，不构成业务 finding。
