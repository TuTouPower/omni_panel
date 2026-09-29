---
tid: "t535"
slug: "flowercloud_background_first_refresh"
title: "花云后台刷新的后台优先策略与采集窗口可见性"
status: "done"
branch: "t535_flowercloud_background_first_refresh"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "56c01c1be881a2e834248aa11ad849d1b2a70ec3"
depends_on: ""
conflicts_with: ""
note: "来源: p269 + p268"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

### 前置实验（s040）

- spec 的两条 `UNVERIFIED-SPIKE` 在实施前由 **s040 spike** 结论回填（`docs/spikes/s040_flowercloud_challenge_probe/`、`docs/findings/d063`，已在主仓提交 `56c01c1b`，即本 task 的 diff_anchor）：
    1. `show:false` 窗口的页面 `document.hidden === false`，Cloudflare 脚本照常执行 → `present_for_capture` 不是脚本运行的前提；
    2. Turnstile 控件在跨域 iframe / 不可遍历 shadow DOM 内，主文档无可点击目标 → 关闭「自动点击验证控件」分支；
    3. `reveal()`（`show()` + 聚焦）会把托管式挑战（「正在验证…」）升级为交互挑战（「请验证您是真人」+ 复选框）并抢焦点（`isFocused() === true`）。
- 剩余外部条件（托管挑战能否最终自动通过）写入 spec「风险与回退」，不作为 AC 或未知契约阻塞项。

### 实现

- `flowercloud_dom.ts`：删除 `FLOWER_REVEAL_AFTER_MS` / `FLOWER_REVEAL_BUDGET_MS` / `FLOWER_HANDOVER_WAIT_MS`、`reveal` / `present_for_capture` 调用与 `handed_over` 语义；`poll_flower_usage_html` 只做隐藏窗轮询；新增 `flower_failure_reason(kind)` 把页面分类翻译为可读原因。
- `session-types.ts`：`SessionWindow` 去掉 `present_for_capture` / `reveal`；`FlowercloudSnapshotOptions` 去掉 reveal/handover 选项；新增 `FlowercloudSnapshotResult { ok, reason? }`。
- `session-manager.ts`：`refresh_flowercloud_snapshot` 返回 `FlowercloudSnapshotResult`；成功/失败/超时/取消一律在 `finally` 关窗并释放 `in_progress` + `flower_snapshots`；取消路径用 `flower_failure_reason("cancelled")` 表达原因。
- `refresh-service.ts`：`refresh_web_session` 返回 `{ ok, reason? }`；抓取失败（返回 `ok:false` 或抛异常）时把实例置 `failed` 并写入原因（保留 `lastSuccess`）后直接结束本轮，**不再调用连接器重放旧 HTML**。
- `index.ts`：`refresh_web_session` 透传结果；删除已无调用者的 `present_for_capture` / `reveal` 窗口方法，保留 `read_page_hint` 供失败日志使用。

### 决策

- 抓取失败即 `failed`（而非继续跑连接器输出 stale 观测）：AC-004 要求失败原因可见，而 `ConnectorSnapshotState` 的 `ready` 分支没有 error 字段；走 `failed` + `lastSuccess` 能同时满足「保留上次成功数据」与「给出原因」，也避免浪费连接器预算重放旧 HTML。
- 不实现自动点击：无 DOM 可点击目标（d063），实现只会是死代码。

### 验证

