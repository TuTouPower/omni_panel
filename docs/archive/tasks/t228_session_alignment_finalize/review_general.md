# Task review t228（reviewer_focus: 通用）

- task：`t228_session_alignment_finalize`
- spec：`docs/tasks/t228_session_alignment_finalize/spec.md`
- diff_anchor：`f2d367c633f8852e45112fbda1ad11d02fc4a6f9`
- target：`git diff f2d367c633f8852e45112fbda1ad11d02fc4a6f9`
- round：1
- reviewed_at：2026-08-06 19:30 UTC+8

## 验证记录（reviewer 实跑）

- `MOCK_FIXTURE=synthetic pnpm exec playwright test tests/e2e/web/session_panel.spec.ts --config=playwright.config.ts --project=web`：**5 passed**（双页签状态保留 / 打开装槽渲染消息 / 槽满 toast / 摘选三格式复制 / 会话库闭环）。
- 全量 web e2e `MOCK_FIXTURE=synthetic`：**53 passed**（与 workspace.md / handoff.md 记录的 53 passed 一致，零回归）。
- `pnpm typecheck`：通过。
- `pnpm exec eslint`（web 桥 / 新 spec / playwright.config.ts）：0 error；`.mjs` 被 ignore 规则跳过（既有约定）。
- AC2 旧残留：`SessionHistoryView` / `HistoryOverflowModal` / `build_copy_markdown` 在 `src/` 下仅 `src/renderer/lib/session-history/layout.ts:5` 一条注释（"已随 SessionHistoryView 移除"），无源码残留，AC2 满足。
- 环境说明：本机 shell 带 `HTTP_PROXY` / `HTTPS_PROXY`。代理存在时 Playwright webServer 健康检查（Node 侧 honor proxy env）打到代理拿到 400，`reuseExistingServer: true` 误判「服务已可用」而不启动真实 vite preview，浏览器直连 127.0.0.1:5174 得 `ERR_CONNECTION_REFUSED`，5 用例全红；清掉代理 env（`unset HTTP_PROXY HTTPS_PROXY`）后 5 passed / 53 passed。此为环境交互问题，非本 diff 引入的代码缺陷（无代理的标准环境绿）。

## Findings

### t228_gen_f001 - 排序断言为 `toBeTruthy`，AC1「排序」子行为实际未验证

- 严重度：important
- 锚点：AC1「会话库搜索/筛选/排序/预览/并排打开闭环」
- 位置：`tests/e2e/web/session_panel.spec.ts:127-129`
- 问题：注释写明意图「排序：calls → 首卡为轮次最多会话」，但断言只有 `expect(first_title).toBeTruthy()`。若 `sort_sessions` 完全不排序（或排错序），该断言依然通过——首卡无论是什么会话，title 都非空。命中断言弱化危险模式（`toBeTruthy`，危险模式扫描命中项最低 important）。fixture 完全确定（s1 calls=12 最大、s7=11、s3=9），可做强断言而不会 flaky。
- 建议：改为断言首卡标题等于最高轮次会话，如 `await expect(page.locator(".lib-card-title").first()).toHaveText("登录页 bug 修复")`（或断言首卡 meta 含 "12 轮"），再补一个 `expect(first_title).not.toBe("")` 即可撤。

### t228_gen_f002 - 「已选状态保留」跨页签行为无断言，AC1 子行为缺测试

- 严重度：important
- 锚点：AC1「双页签切换后工作台槽位与已选状态保留」
- 位置：`tests/e2e/web/session_panel.spec.ts:28-45`
- 问题：测试名「双页签切换后工作台槽位与已选状态保留」，但正文只验证槽位保留（`data-loc-key` 前后一致），全程未产生任何「已选状态」（未勾选消息、未聚焦槽位、托盘无内容），因此「已选状态保留」这一 AC 子行为没有任何断言覆盖。属于 AC 点名行为缺测试。实际实现（`selection_store` 模块级、双页签均保持挂载）大概率行为正确，但 e2e 未验证。
- 建议：在切页签前先勾选一条消息（如 `.pane-msg-check`），切到会话库再切回工作台，断言该消息仍处于 selected（`selection-tray.expanded` 仍在、`.pane-msg-row.selected` 存在）。与 f001 一起补强即可闭环 AC1。

### t228_gen_f003 - web `recent` 的 `agent` 字段与 Electron 归一化不一致

- 严重度：minor
- 锚点：任务范围「web 会话桥实桥：recent 派生」
- 位置：`src/web/usageboard-web.ts:370-379`；对照 `src/main/core/session-history/subscription-service.ts:415-421`
- 问题：Electron `recent_sessions` 输出 `agent: row.source.replace(/_/g, "-")`（`claude_code` → `claude-code`）；web 桥 `recent` 直接 `agent: s.source`（保留下划线）。`SessionHistoryRecentItem.agent` 语义口径不一致。当前 renderer 无 `sessionHistory.recent` 消费者（`RecentSessionsModal` 走 `tokenStats.getSessions`），web e2e 也未触及，故不构成行为 bug，但后续若有消费者依赖 `agent` 口径会踩坑。
- 建议：对齐 Electron 归一化，改为 `agent: s.source.replace(/_/g, "-")`，或按任务.md 记录为有意差异。

## 结论

