---
tid: "t275"
slug: "cli_serve_bootstrap"
title: "CLI 模式引导：argv 解析 + 无窗口启动 + --config 导入"
status: "done"
branch: "t275_cli_serve_bootstrap"
worktree: ""
review_level: "full"
diff_anchor: "f7dec21b0f46da57db7253e51a6807c7e5391d64"
depends_on: ""
conflicts_with: ""
note: "grilling 共识；无窗口 Electron 进程"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 环境前置：worktree `pnpm install` 后 electron 二进制缺失（dist 仅 locales），手动从 `~/.cache/electron/` 解压 `electron-v42.2.0-linux-x64.zip` 至 `node_modules/electron/dist`；`path.txt` 曾用 `echo` 写入带尾随换行导致 `require("electron")` 路径拼接错误，改用 `printf` 去换行。electron ABI 需 `ensure_sqlite_abi.mjs electron` 切换（build 前置）。
- 预存在基线修复（用户批准，随 t275 commit）：WSL/Linux 下 9 个 IPC sender 测试硬编码 `set_renderer_index_path("D:/app/...")`，`pathToFileURL` 在 Linux 解析为 cwd 相对路径导致失败——统一改 `fileURLToPath("file:///D:/...")` 往返推导，跨平台自洽。另 2 个订阅测试 mtime 量化 flaky（`/tmp` mtime 5ms 桶，subscribe 后立即 append 落入同一桶不触发轮询）——append 前加 50ms 延迟。1 个 WSL 探测测试依赖 `\\wsl.localhost\...` UNC 可达——`it.skipIf` 无 WSL 挂载时跳过。
- 实现：`src/main/cli/`（args / import-config / cli-json）+ `index.ts` CLI 分支。argv 解析忽略 `--cli` 后的未知 `--` 开关（Electron/Chromium 级参数如 `--user-data-dir`），仅对 serve 子命令自有参数严格校验——playwright 会把 `--user-data-dir` 插在 `--cli` 后，初版严格拒绝导致 SPIKE 启动失败，放宽后兼容。
- SPIKE 1 验证：`--cli serve`（playwright `_electron.launch`）winCount=0、health 200、cli.json 正确、stdout 打印 URL。
- SPIKE 2 验证：secret 导入经 `build_secret_param_keys`（manifest `type:secret`）识别，`keyFor` 存 vault，与 `config:saveSecrets` 同 key 空间。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-09 00:20 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                              | fix_ref                                                         |
| -------------- | --------- | ------ | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| t275_code_f001 | important | 已修   | CLI boot catch 向 stderr 写可读错误后 exit(1)；跳过 dialog（xvfb 下 showErrorBox 同步阻塞致挂起）；ENOENT 包装中文文案 | src/main/index.ts:1157                                          |
| t275_code_f002 | important | 已修   | 新增 docs/guides/cli-mode.md（WSL 依赖、xvfb-run、启动语法、cli.json）                                                 | docs/guides/cli-mode.md                                         |
| t275_code_f003 | minor     | 已修   | import_config_file save 失败回滚已转存 secret（写 key 记录 + delete）                                                  | src/main/cli/import-config.ts:60                                |
| t275_code_f004 | minor     | 已修   | write_cli_json 失败 catch 降级 warn，不阻断 serve                                                                      | src/main/index.ts:558                                           |
| t275_test_f001 | important | 已修   | e2e AC3 增 /v1/secrets 真实 vault 往返断言（读回明文 API_KEY）                                                         | tests/e2e/electron/cli_serve.spec.ts                            |
| t275_test_f002 | important | 已修   | e2e 增 --config 不存在/非法 JSON 进程级断言（exit 非 0 + config.json 未破坏）                                          | tests/e2e/electron/cli_serve.spec.ts                            |
| t275_test_f003 | important | 已修   | e2e 增 OMNI_PANEL_PORT 与 --port 并存优先级断言（--port 生效）                                                         | tests/e2e/electron/cli_serve.spec.ts                            |
| t275_test_f004 | important | 已修   | e2e 增预置 config.json 后无 --config 启动沿用断言                                                                      | tests/e2e/electron/cli_serve.spec.ts                            |
| t275_test_f005 | minor     | 已修   | e2e AC1 补 /v1/dashboard 合法 query 200 断言                                                                           | tests/e2e/electron/cli_serve.spec.ts                            |
| t275_test_f006 | minor     | 撤回   | Node child stdout paused 模式缓冲不丢数据，attach 晚不影响读取（reviewer 追加撤回记录）                                | review_test.md 撤回记录                                         |
| t275_test_f007 | minor     | 已修   | skipIf 注释明确该用例需 WSL 挂载环境执行                                                                               | tests/unit/main/core/session-history/session-path-index.test.ts |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1/AC2：e2e `--cli serve` 起真进程断言 `BrowserWindow.getAllWindows()` 为空、`/v1/health` 200、stdout 打印 `OmniPanel CLI mode listening`、cli.json 端口一致（cli_serve.spec.ts 7 passed）
    - AC3：e2e `--config` 导入 deepseek（API_KEY secret），config.json 覆盖写入且无明文，vault 加密文件无明文，`/v1/secrets` 读回明文密钥（真实 vault 往返）
    - AC4：e2e 预置 config.json 无 `--config` 启动沿用（preset-ds 存活）
    - AC5：桌面版回归——suspend_resume/popup_token_panel 既有 electron e2e 2 passed（`!cliMode &&` 守卫不影响桌面）
    - AC6：e2e `OMNI_PANEL_PORT` 与 `--port` 并存，`--port` 生效
    - AC7：[deploy] 用户 WSL 实机验证；agent 侧以 Linux xvfb 实跑 SPIKE + e2e 兜底，指南见 docs/guides/cli-mode.md
    - AC8：e2e 缺子命令 / `--config` 不存在 / 非法 JSON 均非零退出、stderr 可读错误、config.json 未被破坏；单测覆盖 args 非法组合 + import-config 拒绝路径

### Reviewer verdict

`full`：

- Round 1 code：FAIL
- Round 1 test：FAIL
- Round 2 code：PASS
- Round 2 test：PASS

### 结果摘要

- CLI 模式引导落地：argv 解析、无窗口启动、--config 导入（secret 转存 vault）、cli.json 实例发现、WSL 运行指南；预存在基线（9 IPC sender 路径 + 2 mtime 量化 + 1 WSL 探测）一并修复。
