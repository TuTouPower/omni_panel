---
tid: "t473"
slug: "local_api_secrets_auth"
title: "Web/桌面同权限无认证基线：共享业务操作对齐（原敏感鉴权方向废止）"
status: "backlog"
branch: ""
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: ""
depends_on: ""
conflicts_with: ""
note: "与 t472 同文件区域，建议 t472 后实施"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

### 2026-09-14 文档修订（方向反转为同权限无认证，未实施）

用户裁定反转原安全方向，本轮据此重写 `spec.md` 并改标题（slug 仍为 `local_api_secrets_auth`，未改目录）：

- 原「把 `/v1/secrets`、`/v1/config` 移入 `check_auth` 后（需 token）」的方案与「token 阻塞」全部删除；改为 Web 与桌面**同权限、都不需要认证**的产品边界。
- 删除桌面侧 `assert_setting_route` 路由限制（`config-ipc.ts:680/686`），保留 `assert_valid_sender` 进程隔离。
- 列出共享能力清单：配置、secret、登录、控制、刷新采集；核对两端现状（`server.ts:1582-1740`、`config-ipc.ts`、`auth-ipc.ts`、`index.ts:708-731`、`connector-ipc.ts`）。
- 旧 AC-001..005 语义反转，**不复用编号**，退役后新增 AC-006..012（无凭据成功、两端一致、sender 防线、脱敏、破坏性确认、无新增 token）。
- 明确本 task 只定共享权限基线；新增能力由 t480/t481/t482 实现，避免重复实现。保留合法输入校验/隔离，不新增 token 登录。

调查路径：读 `server.ts`（handle_request 顺序、handle_web_config、handle_web_auth、handle_web_control、handle_web_connector）、`ipc/helpers.ts`、`config-ipc.ts`、`auth-ipc.ts`、d058。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round N (YYYY-MM-DD HH:MM UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t000_code_f001|critical/important/minor|已修/遗留/撤回|一句话|文件:行 / pNNN / tid|

无 finding 时写“Round N 零 finding”。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足 / 未满足
- 测试：待执行时填写
- 黑盒：待执行时填写
- review：待执行时填写
- AC 证据：见 `handoff.json`

### 结果摘要

- 待执行时填写；遗留只写引用，不复制正文
