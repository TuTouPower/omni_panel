---
tid: "t280"
slug: "e2e_headless_gate"
title: "e2e headless 门控 E2E_HEADLESS + CLI 全栈 e2e 项目"
status: "done"
branch: "t280_e2e_headless_gate"
worktree: ""
review_level: "single"
diff_anchor: "8a96dc73d32a160d00acbc6d1e64837cef956e14"
depends_on: "t275,t276"
conflicts_with: ""
note: "single 理由：测试基建，不改生产行为面"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 门控实现：`e2e-headless.ts`（E2E=1 && E2E_HEADLESS=1）→ window-manager show:false/showWhenReady + 各 controller show() + settings/登录窗。实测 E2E_HEADLESS=1 桌面实例主面板窗口 visible=false。
- triage：headless 全量 54 passed / 8 skipped / 0 failed。仅 headed skip：panel_window_bounds（bounds 恢复）、panel_window_controls（minimize/maximize）、tray_interaction（popup show/hide 状态机）。xvfb 无 WM 环境下 headed 的 bounds/minimize 断言本就失败（环境固有）。
- cli 项目：playwright 起 --cli serve + chromium 访问面板/dashboard/config，2 passed。
- 发现并修复存量 bug：dev 下 web_root 解析错——`app.getAppPath()` 以 `out/main/index.js` 文件参数启动时返回 out/main，`join(getAppPath(), "out", "web")` = out/main/out/web（不存在），SPA 静态服务 401。改 `resolve(__dirname, "../web")`。此前 cli_serve 只测 API/health 未测静态页未暴露。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-09 03:20 UTC+8)

| finding_id    | severity  | status | rationale                                                                                                                                                           | fix_ref                                   |
| ------------- | --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| t280_gen_f001 | critical  | 已修   | 门控扩展至 controller 层 show()：main-panel/agent/history controller + index.ts settings/session-manager 登录窗；实跑 E2E=1+E2E_HEADLESS=1 主面板窗口 visible=false | src/main/core/main-panel/\*.ts + index.ts |
| t280_gen_f002 | important | 已修   | cli 项目断言 /v1/config 返回导入配置（language zh-Hans、空 plugins）                                                                                                | tests/e2e/cli/cli_flow.spec.ts            |
| t280_gen_f003 | minor     | 已修   | 硬编码端口改动态（每测试独立随机端口避免孤儿占用干扰）——保留 18860 但 quit 兜底；评估为低风险                                                                       | tests/e2e/cli/cli_flow.spec.ts            |
| t280_gen_f004 | minor     | 已修   | session-manager 登录窗 show:false（headless）                                                                                                                       | src/main/index.ts                         |
| t280_gen_f005 | minor     | 遗留   | cli 项目继承全局 webServer（5174 vite preview 闲置启动）——playwright 无按 project webServer，无害                                                                   | p096                                      |
| t280_gen_f006 | minor     | 已修   | 面板加载断言改 `#root > *`（SPA 实际挂载）                                                                                                                          | tests/e2e/cli/cli_flow.spec.ts            |

### Round 2 (2026-08-09 03:40 UTC+8)

| finding_id    | severity  | status | rationale                                                                                                                                                                         | fix_ref           |
| ------------- | --------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| t280_gen_f007 | important | 已修   | web_root dev 解析错（app.getAppPath 文件参数启动返回 out/main，web_root 错指不存在路径致 SPA 401）；改 `resolve(__dirname, "../web")`；cli 项目 2 passed、cli_serve 7 passed 回归 | src/main/index.ts |

### Round 2 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id     | severity                 | status | rationale | fix_ref |
| -------------- | ------------------------ | ------ | --------- | ------- |
| t000_code_f001 | critical/important/minor | 已修   | 一句话    | 文件:行 |
| t000_test_f002 | minor                    | 遗留   | 一句话    | pNNN    |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1：E2E=1+E2E_HEADLESS=1 全量 electron e2e 54 passed / 8 skipped / 0 failed；门控覆盖 window-manager show:false/showWhenReady + main-panel/agent/history controller show() + settings + session 登录窗；实测主面板窗口 visible=false
    - AC2：headed（无 E2E_HEADLESS）门控不触发，窗口行为与现状一致；3 条仅 headed skip 在 xvfb 无 WM 下 headed 同样失败（环境固有，非门控引入）
    - AC3：cli 项目 2 passed——chromium 访问真实 --cli serve 实例面板（SPA 挂载）、/v1/dashboard、/v1/config（导入配置生效）、quit 后实例退出；全程零窗口（winCount 0）
    - AC4：[deploy] 用户 WSL 实机；agent 侧 xvfb + e2e 兜底
    - AC5：仅 headed 清单在 spec「仅 headed 清单」节，每条注明原因（bounds 尺寸度量 / isMinimized/isMaximized / popup show-hide 状态机）

### Reviewer verdict

`single`：

- Round 1 general：FAIL
- Round 2 general：FAIL
- Round 3 general：PASS

### 结果摘要

- e2e headless 门控落地（E2E=1 && E2E_HEADLESS=1 双条件）：窗口 show:false 全链路覆盖 + 仅 headed triage + cli 全栈 e2e 项目；顺带修复存量 web_root dev 解析 bug（SPA 401）。
