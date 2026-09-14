---
tid: "t478"
slug: "cookie_login_contract_unify"
title: "cookie 登录契约统一：单一返回形状与错误码"
status: "done"
branch: "t478_cookie_login_contract_unify"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "4046fc765cc2a2445bcf3df449d6ba1b88b9d431"
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

本轮按已批准审阅意见修订 `spec.md`，未开始实现：

- 固定非阻塞启动 + 轮询契约与状态生命周期（`running/succeeded/canceled/failed/timeout`，`in_progress=false` 时必为终态）；旧 AC-001..005 语义变化，退役编号，新增 AC-006..011。
- 查全部调用方：`poll_cookie_login`（`cookie_login_poll.ts:93-124`）是 `auth.cookieLogin`/`cookieLoginStatus` 唯一调用方，仅 `SettingsForm.tsx:245` 与 `WebLoginSection.tsx:48` 调用；无依赖阻塞返回 `saved` 的调用方。原 `UNVERIFIED-BLOCKING` 解除。
- 两端无新增认证（t473 基线）；Web 触发登录窗口属宿主执行。删除违背统一非阻塞的「桌面内部等待可选」回退表述。
- 真实网页登录/超时/取消属 `[deploy]`，不冒充已验证。

调查路径：读 `auth-ipc.ts:45-146,230-243`、`server.ts:927-970`、`cookie_login_poll.ts`、`SettingsForm.tsx`、`WebLoginSection.tsx`、`preload/index.ts`、d058。

### 2026-09-14 实现记录

- 新增共享 Cookie 登录状态/错误码定义；桌面 IPC 与 LocalAPI 均调用 `startCookieLogin`，启动成功立即返回，冲突返回统一 `{started:false, conflict:true, error_code, error}`。
- `cookieLoginStatus` 统一返回 `running/succeeded/canceled/failed/timeout` 生命周期；取消/超时只返回稳定 `error_code`，失败终态返回统一用户文案。
- renderer 轮询删除旧的阻塞 `{saved}` 兼容路径，设置页与 Web 编辑页均只走启动 + 状态轮询；补齐 IPC、Web、LocalAPI 与组件回归用例。
- 真实第三方登录窗口和真实超时/取消仍属于 `[deploy] AC-011`，本轮未冒充完成。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-14 21:30 UTC+8)

Round 1 零 finding。

独立 code/test review 均 PASS，无 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：AC-006..010 已满足；`[deploy] AC-011` 保留部署后人工验证
- 测试：定向回归 135 passed；LocalAPI 集成测试因 `better-sqlite3` Node v24 native binding 缺失在启动阶段阻塞
- 黑盒：typecheck、ESLint、Prettier、Knip、dependency-cruiser 通过；Electron/Web bundler 直接构建通过；完整 `pnpm build` 另受 `tsx` pipe `EPERM` 阻塞
- review：Round 1 code/test 均 PASS，无 finding
- AC 证据：见 `handoff.json`

### 结果摘要

- Cookie 登录已统一为桌面 IPC 与 LocalAPI/Web 的非阻塞 start + poll 契约；部署人工项见 `handoff.json` 的 `pending`
