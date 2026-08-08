---
tid: "t263"
slug: "web_session_endpoint_fixes"
title: "web 会话端点修复：open 丢 loc + 全量枚举回退 + searchContent 取消"
status: "done"
branch: "t263_web_session_endpoint_fixes"
worktree: ""
review_level: "full"
diff_anchor: "bcff81e97e56dd5b93183c27d937f2d2c48d9b59"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

- 缺陷 1（open 丢 loc）根因：web shim `sessionHistory.open` 同步分发 onFocus + 切 hash；会话面板按路由懒挂载，订阅者晚于分发注册，目标丢失。`initial_loc()` 只读 URL `loc` query，web shim 从不写。修复：open 非空 loc 时 `history.replaceState` 写 `loc` 到 URL search（与桌面 route_query 同机制），面板挂载后 `initial_loc()` 读到。
- 缺陷 2（id-only 全量枚举）根因：`handle_session_history_query` 缺 source/env 时 `session_history_query_all_sessions` 全表分页找首个 id 匹配，开销线性且多来源同 id 歧义。修复：缺 source/env 直接 400。web query 恒透传 source/env（t259），无 id-only 调用方（已核实）。
- 缺陷 3（web 搜索取消）根因：渲染层 AbortController 仅本地作废不传请求；web shim fetch 不可取消；服务端搜索不接中止。修复三层：渲染层 `searchContent` 传 `controller.signal`；web shim 透传 signal 到 fetch（post_json 加 signal）；服务端 handler 监听 `res.on("close")`（未正常 writableEnded 时 abort）+ 优先调 `searchContentWithAbort`（IPC 层同款包装）。
- 接口重载坑：`UsageboardApi.searchContent` 重载第二参在 legacy 形态为 keyword、现代形态为 AbortSignal。web shim 单实现签名 `(request_or_locs, keyword?, signal?)` 会把现代调用的 signal 落到 keyword 位置 → 需按 `is_legacy` 分支区分参数语义；preload 实现同样处理（第二参联合类型，桌面忽略 signal）。
- 测试：web shim 单测 3 新增（open 写 loc / 空 loc 不写 / searchContent 透传 signal）；SessionLibrary 断言 signal 传入；集成测试改 id-only→400 + 新增断连 abort（fetch abort → res close → signal.aborted）；补跨面板打开 e2e（`#usage` 下 open → history 定位 s1）。
- web e2e 环境：首次 9 失败因 5174 preview 未就绪（reuseExistingServer 复用失效端口），手动起 preview 后正常；跨面板测试最初用 `.usage-view` 类名（PopupView 实为 `[data-popup="live"]`）已修正。
- 既有 e2e 失败确认：搜索闭环（`9 个会话` 统计）与 virtual list 三例在 t263 主仓基线同样失败，非本 task 引入，登记 p090。

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

### Round 1 (2026-08-08 14:35 UTC+8)

| finding_id     | severity        | status | rationale                                                                                                          | fix_ref                         |
| -------------- | --------------- | ------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| t263_code_f001 | minor           | 已修   | initial_loc 读取后从 URL 清除 loc（一次性语义）                                                                    | workspace-view-helpers.ts:40-44 |
| t263_code_f002 | minor           | 已修   | web shim query 注释同步 400 行为                                                                                   | usageboard-web.ts:408-409       |
| t263_code_f003 | minor           | 已修   | 去掉鸭子类型，直调 searchContentWithAbort                                                                          | server.ts:362-368               |
| t263_test_f001 | important→minor | 遗留   | reviewer Round 2 复核接线已有单测两端覆盖，前提错误降级 minor；残余「e2e 走真实行点击」依赖 dashboard fixture 缺口 | p090                            |
| t263_test_f002 | minor           | 已修   | 新增渲染层 abort 用例（前序 signal.aborted）                                                                       | SessionLibrary.test.tsx         |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1（跨面板打开定位）：web shim `open` 非空 loc 编码进 URL search（一次性，面板挂载后 `initial_loc` 读取并清除）；web e2e「用量面板跨面板打开会话定位到目标会话」实测通过（slot `data-loc-key=claude_code|win|s1`）。
    - AC2（互跳不回归 + 桌面不回归）：open 空 loc 不写 URL（单测）；桌面 route_query 路径未改动（`initial_loc` 仍读 URL loc，桌面自带 loc query）；desktop 相关单测全过。
    - AC3（query 缺 source/env 不枚举）：`handle_session_history_query` 缺 source/env 直接 400，移除 `session_history_query_all_sessions` 反查；集成测试断言 400 + provider 不调用；带完整参数查询 200 保留。
    - AC4（搜索全链路取消）：渲染层 `searchContent` 传 `controller.signal` → web shim 透传 fetch → 服务端 `res close` 断连 abort + `searchContentWithAbort`；集成测试断言断连后 signal.aborted；渲染层新用例断言前序 signal.aborted。
    - AC5（测试全过）：全量 `pnpm test` 2653 passed / 1 skipped；web e2e 跨面板用例通过（既有 4 失败登记 p090，非本 task 引入）。

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：FAIL（f001 important）
- Round 2 test：PASS（f001 经复核降级 minor，接线经单测两端覆盖）

### 结果摘要

- web 端三个会话缺陷修复：跨面板 open 把 loc 编码进 URL 一次性定位；query 缺 source/env 改 400 移除全量枚举；内容搜索全链路取消（渲染 signal → web shim fetch → 服务端断连 abort）。接线验证走单测，loc 链路走 e2e。
