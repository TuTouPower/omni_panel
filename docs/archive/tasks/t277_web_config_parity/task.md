---
tid: "t277"
slug: "web_config_parity"
title: "web 配置面对齐：实例管理端点 + 导出含密钥变体 + config SSE"
status: "done"
branch: "t277_web_config_parity"
worktree: ""
review_level: "full"
diff_anchor: "afd34807dc3c35b5174cb0e8b56abcf9cb4195af"
depends_on: "t275,t276"
conflicts_with: "t279"
note: "导出含明文密钥，用户已确认自用场景"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

无

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

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id     | severity                 | status | rationale | fix_ref |
| -------------- | ------------------------ | ------ | --------- | ------- |
| t000_code_f001 | critical/important/minor | 已修   | 一句话    | 文件:行 |
| t000_test_f002 | minor                    | 遗留   | 一句话    | pNNN    |

### Round 1 (2026-08-10 02:15 UTC+8)

| finding_id     | severity  | status | rationale                                                                | fix_ref                                              |
| -------------- | --------- | ------ | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| t277_code_f001 | important | 已修   | 配置 SSE 回调现在同步应用 `config.theme`，跨页面主题变更有测试覆盖。     | `src/renderer/lib/theme.ts:14-75`                    |
| t277_code_f002 | critical  | 已修   | 仅含配置、不含 secret material 的导入不再替换现有 vault。                | `src/main/ipc/config-ipc.ts:490-498`                 |
| t277_code_f003 | critical  | 已修   | Web import 明确拒绝自定义端点覆盖，避免无交互确认时外发密钥。            | `src/main/core/local-api/server.ts:931-933`          |
| t277_test_f001 | important | 已修   | 删除旧 stub 语义用例，新增独立的 duplicate/createInstance 请求契约用例。 | `tests/unit/web/usageboard-web.test.ts:183-219`      |
| t277_test_f002 | important | 已修   | LocalAPI duplicate/createInstance 测试现在断言返回实例已写入配置。       | `tests/integration/local-api/server.test.ts:305-335` |
| t277_test_f003 | important | 已修   | Web E2E 实际下载未勾选与勾选两种导出产物并断言密钥差异。                 | `tests/e2e/web/settings_view.spec.ts:83-127`         |
| t277_test_f004 | important | 已修   | CLI E2E 真实执行两种 `--cli export`，并与 LocalAPI 导出结果比较。        | `tests/e2e/electron/cli_serve.spec.ts:428-443`       |
| t277_test_f005 | important | 已修   | 集成与 Web E2E 覆盖坏 JSON、schema-invalid、可读错误及配置不变性。       | `tests/integration/local-api/server.test.ts:357-404` |
| t277_test_f006 | important | 已修   | 真实配置 POST 驱动两个 SSE 客户端，断言两端均收到主题配置事件。          | `tests/integration/local-api/server.test.ts:448-473` |

### Round 2 (2026-08-10 03:12 UTC+8)

Round 2 复核沿用 Round 1 finding ID，未产生新 finding；本轮发现的未闭环项已在后续实现中修复，最终状态统一保留在 Round 1 处置表，避免重复登记。

### Round 3 (2026-08-10 03:39 UTC+8)

| finding_id     | severity  | status | rationale                                                              | fix_ref                                               |
| -------------- | --------- | ------ | ---------------------------------------------------------------------- | ----------------------------------------------------- |
| t277_code_f004 | important | 已修   | 复制异步失败现在由表单捕获并显示可读错误，Promise rejection 不再悬空。 | `src/renderer/components/SettingsForm.tsx:48,643-651` |
| t277_code_f005 | important | 已修   | 缺失 `theme` 统一按 `system` 解析，保持系统深色偏好与旧配置语义一致。  | `src/renderer/lib/theme.ts:14-22`                     |

`t277_test_f006` 沿用 Round 1 唯一处置行；已新增真实 `--cli serve` → LocalAPI → Web bridge → 两个 Chromium 页面配置 SSE 测试，验证页面 B 无刷新收到页面 A 的主题变更。`t277_test_f006` 不重复登记。

### Round 4 (2026-08-10 04:04 UTC+8)

| finding_id     | severity  | status | rationale                                                                             | fix_ref                           |
| -------------- | --------- | ------ | ------------------------------------------------------------------------------------- | --------------------------------- |
| t277_code_f007 | important | 已修   | Web bridge 现在透传生产 LocalAPI 的嵌套错误详情，schema-invalid import 显示可读原因。 | `src/web/usageboard-web.ts:37-54` |

