---
tid: "t276"
slug: "cli_control_commands"
title: "CLI 控制子命令 + local-api 控制端点"
status: "done"
branch: "t276_cli_control_commands"
worktree: ""
review_level: "single"
diff_anchor: "5d897672b51cfa356cd7e2bbf5a91e546c1cab6a"
depends_on: "t275"
conflicts_with: ""
note: "tray 纯 main 动作 CLI 化；single 理由：本地进程控制，无鉴权/资金/迁移面"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 环境：worktree 复用 t275 的 electron 解压经验（缓存 zip python 解压 + printf path.txt + chmod）；ABI 在 build（electron）与 vitest（node）间切换。
- 实现：`src/main/cli/client.ts` 瘦客户端（实例发现 cli.json/--port 覆盖、post_control、open 调浏览器、autostart Linux unsupported）；local-api 新增 `control_deps` + `/v1/control/*` 端点（refresh-all/pause/resume/restart/quit，免认证）；index.ts whenReady 早期分支执行控制命令后 app.exit。
- SPIKE 1（restart argv 保持）：实跑验证通过——restart 后旧进程退、新进程以相同 argv 重启（cli.json pid 更新、端口复用）。
- SPIKE 2（同一二进制区分）：瘦客户端必须跳过单实例锁——serve 与瘦客户端同 userData 时共享锁域，瘦客户端持锁会自锁无法连自身。实测未跳锁时 refresh-all 卡死；跳过锁后正常连接。
- 踩坑：`app.exit(0)` 在 whenReady 内进程立即退出，Playwright `electron.launch` 会在进程退出时 reject——瘦客户端 e2e 需用非 launch 方式或容忍退出。单测用注入 deps 覆盖，不依赖真进程。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-09 01:40 UTC+8)

| finding_id    | severity  | status | rationale                                                                                 | fix_ref                                 |
| ------------- | --------- | ------ | ----------------------------------------------------------------------------------------- | --------------------------------------- |
| t276_gen_f001 | important | 已修   | e2e 补 AC7 桌面实例被控：OMNI_PANEL_PORT 固定端口，瘦客户端 --port 连桌面实例 refresh-all | tests/e2e/electron/cli_control.spec.ts  |
| t276_gen_f002 | important | 已修   | e2e 补 AC1 实例侧观察：SSE /v1/events 订阅断言 refresh-all 后收到状态事件                 | tests/e2e/electron/cli_control.spec.ts  |
| t276_gen_f003 | minor     | 已修   | control_deps.refresh_all 挂 .catch 记日志（对齐 tray 路径）                               | src/main/index.ts                       |
| t276_gen_f004 | minor     | 已修   | 错误已走 stderr（AC6 e2e 断言文案）；单测补 stderr 文案断言                               | src/main/cli/client.ts + client.test.ts |

### Round 2 (2026-08-09 01:55 UTC+8)

| finding_id    | severity | status | rationale                                           | fix_ref |
| ------------- | -------- | ------ | --------------------------------------------------- | ------- |
| t276_gen_f005 | minor    | 遗留   | restart e2e 泄漏 relaunch 进程，孤儿进程跨 run 堆积 | p095    |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1/AC2/AC3/AC7：e2e `--cli serve` 起真实例后瘦客户端 refresh-all/pause/resume/restart/quit，实例侧可观察——refresh-all 经 `/v1/events` SSE 收到状态事件、restart 后 cli.json pid 更新 + 新端口 health 200、quit 后实例不可达；桌面实例（E2E=1 + `OMNI_PANEL_PORT`）同样可被控制（cli_control.spec.ts 8 passed）
    - AC4：`open` 输出面板 URL 且退出码正常；WSL 下尝试 wslview（失败仅提示）
    - AC5：`autostart` Linux 返回 unsupported 无副作用；Windows 走 setLoginItemSettings
    - AC6：实例未运行时控制命令「实例未运行」可读错误 + 非零退出码（单测 + e2e）
    - 单测 46 passed（args 控制命令、client 实例发现/控制、import-config 回归）、server 集成 43 passed（控制端点 POST 200/GET 405/未配置 401）
    - 桌面版回归：suspend_resume/main_panel_window_modes 4 passed；cli_serve 回归 7 passed

### Reviewer verdict

`single`：

- Round 1 general：FAIL
- Round 2 general：PASS

### 结果摘要

- CLI 控制子命令落地：瘦客户端（cli.json/--port 发现）+ local-api `/v1/control/*` 端点 + 单实例锁跳过；tray 纯 main 动作 CLI 化，桌面与 CLI 同一状态面。

### 结果摘要

- 一句话；无额外说明可写「见上」
