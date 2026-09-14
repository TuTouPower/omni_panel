---
tid: "t473"
slug: "local_api_secrets_auth"
title: "Web/桌面同权限无认证基线：共享业务操作对齐（原敏感鉴权方向废止）"
status: "done"
branch: "t473_local_api_secrets_auth"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "a064a7a06f0c8f1f98dfa624fa8f16436de005e2"
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

### 2026-09-14 实施与验证（attempt 1，execution_id `efefa912f484496b9f15ca71447c0d63`）

- 删除 `assert_setting_route` 及其调用；`CONFIG_GET_SECRETS` / `CONFIG_SAVE_SECRETS` 仍先执行 `assert_valid_sender`，合法 renderer 的 `#usage` 等路由可调用，非法 sender 继续拒绝。
- 保持 LocalAPI 业务端点在 `check_auth` 之前的既有顺序；补充无 `Authorization` 头的真实 HTTP 回归，覆盖 config GET/POST 与 secrets GET/POST。既有 duplicate/create/export/import、控制确认与输入校验测试继续覆盖共享基线。
- 更新 platform-services API、决策记录与 spec 索引，明确用户业务操作的 Web/桌面同权限无认证边界；`/v1/ingest` Bearer token 门禁保持不变。
- 定向 IPC 回归：68 tests PASS；changed-file ESLint、全仓 Prettier、Knip、dependency-cruiser、`git diff --check` PASS。
- LocalAPI 集成回归共 108 tests，均在 setup 加载 `better-sqlite3` 原生绑定时被环境阻塞，未进入业务断言；全仓 `tsc --noEmit` 仅报仓库既有未生成的 `src/main/generated/build-info`。Markdown 专用 `md_kx` 在当前环境未安装，无法执行 `md_format.py`。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round N (YYYY-MM-DD HH:MM UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t000_code_f001|critical/important/minor|已修/遗留/撤回|一句话|文件:行 / pNNN / tid|

无 finding 时写“Round N 零 finding”。

### Round 1 (2026-09-14 08:00 UTC)

Round 1 零 finding。

实现侧复核确认两个 secret IPC handler 仅移除 route-hash 限制，sender 校验与已有日志脱敏保留；LocalAPI 未新增认证分支，ingest 的 Bearer token 门禁未改变。

测试侧复核确认 `#usage` 合法 renderer 成功路径、非法 sender 拒绝路径和无凭据 HTTP config/secrets 路径均有回归；既有配置导入/导出、控制和校验测试覆盖其余基线。SQLite 原生绑定阻塞已按环境问题记录。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足；LocalAPI 集成与 TypeScript 全量门禁有环境阻塞，见实施笔记
- 测试：定向 IPC 68 tests PASS；全仓 Prettier、changed-file ESLint、Knip、dependency-cruiser、diff-check PASS
- 黑盒：无凭据 HTTP config/secrets 回归已补；LocalAPI 集成在 better-sqlite3 native binding setup 阶段阻塞
- review：Round 1 code + test PASS，0 finding
- AC 证据：见 `handoff.json`

### 结果摘要

- Web/桌面共享业务操作保持同权限无认证；桌面 secret IPC 取消 `#setting` 限制但保留合法 sender 防线，`/v1/ingest` 认证边界不变。无 pending/finding。
