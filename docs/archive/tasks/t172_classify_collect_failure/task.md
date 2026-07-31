---
tid: "t172"
slug: "classify_collect_failure"
title: "采集失败区分凭证失效：重新登录按钮门控 + OAuth 401 即时刷新兜底"
status: "done"
branch: "t172_classify_collect_failure"
worktree: ""
review_level: "full"
diff_anchor: "82b0db63138940357918ff5de4eeaaffc792fd36"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### Step 1：SPIKE（s004）

- 核实 `net-client` HTTP 错误文案为 `HTTP <status>: request failed (<bytes> bytes)`；renderer `is_auth_error` 不匹配裸 401/403（bug 根因之一），调度层已匹配。
- 核实 refresh-service 与 grok/kimi OAuth manager 无现成依赖注入通道；main/index.ts 先建 manager 后建 refresh-service，可注入。
- 关键发现（d003）：Grok/Kimi script 的 401 走 `failed_accounts` 结果路径而非 throw 路径，即时刷新兜底必须覆盖该路径。
- 两份 UNVERIFIED-SPIKE 已闭环，spec 上下文区改写结论，preflight --require-verified PASS。

### Step 2/3：实现

- `src/shared/lib/auth-error.ts`：抽取唯一 `is_auth_error` 判定口径，合并调度层 401/403/invalid\_\* 与渲染层中文凭证词，去掉裸 token/auth 子串防误报（A11）。
- `refresh-service.ts`：新增 `oauth_refresh` deps；run_connector 返回后对 `failed_accounts` 含 auth 错误且 manifest auth.method=oauth_device 的连接器即时刷新一次并重试；catch 抛错路径同款兜底；每轮至多一次（`oauth_refresh_done` 布尔）。
- `ProviderAccountRow.tsx`：`show_relogin_button` 加 `is_auth_error(_error)` 门控。
- `main/index.ts`：按 provider 接线 grok/kimi manager 的 `refresh_now` 到 `oauth_refresh`。
- 测试：`tests/unit/shared/auth-error.test.ts`（真实文案分类 + 防误报）；refresh-service 单测 3 场景（刷新成功重试、刷新失败退化、每轮至多一次）+ t155 非 oauth 不触发回归；ProviderAccountRow 加 401 显示 / 超时不显示两用例。
- 红→绿确认：4 个新用例先红后绿。

### 门禁

- `pnpm test`：1933 passed / 1 skipped（185 files）。
- typecheck / lint / arch / 生产构建均过。worktree 首次 build 需 `mkdir src/generated`（build-info.ts 由 gen-build-info 生成，gitignore）。
- format:check 全局红为主仓既有 archive 文件基线问题（主仓同样红，30 个 docs/archive 文件）；本次改动文件 prettier 通过。
- deadcode 报 3 个 unused files（AuthPlaceholder/useGrokDeviceLogin/useKimiDeviceLogin），主仓同样报——既有基线，非本 task 引入。

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

### Round 1 (2026-07-31 22:00 UTC+8)

Round 1 code PASS / test PASS，5 条 minor（code f001-f003、test f001-f002）均已在审阅后修复并经全量测试验证；全部 `已修`。

| finding_id     | severity | status | rationale                                                          | fix_ref                                          |
| -------------- | -------- | ------ | ------------------------------------------------------------------ | ------------------------------------------------ |
| t172_code_f001 | minor    | 已修   | 最后尝试轮刷新成功无预算重试：刷新成功时 max_attempts+1 补一次重试 | src/main/core/scheduler/refresh-service.ts:279   |
| t172_code_f002 | minor    | 已修   | 补 throw 路径（tier-1 poll 401）即时刷新正向用例                   | tests/unit/scheduler/refresh-service.test.ts:377 |
| t172_code_f003 | minor    | 已修   | 两处刷新块抽为 `try_oauth_refresh` 局部函数去重                    | src/main/core/scheduler/refresh-service.ts:261   |
| t172_test_f001 | minor    | 已修   | AC3 刷新失败补 stale 断言（预置历史观测）                          | tests/unit/scheduler/refresh-service.test.ts:288 |
| t172_test_f002 | minor    | 已修   | 同 code_f002，throw 路径正向用例                                   | tests/unit/scheduler/refresh-service.test.ts:377 |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1：`tests/unit/renderer/components/provider_account_row.test.tsx` 新增 401 显示 / ETIMEDOUT 不显示两用例；`tests/unit/shared/auth-error.test.ts` 覆盖真实 `HTTP 401: request failed (...)` 文案与超时/5xx 负例。
    - AC2：`tests/unit/scheduler/refresh-service.test.ts` failed_accounts 与 throw 两路径刷新成功→重试→ready；末轮刷新成功边界用例。
    - AC3：刷新失败（无历史→failed；有历史→stale 副本 + last_error）；每轮至多一次即时刷新。
    - 全量 `pnpm test` 1936 passed / 1 skipped；typecheck / lint / arch / 生产构建通过。

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：PASS

### 结果摘要

采集失败按凭证失效分类：账号行重新登录按钮只对 auth 类错误显示；OAuth 连接器 401/403 即时刷新兜底，每轮至多一次。
