# Task review t344（reviewer_focus: 测试）

- task：`t344_cli_json_zod_validation`
- spec：`docs/tasks/t344_cli_json_zod_validation/spec.md`
- diff_anchor：`1ceef5c575b960958eae584d096d6d556c11adcf`
- target：`git diff 1ceef5c575b960958eae584d096d6d556c11adcf`
- round：1
- reviewed_at：2026-08-13 18:55 UTC+8

## Findings

### t344_test_f001 - AC-001 lint 未通过：`readFileSync` 导入残留未用

- 严重度：important
- 锚点：AC-001（`pnpm lint` 通过 0 error）
- 位置：`scripts/omni_panel.mjs:20`
- 问题：本 diff 把 `probe_running_instance` 与后台轮询里的两处 `readFileSync(join(data_root, "cli.json"), "utf8")` 改为 `parse_cli_json(candidate)`，但 `node:fs` 导入行仍保留 `readFileSync`，成为未使用变量。实测 `pnpm lint` 退出码 1：
    ```
    scripts/omni_panel.mjs
      20:54  error  'readFileSync' is defined but never used  @typescript-eslint/no-unused-vars
    ✖ 1 problem (1 error, 0 warnings)
    ```
    AC-001 要求 `pnpm lint` 0 error，现未满足。该 lint 错误由本 diff 直接引入（删除两处调用而未清理导入）。可复现路径：`pnpm lint`。注意 AC-001 的 `no-unsafe-*` 部分已消除（`parse_cli_json` 返回判别联合，无 `any` 透传），但 lint 总门禁仍挂。
- 建议：从 `scripts/omni_panel.mjs:20` 导入行移除 `readFileSync`，重跑 `pnpm lint` 至 0 error。

### t344_test_f002 - 读文件失败/文件缺失分支未测

- 严重度：minor
- 锚点：AC-002（损坏/缺字段产生可读校验失败；文件缺失属该函数的失败路径，影响 `probe_running_instance` 将「无 cli.json」判定为「无实例」）
- 位置：`tests/unit/main/cli/cli_json_parse.test.ts`（4 例：合法/缺 port/port 类型错/损坏 JSON）
- 问题：`parse_cli_json` 有 `读取 cli.json 失败`、`cli.json 为空或缺失`、`路径为空或缺失`、`根节点须为对象` 四条分支，测试仅覆盖合法/缺字段(port)/类型错(port)/损坏 JSON 四类。文件缺失路径（`readFileSync` 抛错 → 返回可读 error）是 `probe_running_instance` 判定「残留文件=无实例」的关键前置，未设用例。
- 建议：补「cli.json 文件不存在 → 返回 `{ok:false}` 且 error 含可读文案」一例（复用 `temp_cli_json`，改删文件或传不存在的 path）。

### t344_test_f003 - spec 上下文区「未知契约清单」UNVERIFIED-SPIKE 未清

- 严重度：minor
- 锚点：spec.md 上下文区「未知契约清单」；范围「用 Zod/schema 校验 cli.json 结构，消除 any 透传」
- 位置：`docs/tasks/t344_cli_json_zod_validation/spec.md`（上下文区未知契约清单）
- 问题：`UNVERIFIED-SPIKE` 标记未从 spec 清除。但实施实质已核实：`scripts/cli_json_parse.mjs` 字段集 `port/url/pid/userData/startedAt` 与 `src/main/cli/cli-json.ts:11-17` 的 `CliInstanceInfo` 完全一致，模块注释亦指向该文件；`userData`/`startedAt` 缺失时宽松默认 `""`，契合风险区「schema 宽松化避免误拒」回退。即 spike 目的已达成，仅 spec 文档未同步，非实施前门禁被绕过。
- 建议：finalization 时在 spec 上下文区将该项改为结论（注明验证方式：对照 `src/main/cli/cli-json.ts` 写入方字段全集），清除 `UNVERIFIED-SPIKE` 标记。

### t344_test_f004 - 合法用例未断言 userData/startedAt；缺字段/类型错误仅覆盖 port 字段

- 严重度：minor
- 锚点：AC-002（缺字段/类型错误可读校验）；测试策略「合法/缺字段/类型错误三种输入」
- 位置：`tests/unit/main/cli/cli_json_parse.test.ts:38-45`（合法用例）与缺 port/类型错用例
- 问题：合法用例仅断言 `port/url/pid`，未断言 `userData`/`startedAt` 透传（生产逻辑中这两字段有 `typeof` 宽松默认逻辑，未受验证）。缺字段/类型错误两类各只经 `port` 一字段验证，`url`/`pid` 的缺字段与类型错误路径、`userData`/`startedAt` 缺省默认路径未覆盖。AC-002 的两类行为各已有一次有效验证，属「覆盖可更广」，非行为缺测。
- 建议：合法用例补 `userData`/`startedAt` 断言；可选补 `pid` 缺字段与 `url` 类型错两例，完善错误信息文案断言。

## 结论

- 前轮 finding 复核：Round 1，无。
- 改测方向复核：无（diff 未修改任何既有测试，仅新增文件）。
- 本轮新发现：4 条（1 important，3 minor）。
- 未进表的提示：
    - 10 个 electron 环境测试文件（build-info-ipc 等）因 p153 环境缺陷（worktree 缺 electron path.txt）失败，与本 task 无关，未作 finding。
    - `scripts/omni_panel.mjs:99-100`、`165-166` 中 `join()` 结果再判 `typeof === "string"` 为恒真分支，属防御性冗余；`catch {}` 内 `parsed.ok===false` 分支体为空仅注释——均属代码层质量，留 code reviewer 域，未进表。
    - 测试内 `if (!result.ok) return;` / `if (result.ok) return;` 为 expect 断言之后的 TS 类型收窄惯用法（断言失败即抛，不存在跳过断言路径），已核对非「条件跳过弱化断言」危险模式，未作 finding。
