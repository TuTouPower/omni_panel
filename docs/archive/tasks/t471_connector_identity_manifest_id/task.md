---
tid: "t471"
slug: "connector_identity_manifest_id"
title: "连接器身份改 manifestId：平台无关标识 + 存量迁移"
status: "done"
branch: "t471_connector_identity_manifest_id"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "702dfdb0d780cffecd3fc8b6e5e4315430148676"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

### 2026-09-14 文档修订（review 意见落地，未实施）

本轮按已批准审阅意见修订 `spec.md`，未开始实现。要点与依据：

- 补全行为 AC：新增 AC-007（异平台/混合路径分隔符的尾段提取）、AC-008（manifest 身份与实例身份分离、多实例参数/启用态/secret 归属保留）、AC-009（未知 manifest 孤儿清理的脱敏日志与结果摘要）。原 AC-001..006 编号保持不动。
- manifest 身份与实例身份分离：`manifestId` 只定位定义，`instanceId`/`stateId` 仍是实例身份与 `keyFor(instanceId, name)` 的 secret 归属键；迁移与 auto-seed 不得合并或改写实例身份。依据：本仓 `config/types.ts:36-47`（现无 manifestId）、`auto-seed.ts:23-74`（现按目录名/id 匹配）、`secret_param_keys.ts`（按实例取 secret keys）。
- 异平台分隔符：现 `auto-seed.ts:30` 只用 `split(/[/\\]/)` 取尾段，未覆盖 UNC/盘符/结尾分隔符等；本 task 要求尾段提取覆盖这些形态（AC-007）。
- 孤儿清理决策由用户确认（确实移除），本 task 不改决策，只补可观察性与脱敏日志要求（AC-009）。
- 未知契约清单无阻塞项；`auto-seed` 的 `name.toLowerCase()===id` 兼容分支明确在迁移后删除。

调查路径：读 `AGENTS.md`、`docs/blueprint/conventions.md`、`docs/findings/d058_multi_entry_impl_audit.md`；本仓源码 `src/shared/types/config.ts`、`src/main/core/config/{types,auto-seed,secret_param_keys,config-store}.ts`、`src/main/ipc/config-ipc.ts`、`src/main/core/connector/manifest-loader.ts`。

### 2026-09-14 实施与验证（attempt 1，execution_id `169aa5000fc64d0bb5765665e4640b2c`）

- 将连接器 schema、共享类型、auto-seed、调度、认证、连接器 IPC、secret key、配置 IPC/CLI 全部切换到 `manifestId`；`executablePath` 只作为本机缓存、健康检查和日志路径。
- 新增跨平台尾段解析与存量迁移：按本机 definition 刷新路径，保留同 manifest 的每个 instanceId/stateId 及其配置字段；未知项逐条记录 instanceId、manifestId、原路径和原因，并写迁移前 `.bak` 与移除数量摘要。
- 导入入口在 manifest 校验后按 manifestId 重算本机 executablePath；renderer 保存拒绝直接修改派生路径。补充 Windows/POSIX/UNC/混合路径、多实例、孤儿日志、IPC/CLI 导入重映射回归。
- 定向回归：6 个测试文件、113 tests PASS；`CI=true pnpm typecheck`、`NODE_OPTIONS=--max-old-space-size=4096 CI=true pnpm lint`、`CI=true pnpm format:check`、`pnpm deadcode`、`pnpm arch`、`electron-vite build`、`pnpm run build:web` 均 PASS。构建仅有仓库既有 CSS 优化 warning。
- 黑盒/全量门禁：`CI=true pnpm test` 在 `ensure_sqlite_abi.mjs node` 的 Node 24 headers 解压阶段被环境 `TAR_ENTRY_ERROR EINVAL: invalid argument, fchown` 阻塞，未进入 Vitest；此前直接 Vitest 全量的失败均集中在同一 `better-sqlite3` native binding 缺失，t471 定向回归全绿。`md_format.py --changed` 因环境缺少 `md_kx` 阻塞；Prettier format check 与 `git diff --check` 已通过。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-14 14:21 UTC+8)

Round 1 零 finding。

独立 code/test review 均 PASS，review scope 指纹为 `0ab89937b276e6e7`，无 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足；全量 `pnpm test` 与 md_kx 仅受环境阻塞，见实施笔记
- 测试：定向 113 tests PASS；typecheck/lint/format/deadcode/arch PASS；两套生产构建 PASS
- 黑盒：config-store 集成迁移/日志、IPC 与 CLI 导入重映射回归 PASS；全量入口在 better-sqlite3 Node ABI 构建阶段阻塞
- review：Round 1 code + test PASS，0 finding
- AC 证据：见 `handoff.json`

### 结果摘要

- `manifestId` 成为唯一连接器定义身份，迁移、auto-seed、导入与运行时 lookup 均不再以 executablePath 判等；实例身份和 secret 归属保持不变。环境阻塞无代码遗留，不新增 pending/finding。