- 前轮 finding 复核：Round 1，无。
- 本轮新发现：3 条（important 2，minor 1）。
- 未进表的提示：
    - 代理 env 交互（见「验证记录」环境说明）：非本 diff 引入，但影响 proxied 环境可复现性；如 CI 配代理，需显式 `NO_PROXY=127.0.0.1,localhost`。
    - `tests/e2e/fixtures/synthetic.json` diff 整体从 4 空格重排为 2 空格（1794→2130 行），3860 行 diff 中绝大部分是重排噪音；数据变更本身仅 `GET /v1/sessions` 替换 + 9 条 `sessionHistory?id=` 注入。文件现由 `gen_synthetic.mjs`（`JSON.stringify(..., null, 2)`）确定性生成，非 bug，但审查噪声大。
    - `pnpm test:e2e:web` 裸命令不设 `MOCK_FIXTURE`，默认回退 `tests/e2e/fixtures/data/responses.json`（worktree 未提交），fresh checkout 下 session_panel 用例会失败；testing.md / workspace.md 已注明「本地与 CI 均须 MOCK_FIXTURE=synthetic」，但未烤进 package.json script，属文档已覆盖的既有限制。
- 总体判断：实现与 web 桥对齐正确，5 用例真实触达被测行为（剪贴板实读、toast 真触发工作台超位逻辑、fixture 自洽、web e2e 53 passed），AC2 旧残留清理确认、文档同步与实测一致。但 AC1 存在两处测试可信度缺口（排序弱断言、已选状态保留无断言），需补强后进入下一轮。
- 系统性 follow-up：无。

verdict: FAIL

## Round 2 (2026-08-06 11:11 UTC+8)

### 验证记录（reviewer 实跑）

- `unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy; MOCK_FIXTURE=synthetic pnpm exec playwright test tests/e2e/web/session_panel.spec.ts --config=playwright.config.ts --project=web`：**5 passed**（4.1s）。
- 全量 web e2e `MOCK_FIXTURE=synthetic`：**53 passed**（19.9s，与 round 1 及 workspace.md / handoff.md 记录一致，配置改 baseURL 127.0.0.1 后零回归）。
- `pnpm typecheck`：通过。`pnpm exec eslint src/web/usageboard-web.ts tests/e2e/web/session_panel.spec.ts playwright.config.ts`：0 error。
- 危险模式扫描：`tests/e2e/web/` 与 `tests/e2e/fixtures/test_web.ts` 无 `.skip` / `.only` / `.focus` / `.fixme` / `.fail`。

### 前轮 finding 复核

- **f001（important）已消除**：`tests/e2e/web/session_panel.spec.ts:134` 现为 `await expect(page.locator(".lib-card-title").first()).toHaveText("登录页 bug 修复")`，强断言。实证链：fixture（`tests/e2e/fixtures/synthetic.json`）s1 calls=12 为全量最大、title「登录页 bug 修复」；`src/renderer/lib/session-library/filter.ts:56` `sort_sessions` "calls" 分支 `b.calls - a.calls` 降序；`SessionLibrary.tsx:585` `.lib-card-title` 渲染 `s.title ?? s.id`。首卡若非 s1 断言必失败。实跑 5 passed 命中。
- **f002（important）已消除**：`tests/e2e/web/session_panel.spec.ts:38-41` 勾选 `.pane-msg-check` 后断言 `.selection-tray.expanded`（`SelectionTray.tsx:86`）与 `.pane-msg-row.selected`（`SessionPane.tsx:311`）可见；`:43-50` 切会话库再切回后复断言 loc_key 保留 + `.pane-msg-row.selected` + `.selection-tray.expanded` 均保留。已选状态真实产生并跨页签保留，AC1「双页签切换后已选状态保留」有实测覆盖。
- **f003（minor）已消除**：`src/web/usageboard-web.ts` `recent` 改为 `agent: s.source.replace(/_/g, "-")`，与 Electron `src/main/core/session-history/subscription-service.ts:421` `agent: row.source.replace(/_/g, "-")` 完全对齐。

### 修复过程新问题扫描

- 三处修复均为局部改动，未引入新状态、新依赖或新分支。f002 新增断言中 `expect(loc_key).toBeTruthy()`（`:48`）为 loc_key 非空守卫，非弱化断言（真正校验是 `:47` 的 `toBe(loc_key)` 等值比较），不触发危险模式。
- 修复后全量 web e2e 53 passed、typecheck/eslint 绿，无回归。
- 顺带核对：web 桥 `recent` `slice(0,20)` 未显式排序，但 fixture 顺序即 ended_at 降序（node 脚本验证 `fixture order matches ended_at desc: true`），与 Electron `recent_sessions` 排序口径一致，且无消费者，不构成差异。
- 配置改动（baseURL / webServer `--host 127.0.0.1`）属 round 1 既有实现，全量 53 passed 覆盖确认无回归。

### 结论

- 前轮 finding 复核：f001 已消除、f002 已消除、f003 已消除（均以 diff 代码 + 实跑结果为准，不采信 task.md 自述）。
- 本轮新发现：0 条。
- 未进表的提示：round 1 已记录的代理 env 交互（proxied 环境健康检查误判）仍属环境因素，非本 diff 代码缺陷；`pnpm test:e2e:web` 裸命令默认 fixture 回退的既有文档限制不变。
- 总体判断：三处 blocker/minor 均按建议修复并以强断言实跑验证，web e2e 5 passed / 全量 53 passed 零回归，AC2 旧残留仍无源码，文档同步一致；无未解决 critical / important。
- 系统性 follow-up：无。

verdict: PASS
