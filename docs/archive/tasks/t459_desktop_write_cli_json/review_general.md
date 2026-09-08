# Task review t459（reviewer_focus: 通用）

- task：`t459_desktop_write_cli_json`
- spec：`docs/tasks/t459_desktop_write_cli_json/spec.md`
- diff_anchor：`e72e62ca3357eb40ff399d9f9341b2abc20c7176`
- target：`git -C '/home/karon/karson_ubuntu/omni_panel_t459' diff e72e62ca3357eb40ff399d9f9341b2abc20c7176`
- round：1
- reviewed_at：2026-09-08 08:56 UTC+8
    reviewed_scope: 43b2225debe34165

## Findings

### t459_gen_f001 - 打包二进制下 extract_user_argv 会误剥 `.js` 路径参数

- 严重度：important
- 锚点：行为缺陷 — 打包入口 `omni-panel serve --config /tmp/cfg.js`（或任意以 `.js`/`.cjs`/`.mjs` 结尾的 flag 值）时配置路径被当成「主脚本」删掉，解析失败或丢参
- 位置：`src/main/cli/args.ts:88-92`（`extract_user_argv`）
- 问题：d055 修复把「只剥 `rest[0]` 若为 `.js`」改成「剥掉 rest 中第一个 `/\.(c|m)?js$/i` 匹配项」。playwright / electron 开发态 argv 含 `.../main/index.js`，第一个命中是主脚本，行为正确；打包二进制 argv 形如 `[execPath, "serve", "--config", "/tmp/cfg.js"]`，**没有**主脚本 `.js`，`findIndex` 命中配置路径并删掉，结果变成 `["serve", "--config"]`，随后 `parse_serve_options` 因 `--config` 缺值抛 `CliUsageError`。`--user-data-dir /tmp/app.js` 同类。旧实现（只看 `rest[0]`）在打包态不会误伤。单测只覆盖「有主脚本 + chromium 开关」形态，未覆盖「无主脚本 + 值以 `.js` 结尾」。
- 建议：仅剥离「主入口」形态（例如路径匹配 `/index\.(c|m)?js$/i`，或位于子命令之前且非 `VALUE_FLAGS` 的值位置）；并补打包态 `serve --config foo.js` 与 playwright 注入开关两则单测，防止互踩。

### t459_gen_f002 - AC-004 用例未固定非默认端口，注释前提错误

- 严重度：important
- 锚点：违反 AC-004（实际监听端口不是默认 18263 时，`port`/`url` 仍反映实际端口）
- 位置：`tests/e2e/electron/desktop_cli_json.spec.ts:10-12,16-41`；对照 `tests/e2e/fixtures/electron_app.ts:53-55`、`src/main/core/paths.ts:99-108`、`src/main/core/local-api/server.ts:89-90,879-882`
- 问题：用例标题/注释声称覆盖 AC-004，并写「E2E 测试构建默认 17864」。electron fixture 只注入 `E2E=1`，**不**设 `TEST_INSTANCE=1`；`is_test_build()` 因此为 false，local-api 默认端口仍是生产默认 **18263**。该用例未设 `OMNI_PANEL_PORT` / `--port`。在 18263 空闲时，监听端口=默认端口，硬编码 `18263` 写入 `cli.json` 也能通过「读文件 + 对该端口 health」断言，AC-004 的区分条件未被建立。上下文区测试策略要求「非默认 port … 覆盖 AC-004」，当前实现未落实。
- 建议：AC-001/004 用例经 fixture `env` 注入明确非 18263 的 `OMNI_PANEL_PORT`（或等价），并断言 `info.port`/`info.url` 等于该端口；修正注释中「E2E 默认 17864」的错误前提。

### t459_gen_f003 - AC-003 断言声称「仍是目录」但只检查 existsSync

