# Task review t344（reviewer_focus: 代码）

- task：`t344_cli_json_zod_validation`
- spec：`docs/tasks/t344_cli_json_zod_validation/spec.md`
- diff_anchor：`1ceef5c575b960958eae584d096d6d556c11adcf`
- target：`git diff 1ceef5c575b960958eae584d096d6d556c11adcf`
- round：1
- reviewed_at：2026-08-13 18:55 UTC+8

reviewed_scope: a0345f0421561ca8

## Findings

### t344_code_f001 - omni_panel.mjs 残留未使用 import `readFileSync`，AC-001 未通过

- 严重度：important
- 锚点：AC-001（`pnpm lint` 通过 0 error）
- 位置：`scripts/omni_panel.mjs:20`
- 问题：diff 将 probe 与 serve 轮询的 `JSON.parse(readFileSync(...))` 替换为 `parse_cli_json`，`readFileSync` 不再使用，但仍在 `import { existsSync, mkdirSync, openSync, closeSync, readFileSync } from "node:fs"` 中保留。实测 `pnpm lint` 输出：
    ```
    scripts/omni_panel.mjs
      20:54  error  'readFileSync' is defined but never used  @typescript-eslint/no-unused-vars
    ```
    `--max-warnings=0` 下 lint 退出码 1，AC-001「`pnpm lint` 通过（0 error）」未满足。`typecheck` 已通过；16 个 `no-unsafe-*` 错误确已清零（lint 仅剩此 1 条），但 0 error 目标未达成。
- 建议：从 import 列表删除 `readFileSync`。

### t344_code_f002 - `CliInstanceInfo` 契约三处重复声明，存在漂移风险

- 严重度：minor
- 锚点：代码质量 DRY
- 位置：`scripts/cli_json_parse.d.mts:1-6`、`scripts/cli_json_parse.mjs:5`、`scripts/omni_panel.mjs:88`
- 问题：同一 `{ port, url, pid, userData, startedAt }` 契约在 `.d.mts` interface、`cli_json_parse.mjs` JSDoc `@typedef`、`omni_panel.mjs` JSDoc `@typedef` 三处重复。`src/main/cli/cli-json.ts` 为权威定义，若字段增删，三处同步易漏。属脚本上下文内的轻度重复，不构成行为缺陷。
- 建议：`omni_panel.mjs` 的 `@typedef` 改为 `/** @typedef {import("./cli_json_parse.mjs").CliInstanceInfo} CliInstanceInfo */` 复用单点定义；`cli_json_parse.mjs` 内 JSDoc 亦可省略内联 typedef 直接引用。

### t344_code_f003 - 对恒为 string 的 `resolve`/`join` 结果做防御性 typeof 收窄，兜底值语义错误

- 严重度：minor
- 锚点：代码质量 死代码 / 边界条件
- 位置：`scripts/omni_panel.mjs:86`、`:100`、`:165-166`
- 问题：`data_root_candidate` 由 `resolve(user_data_dir)` 或 `join(homedir(), ...)` 得出，`node:path` 两函数恒返回 `string`，`typeof x === "string" ? x : ""` 分支不可达。兜底值 `""` 若真被命中（不可达），`join("", "cli.json")` 会得到相对路径 `cli.json`，语义错误。属为满足类型收窄添加的噪音，非现行缺陷。
- 建议：`data_root` / `cli_json` 直接以 `string` 类型声明并信任 `resolve`/`join` 返回值，删除 `typeof ... === "string" ? ... : ""` 分支。

### t344_code_f004 - spec 未知契约清单 `UNVERIFIED-SPIKE` 标记未清除

- 严重度：minor
- 锚点：文档与规格一致性（spec 上下文区未知契约清单）
- 位置：`docs/tasks/t344_cli_json_zod_validation/spec.md`（未知契约清单）
- 问题：上下文区「未知契约清单」仍登记 `cli.json 完整字段形态：UNVERIFIED-SPIKE`，进入 review 时应已无 `UNVERIFIED-*` 标记。实质门禁已满足：`parse_cli_json.mjs` 注释指向 `src/main/cli/cli-json.ts`，且字段集 `{port,url,pid,userData,startedAt}` 与该文件 `CliInstanceInfo` 完全一致，写入方 `write_cli_json` 恒写全五字段、另一读取方 `resolve_instance`（client.ts:56-64）校验 `port` 为 number 且 `> 0`——契约已核实，不存在「误拒合法文件」风险。残留仅标记未清，判 minor，不构成门禁绕过。
- 建议：finalization 时在 spec 上下文区删除该标记（或标注已核实结论与验证方式）。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：4 条（1 important + 3 minor）
- 未进表的提示：
    - 文件过大：无。`scripts/omni_panel.mjs` 230 行、`scripts/cli_json_parse.mjs` 57 行、测试 87 行，均远低于阈值。
    - 复杂度：无。`probe_running_instance` 与轮询回调分支均 ≤ 3，未达阈值。
    - 范围外观察：
        - `parse_cli_json` 对 `port` 仅校验 `typeof number`，弱于应用自身 reader（client.ts:62 `port <= 0` 拒绝）。本 task 内两调用点可观测结果一致（probe 失败均返回 null），无回归；如需对齐可后续在 parse 中加 `> 0` 校验，非本 task 阻断项。
        - 实测 `http.get({port: NaN})` / `port: 0` 抛异步 `socket hang up`，走 `req.on("error")` → `resolve(null)`，不产生同步 throw / unhandled rejection，probe 无崩溃风险。
        - `omni_panel.mjs` 内 `log_path` join 折叠与 `spawn stdio` 换行为 prettier 纯格式改动，属同文件无害范围外变化。
    - 明确扫过的视角：安全（无外部输入拼接/执行、无敏感数据落盘）、性能（轮询仍 200ms 同步读，与旧行为一致）、契约·Breaking（`parse_cli_json` 签名经 `.d.mts` 约束，无 any 透传；调用方行为与旧逻辑对齐）。