### Round 5 (2026-08-10 05:29 UTC+8)

| finding_id     | severity  | status | rationale                                                                   | fix_ref                                                                                                       |
| -------------- | --------- | ------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| t277_code_f008 | important | 已修   | JSON `null` 现在返回明确的解析成功结果，schema 校验失败不再让请求 pending。 | `src/main/core/local-api/server.ts:148-162`                                                                   |
| t277_code_f009 | important | 已修   | CLI export 等待 stdout writer 完成后才返回成功，避免 app.exit 截断输出。    | `src/main/cli/client.ts:14-23,222-231`                                                                        |
| t277_code_f010 | minor     | 已修   | Web 文件选择器同时处理 change/cancel，取消导入会正常 resolve。              | `src/web/usageboard-web.ts:260-285`                                                                           |
| t277_code_f011 | important | 已修   | 主题初始 GET 受事件代次保护，已到达的 SSE 主题不会被旧 GET 回滚。           | `src/renderer/lib/theme.ts:61-118`                                                                            |
| t277_code_f012 | important | 已修   | 未发现于受信 definitions 的 connector executablePath 会被拒绝或清理。       | `src/main/core/config/secret_param_keys.ts; src/main/ipc/config-ipc.ts; src/main/core/config/config-store.ts` |
| t277_code_f013 | minor     | 已修   | duplicate 请求进行中禁用按钮，避免快速并发保存覆盖配置。                    | `src/renderer/components/SettingsForm.tsx:637-651`                                                            |

本轮验证：`pnpm typecheck`、变更生产文件 ESLint、Prettier check、`pnpm test`（252 files、2785 tests passed、2 skipped）和 `pnpm build` 均通过。目标 E2E 均使用 `E2E=1 E2E_HEADLESS=1 xvfb-run -a`：Web settings 10/10、Electron `cli_serve` 8/8、CLI flow 4/4；全部使用直接 Playwright binary，未打开可见窗口。

### Round 6 (2026-08-10 11:27 UTC+8)

代码审阅 Round 6 与测试审阅 Round 5 均无新 finding，最终 verdict 均为 PASS。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - `node scripts/ensure_sqlite_abi.mjs node` 通过；变更生产文件 Prettier、ESLint（`--max-warnings=0`）和 `pnpm typecheck` 通过。
    - `pnpm test`：252 个 test files，2785 tests passed，2 skipped。
    - `pnpm build`：通过，生成 main/preload/renderer/web 构建产物。
    - Web E2E：`E2E=1 E2E_HEADLESS=1 xvfb-run -a ./node_modules/.bin/playwright test --config=playwright.config.ts --project=web tests/e2e/web/settings_view.spec.ts`，10/10 通过。
    - Electron E2E：`node scripts/ensure_sqlite_abi.mjs electron && E2E=1 E2E_HEADLESS=1 xvfb-run -a ./node_modules/.bin/playwright test --config=playwright.config.ts --project=electron tests/e2e/electron/cli_serve.spec.ts`，8/8 通过。
    - CLI E2E：`E2E=1 E2E_HEADLESS=1 xvfb-run -a ./node_modules/.bin/playwright test --config=playwright.config.ts --project=cli tests/e2e/cli/cli_flow.spec.ts`，4/4 通过。
    - 所有目标 E2E 均使用 `E2E_HEADLESS=1` 与 `xvfb-run -a`，直接调用 Playwright binary，未打开可见窗口。
    - 全量 Web E2E 另有 1 个既有 fixture 一致性失败，已登记 `p105`；不影响本 task 目标 settings 用例。

### Reviewer verdict

- Round 1 code：FAIL
- Round 2 code：FAIL
- Round 3 code：FAIL
- Round 4 code：FAIL
- Round 5 code：FAIL
- Round 6 code：PASS
- Round 1 test：FAIL
- Round 2 test：FAIL
- Round 3 test：FAIL
- Round 4 test：PASS
- Round 5 test：PASS

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

Web 配置实例管理、含密钥导出/导入、CLI export 和 config/theme SSE 已完成；密钥剥离、未知 connector 路径边界、异步 stdout、文件选择器取消和主题初始化竞态均有回归覆盖。
