---
tid: "t490"
slug: "settings_data_import_export_unify"
title: "设置页数据导入导出桌面端与Web端一致性对齐"
status: "done"
branch: "t490_settings_data_import_export_unify"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "ee2f89584d260f3757382455ff51068a9ee79ea9"
depends_on: ""
conflicts_with: ""
note: "来源 p234；统一两端数据导出明文密钥选项、文案、IPC透传及导入端点校验"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

- 接手说明：attempt 1（execution_id `09e2a210…`，2026-09-15 22:19 起）由上一会话实施到一半中断——无执行 commit，仅遗留未跟踪的 `tests/unit/renderer/views/settings_view_data.test.tsx`（AC-001/002 渲染层用例，本轮沿用并补强）。已在主仓按 `terminal stopped` + `report blocked(infra)` 收口，本 attempt（2，`b87229c9…`）接续实施。
- 实现：①`SettingsView.tsx` 删除 `web_mode` 分支与 `show_secret_option` 传参（变量与 `is_web` 导入随之成为死代码一并移除），导出统一传 `{ includeSecrets }`；②`data_section.tsx` 去掉 `show_secret_option` 维度，副标题固定「导出配置；默认不含明文密钥」，复选框与红色警告两端一致；③`preload/index.ts` 的 `config.export` 透传 `options ?? null`；④`config-ipc.ts` 的 `handleConfigExport(deps, options)` 按 `options.includeSecrets === true` 决定是否写 secrets（默认不含），IPC handler 只接受对象形态并显式取布尔；⑤删除 `handleConfigImportData` 的 `allowEndpointOverrides` 选项与其两处拦截（唯一生产调用方 LocalAPI 不再传 `false`，选项成死代码），`/v1/config/import` 与桌面端同行为。
- 旧测试语义失效处置（按「禁止就地改预期」）：`config-ipc.test.ts` 原「handleConfigExport writes canonical v2 JSON with plaintext secrets」断言的是本 task 要消除的「桌面导出强制含密钥」，整体替换为「默认不含 secrets」+「includeSecrets 时含 secrets」两条；`local-api/server.test.ts` 原「web import rejects endpoint overrides…」断言的是被移除的单向拦截，整体删除并新增「import accepts endpoint overrides over HTTP like the desktop path」。
- 黑盒：`pnpm build` 通过；真实应用（`electron out/main/index.js serve`）实测——`GET /v1/config/export` 默认无 `secrets` 字段、`?includeSecrets=true` 带 `secrets`；`POST /v1/config/import` 提交含 `endpointOverrides` 的 canonical v2 文档返回 `{"imported":true}` 且 override 落到磁盘 `config.json`。
- 环境说明（本机 agent 会话）：shell 导出了 `NODE_ENV=production`，React 会走生产构建（无 `React.act`），renderer 项目会整体报 `React.act is not a function`；renderer 用例需 `NODE_ENV=test` 运行（已实测 216 例通过）。node 项目跑前需 `node scripts/ensure_sqlite_abi.mjs node`（本机 node_modules 与主仓共享，ABI 会被上一步 electron 运行改掉）。
- 既有红灯（与本 task 无关，已在 base 复现）：`local-api server.test.ts > export returns canonical config…`（根因与修法见 `docs/pending/todo/p237_local_api_config_export_test_red.md`）；`tests/unit/ipc/auth-ipc.test.ts` 8 例（p236，t471 迁移遗留）。本机 `pnpm test` 全量仍受 p228（better-sqlite3 abort）影响，只能用 `-t` 过滤运行。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round N (YYYY-MM-DD HH:MM UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t000_code_f001|critical/important/minor|已修/遗留/撤回|一句话|文件:行 / pNNN / tid|

无 finding 时写“Round N 零 finding”。

### Round 1 (2026-09-16 17:02 UTC+8)

代码轴零 finding（PASS）；测试轴 1 条 minor。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t490_test_f001|minor|已修|`CONFIG_EXPORT` IPC handler 的 rawOptions→options 桥接无覆盖（三层各自有测但粘合可写反而全绿）。新增用例经真实 `registerConfigIpc` 取 handler，`{includeSecrets:true}` 断言落盘含 secrets|`tests/unit/ipc/config-ipc.test.ts`|

### Round 2 (2026-09-16 17:11 UTC+8)

代码轴零新 finding（PASS）。测试轴复核 Round 1 已消除，另提 1 条 minor。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t490_test_f002|minor|已修|桥接用例以非对象 `null` 代表「关闭」态，未覆盖渲染层真实发送的 `{includeSecrets:false}`。补该入参断言（桥接若改为按 key 存在性映射会写入密钥而失败）|`tests/unit/ipc/config-ipc.test.ts`|

### Round 3 (2026-09-16 17:20 UTC+8)

双轴复核：0 新 finding，code / test verdict 均 PASS，`review_scope=ok`、`overall=PASS`、`next_action=finalize`。AC 复验 5/5。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：AC-001~AC-005 全部满足
- 测试：`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`md_format.py --check`、`git diff --check`、`pnpm build` 全绿；相关用例 renderer 视图 216/216（须 `NODE_ENV=test`）、preload 2/2、config-ipc 53/53、local-api 新增 AC-005 1/1。既有红灯（base 复现、与本 task 无关）：local-api export 用例（p237）、auth-ipc 8 例（p236）；本机 `pnpm test` 全量受 p228 abort 限制
- 黑盒：`pnpm build` 通过；真实应用（`electron out/main/index.js serve`）——`/v1/health` ok、`GET /v1/config/export` 默认不含 `secrets` 且 `?includeSecrets=true` 含 `secrets`、`POST /v1/config/import` 提交含 `endpointOverrides` 的 v2 文档返回 `imported:true` 且 override 落盘
- review：full 级三轮。Round 1 代码轴 0 finding / 测试轴 1 minor → Round 2 双轴 PASS（测试轴另提 1 minor，已修）→ Round 3 双轴 PASS、0 新 finding；末轮 `review_scope=ok`、`overall=PASS`
- AC 证据：见 `handoff.json`

### 结果摘要

- 设置页「数据与隐私」的导出在桌面端与 Web 端统一：同一副标题与「包含明文密钥」复选框、同一 `{ includeSecrets }` 参数链路（renderer → preload → IPC → export_config），桌面导出默认不再强制写入明文密钥；Web 导入不再单独拒绝端点覆盖，与桌面端同权限同行为（t473 基线）。
- 遗留：p236（auth-ipc 陈旧 fixture，8 例红）、p237（LocalAPI 导出用例 deps 缺 appVersion，1 例红）均为既有问题，已登记；`pnpm test:e2e:web` 因本机未安装 Playwright 浏览器未执行。