- `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm arch`、`pnpm deadcode`：通过（实施期与收尾前各跑一次）。
- `pnpm test`（worktree，pnpm 11.26.0 + hoisted）：**4217 passed / 8 skipped（340 files）**。
- 新增/改写测试：`session-manager.test.ts` 用 `{ok, reason}` 断言替换布尔断言，删除 reveal/handover 语义用例，新增「遇阻不前台化并给出人机验证原因」「登录页给出重新登录原因」「预算耗尽即关窗并释放登记、下一轮可再抓且无残留窗口」；`refresh-service.test.ts` 把「抓取失败仍跑连接器」改为「抓取失败标记 failed 且不跑连接器」，并新增抛异常同语义用例。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-29T22:23:00+08:00)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t535_code_f001|important|已修|抓取失败分支早退，绕过 `invariant 2` 的 stale 降级，AC-004 只落地一半（运行时 failed+error 有，`Observation.stale`/`last_error` 没有）|src/main/core/scheduler/refresh-service.ts（抽出 `mark_observations_stale`）|
|t535_code_f002|minor|已修|`flower_needs_user` 删 reveal 后全仓零引用|src/main/core/session/flowercloud_dom.ts|
|t535_code_f003|minor|已修|spec 称新鲜期跳过「不开窗」，实现仍先建隐藏窗再判定|docs/specs/flowercloud_usage.md:20|
|t535_test_f001|important|已修|与 code_f001 同一缺陷：抓取失败既未降级观测也未断言|tests/unit/scheduler/refresh-service.test.ts、tests/integration/scheduler/refresh-service.test.ts|
|t535_test_f002|minor|已修|「不前台化」缺负向守卫；`flowercloud_dom.test.ts` 残留死脚手架|tests/unit/session/flowercloud_dom.test.ts|
|t535_test_f003|minor|已修|`flower_failure_reason` 分支无直接单测；blocked 只验 mock 字符串透传|tests/unit/session/flowercloud_dom.test.ts|

### Round 3 (2026-09-29T22:35:00+08:00)

Round 3 为定向复核（新增 `network` 失败分类 + spec §5 测试落点补齐）：两侧 PASS，各出 1 条同源 minor。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t535_code_f004|minor|已修|catch 归因过宽：同 try 内 vault / session 读写异常也被报成「网络或超时」|src/main/core/session/flowercloud_dom.ts|
|t535_test_f004|minor|已修|catch 未判取消：交互登录抢占关窗时 `executeJavaScript` reject 被报成网络失败|src/main/core/session/flowercloud_dom.ts、tests/unit/session/flowercloud_dom.test.ts|

### Round 4 (2026-09-29T22:39:00+08:00)

Round 4 为 f004 修复的定点复核：两侧 PASS，零新 finding（`catch` 内先判 `is_cancelled()` → `cancelled`；`network` 文案改为不主张具体原因；新增「会话在抓取中被拆毁 → 取消原因」用例）。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：AC-001~AC-006 满足；AC-007 为 `[deploy]`（macOS 真机人工核验），本轮不声称自动通过
- 测试：`pnpm test` 全量 339 passed | 1 skipped（340 files），**4234 passed / 8 skipped**；`pnpm typecheck` / `pnpm lint` / `pnpm format:check` / `pnpm arch` / `pnpm deadcode` 全绿
- 黑盒：s040 真实站点探针（`docs/spikes/s040_flowercloud_challenge_probe/`）作为 AC-007 的程序化证据——隐藏窗 `document.hidden === false` 且 Cloudflare 脚本执行、`reveal` 前后挑战形态变化（「正在验证…」→「请验证您是真人」）、窗口 `isVisible` / `getOpacity` / `isFocused` 实测；Mission Control 目视项按 spec 声明留待真机核验
- review：full 级。`review_code.md`：Round 1 FAIL（3 finding）→ Round 2 PASS → Round 3 PASS（f004）→ Round 4 PASS（零 finding）；`review_test.md` 同轨迹
- AC 证据：见 `handoff.json`

### 结果摘要

- 实现：抓取窗改为全程隐藏（移除 `present_for_capture` / `reveal`）、成功/失败/超时/取消一律关窗并释放登记、抓取失败在调度层标记 `failed` 并写可读原因（不再重放旧 HTML），并沿用同一条 stale 降级路径保证 UI 的「数据过期」标记与原因同时可见。
- 决策依据：s040 实测（`docs/findings/d063`）——隐藏窗已能执行 Cloudflare 脚本，`show()` + 聚焦反而把托管式挑战升级为人工挑战并抢焦点；ADR 044。
- 遗留（均非 blocking，reviewer 判定不阻断）：AC-007 macOS 真机目视核验（`[deploy]`）；`catch` 取消分支在判定前先 `log.warn`（日志卫生，可后移或降为 info）；reviewer 记录的 pre-existing 观察不在本 task 范围（force 刷新与在途 `skip_if_fresh` join、`failed` + `lastSuccess` 的过期展示依赖 ready/hydrate、`index.ts` 宿主窗口层无负向断言）。