- 严重度：minor
- 锚点：行为缺陷（弱断言）— 写失败后路径若被误写成普通文件，当前断言仍通过
- 位置：`tests/e2e/electron/desktop_cli_json.spec.ts:65-66`
- 问题：注释写「cli.json 仍是目录（写失败被吞，只 warn，未变成文件）」，断言仅为 `existsSync(...)`。目录与文件均使 `existsSync` 为 true，无法区分「写失败保留目录」与「误写成文件」。主 AC（进程存活 + health 200）已覆盖；本条为补充断言强度不足。
- 建议：改为 `statSync(...).isDirectory() === true`（或等价）。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：N/A（Round 1）
- 本轮新发现：3 条（important 2 / minor 1）
- 未进表的提示：`docs/blueprint/architecture.md` 仍保留历史措辞「`--cli serve`」（与现行无 `--cli` 入口并存于同段；非本 task 引入，不影响 AC）。GUI 写盘主路径（`src/main/index.ts:753-767` 无条件 `write_cli_json`）与 serve 共用、失败只 warn，与 AC-001/002/003 实现面一致。
- 总体判断：实现将 `write_cli_json` 移出 `cliMode` 门控，文档/spec 索引已同步；但 d055 的 argv 剥离引入打包态误剥回归，且 AC-004 测试未真正约束非默认端口 → FAIL
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` — 查证 `src/main/index.ts:753-767` GUI 与 serve 均调用 `write_cli_json`；`cli-json.ts:27-32` 注入 `process.pid`/`startedAt`；e2e `desktop_cli_json.spec.ts` 断言文件存在及 `port`/`url`/`userData`/`pid`/`startedAt` 字段。
- AC-002：`re_verified` — 同一无条件写路径保留 serve 行为；既有 `tests/e2e/electron/cli_serve.spec.ts` AC1/AC2 仍断言 serve 写 `cli.json` 端口一致（本 diff 未削弱该用例）。
- AC-003：`re_verified` — 查证写失败 `.catch` 只 `log.warn`（`index.ts:761-767`）；e2e 以目录占位触发 EISDIR 后仍 `firstWindow` + health 200。
- AC-004：`re_verified` — 查证生产写入使用 `local_api.get_port()`（非字面 18263）；但对应 e2e **未**固定非默认端口（见 t459_gen_f002），测试层未复验 AC-004 区分条件。

coverage = 4 / 4

verdict: FAIL

## Round 2 (2026-09-08 09:01 UTC+8)

reviewed_scope: 07711a2c34324b7d

## Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核：
    - `t459_gen_f001`：已消除。`extract_user_argv`（`src/main/cli/args.ts:88-101`）跳过 `VALUE_FLAGS` 值位，且非首位仅剥路径形态 `.js`；单测覆盖打包态 `--config /tmp/cfg.js`、`--user-data-dir /tmp/app.js` 与 playwright 注入开关形态（`tests/unit/main/cli/args.test.ts`），vitest 35 例通过。
    - `t459_gen_f002`：已消除。`desktop_cli_json.spec.ts` 经 fixture `env.OMNI_PANEL_PORT=17934`（≠ 默认 18263）固定端口，并断言 `info.port`/`info.url` 等于该端口；`electron_app.ts` / `app_fixture.ts` 已贯通 `env` 注入。
    - `t459_gen_f003`：已消除。AC-003 断言改为 `statSync(...).isDirectory() === true`。
- 本轮新发现：0 条
- 未进表的提示：`extract_user_argv` 在子命令之后仍可能剥路径形态 `.js` 位置参（如 `serve /tmp/extra.js` → 静默丢参而非 `CliUsageError`）；非常规误用路径，不影响 f001 已修场景与 AC。`architecture.md` 仍保留历史「`--cli serve`」措辞（非本轮引入）。d055 finding 正文仍描述修复前「只剥 rest[0]」结论，属发现记录而非代码缺陷。
- 总体判断：前轮 2 important + 1 minor 均已在 diff 中消除；本轮无新 blocker → PASS
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` — `src/main/index.ts:753-767` 无条件 `write_cli_json`；e2e 断言 `cli.json` 存在及 `port`/`url`/`userData`/`pid`/`startedAt`。
- AC-002：`re_verified` — 同一无条件写路径保留 serve；`cli_serve` e2e 仍在树中且本 diff 未削弱其断言。
- AC-003：`re_verified` — 写失败 `.catch` 只 `log.warn`；e2e 以目录占位 + `isDirectory()` + health 200。
- AC-004：`re_verified` — e2e 固定 `OMNI_PANEL_PORT=17934` 并断言 `info.port`/`info.url`；生产写入用 `local_api.get_port()`（`server.ts:879-882` 读该 env）。

coverage = 4 / 4

verdict: PASS