- 总体判断：AC-001 未通过（`pnpm lint` 1 error：未使用 `readFileSync`），存在 1 条未解决 important，须修复后重审；AC-002 已满足。
- 系统性 follow-up：无

### AC 复验披露

- AC-001：`re_verified` —— 实跑 `pnpm lint`，输出 1 error（`omni_panel.mjs:20:54 'readFileSync' is defined but never used`），`--max-warnings=0` 下失败。未满足。
- AC-002：`re_verified` —— 实跑 `pnpm exec vitest run tests/unit/main/cli/cli_json_parse.test.ts`（4/4 通过，覆盖合法/缺字段/类型错误/损坏 JSON）；读 `parse_cli_json` 确认缺字段与类型错误均返回可读中文错误串；probe 对 `!parsed.ok` 返回 null、serve 轮询对 `!parsed.ok` 继续轮询，均无 TypeError/undefined 透传。满足。

coverage = 2 / 2

verdict: FAIL

## Round 2 (2026-08-13 19:02 UTC+8)

- 前轮 finding 复核：以 diff 与代码核实，不采信处置表自称
    - `t344_code_f001`（important）：**已消除**。`scripts/omni_panel.mjs:20` import 已删 `readFileSync`；实跑 `pnpm lint` 0 error。
    - `t344_code_f002`（minor）：**已按「遗留」登记** `docs/pending/todo/p160_cli_json_contract_dedupe.md`（内容含改进方向与来源引用）。minor 遗留不阻断，处置合规。
    - `t344_code_f003`（minor）：**已按「遗留」登记** `docs/pending/todo/p161_cli_json_defensive_typeof.md`（含根治方向说明）。处置合规。
    - `t344_code_f004`（minor）：**已修**。`docs/tasks/t344_cli_json_zod_validation/spec.md:83` 的 `UNVERIFIED-SPIKE` 改为已核实结论（字段集与 `cli-json.ts` `CliInstanceInfo` 一致，userData/startedAt 缺省空串已注明）。
- 本轮新发现：1 条（minor）

reviewed_scope: 38f575384abea984

### t344_code_f005 - 新测试文件未过 prettier，`format:check` 失败（处置自述「prettier 全过」不符）

- 严重度：minor
- 锚点：代码质量 风格/格式（不锚定 AC；AC-001 仅约束 lint）
- 位置：`tests/unit/main/cli/cli_json_parse.test.ts:7`
- 问题：`CliParseResult` 联合类型首行 `| { ok: true; info: { port: number; url: string; pid: number; userData: string; startedAt: string } }` 超宽，prettier 要求折行。实测：
    ```
    pnpm format:check
    [warn] tests/unit/main/cli/cli_json_parse.test.ts
    Code style issues found in the above file.
    ```
    diff 触及的 4 个文件（`cli_json_parse.mjs` / `.d.mts` / `omni_panel.mjs` / 本测试）中仅此新测试文件未过 prettier；`scripts/omni_panel.mjs` 当前版已过（anchor 版因无结尾换行不过，本 task 已顺带修复）。处置自述「prettier 全过」与事实不符。非 AC 门禁，属风格项 → minor，不阻断。
- 建议：`pnpm exec prettier --write tests/unit/main/cli/cli_json_parse.test.ts`（对第 7 行类型定义折行），复核 `format:check` 通过。

## 结论（Round 2）

- 前轮 finding 复核：f001 已消除；f002/f003 已按流程登记 pending（minor 遗留合规）；f004 已修。无未解决 blocking。
- 本轮新发现：1 条（minor，f005）
- 未进表的提示：
    - 文件过大：无。`omni_panel.mjs` 230 行、`cli_json_parse.mjs` 57 行、测试 125 行，均低于阈值。
    - 复杂度：无。
    - 范围外观察：新测试补充的 url/pid 缺字段、文件缺失、userData/startedAt 断言均为有断言的实质用例（7/7 通过），非恒真/弱化断言；`if (!result.ok) return` 为 TS 收窄惯用，前有真实 `expect`，非条件跳过弱化。
- 总体判断：Round 1 唯一 blocking（f001）已消除，新增 f005 为 minor；无未解决 critical / important → PASS。
- 系统性 follow-up：无
- 提示：`check_review_status.py` 当前输出 `code_verdict=PASS` 但 `overall=INCOMPLETE`、`review_scope=stale`——本代码报告 Round 2 指纹已更新为 `44927cd5e6868e5d`（与 current_scope 一致）；stale 由 `review_test.md` Round 2 仍持旧指纹 `a0345f0421561ca8` 驱动（spec.md 已改，计入指纹）。属测试 reviewer 待同步项，非本报告问题。

### AC 复验披露（Round 2）

- AC-001：`re_verified` —— 实跑 `pnpm lint` 0 error（`omni_panel.mjs` 无 `no-unsafe-*` 违规），符合 AC-001。
- AC-002：`re_verified` —— 实跑 `pnpm exec vitest run tests/unit/main/cli/cli_json_parse.test.ts` 7/7 通过（合法/缺 url/缺 pid/文件缺失/缺 port/port 类型错误/损坏 JSON）；读 `parse_cli_json` 确认各失败路径均返回可读中文错误串，probe 对 `!parsed.ok` 返回 null、serve 轮询继续轮询，无 TypeError/undefined 透传。

coverage = 2 / 2

verdict: PASS
