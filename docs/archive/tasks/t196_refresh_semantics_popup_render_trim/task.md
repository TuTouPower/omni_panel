---
tid: "t196"
slug: "refresh_semantics_popup_render_trim"
title: "手动刷新语义与 popup 渲染瘦身"
status: "done"
branch: "t196_refresh_semantics_popup_render_trim"
worktree: ""
review_level: "full"
diff_anchor: "9d32603c0c4e4d09d681e8068567157781a5362e"
depends_on: ""
conflicts_with: ""
note: "P3+P4+P5"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### AC1 手动刷新立即 ack

- `handleConnectorRefresh` / `handleConnectorRefreshAll` 改 fire-and-forget：`void refreshService.refresh(...).catch(log)` 后立即 `return ok(undefined)`。`refreshAll` 变同步函数，`logged` 包装处补 `Promise.resolve`。
- loading 由既有链路驱动：refresh-service 入口同步置 runtime-store `status: "loading"` → EVENT_STATE_CHANGE 推送 → use_plugins 快照更新 → ProviderCard 显示加载态。`2026-06-15-refresh-spinner` spec 不存在（finalization 标注「若存在」），无契约可破坏；spinner 由真实 pending 驱动不受影响。

### AC2 per-instance 锁短路

- 既有 `is_locked` / `locks` / `LOCK_TIMEOUT_MS` 已覆盖手动+定时并发；本 task 未改，补 2 个回归测试（在途短路 + 完成后释放）。

### AC3 测高单镜像

- 去掉 collapsed 镜像树，仅保留 content 镜像。`collapsed_min_height` 改为缓存：结构签名 + activeTab 变化时，临时把单镜像强制折叠渲染（layout effect 内同步完成，浏览器不绘制中间态）读取 offsetHeight 缓存，随后恢复。
- 为何不选 CSS 强制折叠估算：多级折叠（ProviderCard 账号行 / ProviderAccountRow / UpcomingReset）非全部是 `.card > :not(.card-head)`，CSS 逐类隐藏脆弱，易漏导致截断。复用 `render_body(false, true)` 强制折叠渲染路径与旧 collapsed 镜像完全一致，报高逐像素相同（by construction）。
- 边角：`structural_signature` 不含 activeTab，故 measure key = signature + "|" + activeTab。NetBanner/卡片头部文本高度变化不触发重测——content_height 同步变化时 floor 不绑定，可接受。
- `use_popup_height_report` 增 `measuring` 参数：测量中不报高，避免把 collapsed 高度当 content 报；measure 结束 effect 重订阅即报正确值。

### AC4 快照相等性短路

- `snapshot_equal` 去 JSON.stringify：结构性字段（items/error/badge/chart）按引用，updatedAt 值比较。`plugin_list_equal` 逐字段 + snapshot_equal。
- 语义变化（有意）：items/chart 新引用视为变化（原深比较可能漏判引用级更新），测试同步改为断言新引用触发更新。

### AC5 trend 批量 IPC

- 新 channel `TREND_GET_BULK`，主侧逐周期 `query_trend_series` + `build_trend_series`，preload/web 接线，`ProviderAccountRow` 展开一次 getBulk 取全部周期，失败不缓存、展开空态占位。

### Round 1 review 处置

- code（PASS，4 minor）：f001/f002/f003/f004 全按 reviewer 建议修；f003 绑定真实 pending 用 pre-loading 排除法（点击前已 loading 的实例不钉死全局 spinner，web e2e 里 fixture 有 2 个常驻 loading connector 已验证）。
- test（FAIL→待 Round 2 复核）：f001 补 `tests/unit/ipc/trend-ipc.test.ts`（主侧 getBulk handler 契约）；f002 补 `provider_account_row` N>1 多周期单 bulk 测试；f003 改名过时测试标题。

### Round 2 处置表

| finding_id     | severity  | status | rationale                                                                         | fix_ref                       |
| -------------- | --------- | ------ | --------------------------------------------------------------------------------- | ----------------------------- |
| t196_code_f001 | minor     | 已修   | metadata 改内容比较，t153 reload 优化恢复                                         | use-plugins.ts:48-51          |
| t196_code_f002 | minor     | 已修   | 补 supportedProviders/activeProviders 数组比较                                    | use-plugins.ts:53-61,78-79    |
| t196_code_f003 | minor     | 已修   | spinner 绑定快照 loading，pre-loading 排除法                                      | PopupView.tsx:375-500         |
| t196_code_f004 | minor     | 已修   | fire-and-forget catch 补 failed 推送                                              | connector-ipc.ts:199-205      |
| t196_code_f005 | minor     | 已修   | 定时器改自排程周期求值，60s 兜底真正时间驱动                                      | PopupView.tsx:473-507         |
| t196_test_f001 | important | 已修   | 补主侧 TREND_GET_BULK handler 契约测试                                            | trend-ipc.test.ts             |
| t196_test_f002 | minor     | 已修   | 补 N>1 多周期单 bulk 测试                                                         | provider_account_row.test.tsx |
| t196_test_f003 | minor     | 已修   | 改名过时测试标题                                                                  | use_plugins.test.ts:191,368   |
| t196_test_f004 | important | 已修   | spinner 测试 instanceId 改 gateway-connector + macrotask rAF stub + 异步 act 冲洗 | popup_view_height.test.tsx    |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC1（connector-ipc 立即 ack 测试 + spinner 绑定 loading）、AC2（refresh-service 锁短路 2 测）、AC3（popup_view_height/mirror 单镜像 + 测高缓存测试）、AC4（use_plugins 引用短路测试）、AC5（trend-ipc 主侧契约 + provider_account_row N>1 单 bulk 测试）；web e2e 48/48、electron e2e 11 失败与 p038 登记一致。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS
- Round 1 test：FAIL
- Round 2 code：PASS
- Round 2 test：FAIL
- Round 3 code：PASS
- Round 3 test：PASS

### 结果摘要

- t196 全 AC 实现与测试齐备，5 轮 review 处置后 code/test 均 PASS（Round 3），可 finish。

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
- 结果：全部满足 / 未满足
- 证据：测试、黑盒或人工检查结果；按需引用 AC 编号，不复制 AC 正文

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL

`single`：

- Round 1 general：PASS / FAIL

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 一句话；无额外说明可写「见上」
