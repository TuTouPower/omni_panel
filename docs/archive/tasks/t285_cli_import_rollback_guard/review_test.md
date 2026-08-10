# Task review t285（reviewer_focus: 测试）

- task：`t285_cli_import_rollback_guard`
- spec：`docs/tasks/t285_cli_import_rollback_guard/spec.md`
- diff_anchor：`43d55051af9ca47bf541f7e745f52f75886097f2`
- target：`git diff 43d55051af9ca47bf541f7e745f52f75886097f2`
- round：1
- reviewed_at：2026-08-10 23:23 UTC+8

## Findings

### t285_test_f001 - cli-mode.md apt 清单在所列发行版不可执行，t64 说明存在事实错误

- 严重度：important
- 锚点：AC-002（`docs/guides/cli-mode.md` 含可执行的 apt 依赖安装清单）
- 位置：`docs/guides/cli-mode.md:25-41`（安装命令）、`docs/guides/cli-mode.md:44-45`（t64 注意）
- 问题：清单与注意按原样执行，在文档点名的多个发行版上会直接失败，AC-002「可执行」未满足。两处事实错误：
    1. 「`libasound2t64` 是 Debian 12 / Ubuntu 24.04+ 的 t64 过渡包名」——Debian 12（bookworm）**没有** t64 过渡，t64 过渡落在 Debian 13（trixie，2025-08 发布，见 [LWN: A look at Debian trixie](https://lwn.net/Articles/1033474/)）。Debian 12 上 `apt install libasound2t64` 报 `Unable to locate package`。
    2. 「其余包名在新旧版一致」——不成立。Ubuntu 24.04（noble）上清单中 5 个旧包名已整体移除（packages.ubuntu.com 对 noble 均返回 `Package not available in this suite`），对应 t64 新名：`libgtk-3-0t64`（[noble 页](https://packages.ubuntu.com/noble/libgtk-3-0t64)）、`libatk1.0-0t64`、`libatk-bridge2.0-0t64`、`libcups2t64`、`libatspi2.0-0t64`（[pkgs.org 证据](https://ubuntu.pkgs.org/24.04/ubuntu-main-amd64/libatspi2.0-0t64_2.52.0-1build1_amd64.deb.html)）；`libasound2` 在 noble 退化为 virtual package。本机 Ubuntu 22.04 `apt-cache policy libasound2t64` 无候选（清单原样同样失败）。
    3. 净效果：Ubuntu 24.04 上按文档命令执行，因 5 个包不存在整条 apt install 失败；Debian 12 上因 `libasound2t64` 不存在失败；Debian 13（trixie）与 noble 情况相同。
- 建议：把「Debian 12」改为「Debian 13（trixie）」；清单要么全部改用 t64 名（`libgtk-3-0t64`/`libatk1.0-0t64`/`libatk-bridge2.0-0t64`/`libcups2t64`/`libatspi2.0-0t64`/`libasound2t64`），要么按新旧发行版分列两组命令；删掉或修正「其余包名在新旧版一致」。

### t285_test_f002 - 新用例两轮导入同一值，restore 断言区分度不足

- 严重度：minor
- 锚点：行为缺陷——restore 分支「恢复旧值」语义未完全验证（覆盖可更广，非阻断）
- 位置：`tests/unit/main/cli/import-config.test.ts:268-313`（「重复导入且 save 失败…」用例，尤其 292-312）
- 问题：首轮与二轮导入同一 config、同一 `API_KEY` 值（`sk-live-secret`），二轮回滚条目为 restore 且旧值=新值。断言 `secrets["claude-1:API_KEY"]` 仍为 `sk-live-secret` 在三种实现下都通过：正确恢复旧值 / 回滚 no-op / restore 写入的是新值——只能捕获本 task 的核心回归（盲目 delete，`deleteMock` 断言兜底），无法证明 restore 恢复的确实是导入前旧值。AC-001 的可观察结果（不误删旧值）已覆盖，属断言强度扩展建议。
- 建议：二轮导入不同值（如 `sk-new-secret`）并 save 失败后断言 vault 值恢复为 `sk-live-secret`，即可完整区分 restore 语义。

## 结论

- 前轮 finding 复核：无（Round 1）
- 改测方向复核：无迁就实现的改测。`makeDeps` 的 `get` 由恒 `null` 改为内存读（`secrets[k] ?? null`）属系统边界存储模拟修正——新实现引入 get 驱动回滚分支，旧 mock 使 restore 分支不可达；改后 restore 分支可达，既有「首轮新建→delete」用例语义不变（首轮 secrets 空，get→null→delete 仍成立），8 个用例实测全绿。
- 本轮新发现：2 条（f001 important、f002 minor）
- 未进表的提示：
    - 循环中 `get` 抛错会在 save 前中断，此前已 set 的 key 不回滚（与既有 set 失败中段中断同类既有缺口，非本次引入，超出本 task 范围）。
    - apt 清单可直接对齐 Electron 官方 Ubuntu 运行时依赖表作为权威来源。
- 总体判断：测试路（AC-001）覆盖可信、无危险模式；但 AC-002 文档清单在所列发行版不可执行且 t64 说明事实错误，存在未解决 important。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-10 23:36 UTC+8)

### t285_test_f003 - 新用例引入非空断言，pnpm lint 在 --max-warnings=0 下失败

- 严重度：minor
- 锚点：测试代码门禁违规（项目 `lint` 脚本 `eslint ... --max-warnings=0`；非 AC 行为缺口）
- 位置：`tests/unit/main/cli/import-config.test.ts:306`
- 问题：新用例构造二轮导入文件时使用非空断言 `{ ...config.plugins[0]!, parameterValues: {...} }`，命中 `@typescript-eslint/no-non-null-assertion`。`pnpm lint` 退出码 1，共 4 errors：3 个为 baseline 既有（`scripts/repo_template/repo_task/view_static/board.js`、`chain_plan.js`、`tests/repo_template/test_chain_plan_cases.js` 的 Parsing error，文件存在于 diff_anchor，与 t285 无关），1 个为本行（本 task 引入）。baseline 测试文件无任何非空断言，属本轮新增。`pnpm typecheck` 干净。
- 建议：去掉非空断言——先对 `config.plugins[0]` 断言 `expect(...).toBeDefined()` 守卫后再引用，或改用无 `!` 的构造写法。

## 结论（Round 2）

- 前轮 finding 复核：
    - **t285_test_f001（important）：已消除。** 处置为两段式清单。新版段「Ubuntu 24.04+ / Debian 13+」6 个 t64 名逐个核实存在：noble 侧 packages.ubuntu.com 直接确认 `libasound2t64`（1.2.11-1ubuntu0.3）、`libgtk-3-0t64`（3.24.41-4ubuntu1.1）、`libcups2t64`（2.4.7-1.2ubuntu7.14）、`libatspi2.0-0t64`（2.52.0-1build1），`libatk1.0-0t64`/`libatk-bridge2.0-0t64` 经 gtk 依赖页（`dep:` 行）间接确认；trixie 侧 packages.debian.org 直接确认 `libasound2t64`（1.2.14-1）。非 t64 名在 noble 存在性：`libnss3`（2:3.98-1ubuntu0.2）直接确认，`libpango-1.0-0`/`libcairo2`/`libxkbcommon0`/`libxcomposite1`/`libxdamage1`/`libxfixes3`/`libxrandr2` 经 gtk 依赖页确认。旧版段「Ubuntu ≤22.04 / Debian ≤12」：本机 22.04 apt 缓存中 6 个去后缀名全部有候选（libgtk-3-0 3.24.33 / libasound2 1.2.6.1 / libatk1.0-0 / libatk-bridge2.0-0 / libcups2 / libatspi2.0-0），对应 6 个 t64 名全部无候选，表述成立。原错误点「Debian 12 用 t64 名」与「其余包名在新旧版一致」均已消除。
    - **t285_test_f002（minor）：已消除。** 二轮导入改用 `sk-second-secret`，save 失败后断言 vault 恢复 `sk-live-secret` 且 `deleteMock` 未调用。正确实现 / delete-all / no-op / restore 写新值四种实现产出可区分（`sk-live-secret` / undefined / `sk-second-secret` / `sk-second-secret`），断言只对正确实现通过，restore「恢复导入前旧值」语义完整验证，且未出现「换形式弱化」（同为 `toBe` 强断言）。
- 改测方向复核：无迁就实现的改测。`makeDeps` 的 `get` 恒 null → 内存读为 Round 1 已论证的存储模拟修正（新实现以 `get` 驱动回滚分支，修正后 restore 分支可达）；首轮「新建→delete」用例语义不变，8 用例实测全绿。
- 本轮新发现：1 条（t285_test_f003，minor）
- 未进表的提示：
    - `pnpm lint` 另有 3 个 baseline 既有的 repo_template .js Parsing error（`board.js`/`chain_plan.js`/`test_chain_plan_cases.js` 不在 tsconfig 工程内），仓库 lint 基线本就不干净，非 t285 引入，建议后续以 repo-template-sync 或 lint 范围调整清理。
    - AC-003 全量 `pnpm test` 未在本轮重跑（改动局限于单测试文件与 import-config 回滚分支）；单文件 8 passed + typecheck 干净已足够支撑本轮判定。
- 总体判断：前轮 important（f001）处置成立且文档事实全部独立核实；新用例断言强度达标、无危险模式；仅 1 条新增 minor（lint 非空断言）非阻断。
- 系统性 follow-up：无

verdict: PASS

## Round 3 (2026-08-10 23:40 UTC+8)

### 前轮 finding 复核

- **t285_test_f003（minor）— 已修，复核成立**。处置落位 `tests/unit/main/cli/import-config.test.ts:301-307`：`const plugin0 = config.plugins[0]; if (!plugin0) throw new Error("fixture 缺 plugin")` 守卫后以 `{ ...plugin0, parameterValues: { API_KEY: "sk-second-secret" } }` 构造二轮文件，原行 306 的 `!` 非空断言已移除。守卫为 fixture 恒真分支（config 字面量 plugins 内联非空），不改变测试语义；二轮不同值 + 回滚恢复旧值 + deleteMock 未调用（行 320-322）的区分度保持。验证：`pnpm exec eslint tests/unit/main/cli/import-config.test.ts src/main/cli/import-config.ts` → exit 0（0 error，f003 引入的 lint 错误消除）；`pnpm exec vitest run tests/unit/main/cli/import-config.test.ts` → 8 passed；`pnpm typecheck` → exit 0。

## 结论（Round 3）

- 前轮 finding 复核：f003 已修且复核成立，`plugins[0]!` 不再存在，`pnpm lint` 相关 errors 中本 task 引入项归零（baseline 3 个 repo_template Parsing error 与 t285 无关，维持 Round 2 判断）。
- 本轮新发现：无
- 总体判断：测试路 finding 全部处置闭环（f001 important / f002 / f003 均 已修），lint / 单测 / typecheck 全绿，无未解决项。
- 系统性 follow-up：无

verdict: PASS