- AC 复验方式：
    - AC-001：`re_verified` — 重跑 `pnpm lint`，退出码 1，`scripts/omni_panel.mjs:20` 报 `no-unused-vars`（`readFileSync` 未用），未通过。
    - AC-002：`re_verified` — 重跑 `node_modules/.bin/vitest run tests/unit/main/cli/cli_json_parse.test.ts`，4/4 过；逐一核对断言：缺 port→error 含 `port`，port 类型错→error 含 `number 字段 port`，损坏 JSON→error 含 `合法 JSON`；`parse` 返回判别联合而非抛出，`expect(result.ok).toBe(false)` 使 TypeError 透传回归必致测试失败，AC-002 的「可读错误、非 TypeError 透传」得到真实验证。
    - 覆盖率行：`coverage = 2/2`。
- 总体判断：AC-002 测试真实可信且覆盖充分（4/4 过），但 AC-001 lint 门禁未过（本 diff 引入的未用 `readFileSync` 导入），1 条 important 未解决 → FAIL。
- 系统性 follow-up：无。

reviewed_scope: a0345f0421561ca8

verdict: FAIL

## Round 2 (2026-08-13 19:00 UTC+8)

### 前轮 finding 复核（以 diff 与实测为准）

- t344_test_f001（important）：已消除。`scripts/omni_panel.mjs:20` 导入行已移除 `readFileSync`（现为 `import { existsSync, mkdirSync, openSync, closeSync } from "node:fs"`）；重跑 `node_modules/.bin/eslint scripts/omni_panel.mjs scripts/cli_json_parse.mjs scripts/cli_json_parse.d.mts --max-warnings=0` exit 0，`pnpm lint` 亦无 error。AC-001 满足。
- t344_test_f002（minor）：已修。新增用例「文件缺失返回可读错误（非抛异常）」（`cli_json_parse.test.ts`「文件缺失」it 块）：`parse(join(tmpdir(), "no-such-cli.json-xyz"))` 断言 `result.ok` 为 false 且 error 含「读取 cli.json 失败」。断言 `toContain` 用于错误文案可读性验证，与 AC-002 口径一致，非弱化。路径为 tmpdir 下固定不存在的文件名，恒真/条件跳过风险已核（若该文件恰存在测试会 FAIL，属可复现失败而非恒真）。
- t344_test_f003（minor）：已修。spec.md 上下文区「未知契约清单」由 `UNVERIFIED-SPIKE` 更新为「已核实（2026-08-13）——`src/main/cli/cli-json.ts` 的 `CliInstanceInfo`：port/url/pid/userData/startedAt；parse_cli_json 校验前三个必填，userData/startedAt 缺省给空串」，与实现及 `src/main/cli/cli-json.ts:11-17` 一致。
- t344_test_f004（minor）：已修。合法用例补 `result.info.userData` / `result.info.startedAt` 断言；新增「缺 url 字段」与「缺 pid 字段」两用例（各断言 error 含字段名）。缺字段/类型错误现覆盖 port/url/pid 三字段。

### 本轮新发现

- t344_test_f005 - 类型错误与缺省默认分支覆盖可更广（minor）
    - 严重度：minor
    - 锚点：AC-002（缺字段/类型错误可读校验）
    - 位置：`tests/unit/main/cli/cli_json_parse.test.ts`（缺 url/pid/port 用例 + port 类型错用例）
    - 问题：缺字段路径现覆盖 port/url/pid 三字段；类型错误路径仅覆盖 port（字符串 port）。url/pid 的类型错误、`userData`/`startedAt` 缺省默认空串路径仍无直接用例。AC-002 两行为各已有有效验证，属「覆盖可更广」，非行为缺测。
    - 建议：可选补 url/pid 类型错误与 userData/startedAt 缺省用例，完善分支覆盖。

### 改测方向复核

- 本轮无对既有测试的修改（仅新增用例与断言），无「迁就实现」改测。

### 本轮结论

- AC 复验方式：
    - AC-001：`re_verified` — 重跑 `pnpm lint` 与单文件 eslint，均 0 error。
    - AC-002：`re_verified` — 重跑 `node_modules/.bin/vitest run tests/unit/main/cli/cli_json_parse.test.ts`，7/7 过；逐一核对：合法/缺 port/缺 url/缺 pid/port 类型错/损坏 JSON/文件缺失，error 断言含字段名与「合法 JSON」「读取 cli.json 失败」等可读文案；返回判别联合而非抛异常，TypeError 透传回归必致测试失败。
    - 覆盖率行：`coverage = 2/2`。
- 未进表提示：新增用例均无 `.skip`/`.only`、无恒真断言、无条件跳过弱化断言；`if (result.ok) return;` 为类型收窄惯用法（断言失败即抛），非危险模式。无。
- 总体判断：前轮 1 important + 3 minor 全部核验消除，AC-001 lint 0 error、AC-002 7/7 测试真实覆盖；本轮仅余 1 条 minor 覆盖扩展建议，无未解决 critical/important。
- 系统性 follow-up：无。

reviewed_scope: 38f575384abea984

verdict: PASS
