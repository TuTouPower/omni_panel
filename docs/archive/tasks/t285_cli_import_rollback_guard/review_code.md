# Task review t285（reviewer_focus: 代码）

- task：`t285_cli_import_rollback_guard`
- spec：`docs/tasks/t285_cli_import_rollback_guard/spec.md`
- diff_anchor：`43d55051af9ca47bf541f7e745f52f75886097f2`
- target：`git diff 43d55051af9ca47bf541f7e745f52f75886097f2`
- round：1
- reviewed_at：2026-08-10 23:20 UTC+8

## Findings

### t285_code_f001 - 新用例断言强度不足：restore 与「跳过回滚」不可区分

- 严重度：minor
- 锚点：AC-001 覆盖强度（测试路）
- 位置：`tests/unit/main/cli/import-config.test.ts:268`（「重复导入且 save 失败时回滚保留导入前已存在的 vault 值」用例）
- 问题：二轮重复导入使用与首轮完全相同的 secret 值 `sk-live-secret`，回滚后断言 `secrets["claude-1:API_KEY"]` 仍为该值。该配置下「恢复旧值（restore 分支）」与「save 失败时什么都不做（跳过回滚）」两种实现产出的可观测结果相同——若实现退化为 no-op 回滚，本用例仍通过。当前断言只能区分「删除」（旧实现的 delete-all 会被捕获），无法证明 restore 分支真实执行。测试触达生产逻辑（`get` 从内存 mock 读已写入值，二轮 `get` 返回首轮值，走 `action: "restore"` 分支），非假绿，仅强度不足。
- 建议：二轮导入文件改用不同值（如 `sk-live-secret-v2`），断言回滚后 vault 值为首轮旧值 `sk-live-secret`（而非 v2）。这样同时覆盖「不误删」与「恢复旧值」两个语义，且对 delete-all、no-op、restore 三种实现给出不同结果。

### t285_code_f002 - 文档 t64 过渡说明发行版标注错误

- 严重度：minor
- 锚点：AC-002（apt 清单可执行性核对）
- 位置：`docs/guides/cli-mode.md:44`
- 问题：注称「`libasound2t64` 是 Debian 12 / Ubuntu 24.04+ 的 t64 过渡包名」。t64 过渡属 Debian 13 (trixie) 与 Ubuntu 24.04+；Debian 12 (bookworm) 及更早仍使用 `libasound2`，不存在 `libasound2t64` 包。在 Debian 12 上原样执行清单会 `apt` 报 `Unable to locate package libasound2t64`，与该注「旧发行版用 libasound2」自相矛盾（Debian 12 被误划入 t64 新发行版）。主目标平台（Ubuntu 24.04 WSL）可执行性不受影响。
- 建议：改为「Debian 13 / Ubuntu 24.04+」，旧发行版侧示例可补 `libasound2`。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
    - 文件行数：`src/main/cli/import-config.ts` 133、`tests/unit/main/cli/import-config.test.ts` 314、`docs/guides/cli-mode.md` 109，均远低于阈值，不触发文件过大。
    - 复杂度：回滚循环为单层 if/else 转发，无超限函数。
    - 范围外观察（非本 diff 引入，不阻断）：
        1. 转存循环（`src/main/cli/import-config.ts:82-88`）内 `get`/`set` 抛错（如 vault 读盘失败）会中断循环且不触发回滚，留下本次已转存的孤儿 secret。旧实现 `set` 抛错同样泄露，属既有 AC8 覆盖外边界。
        2. schema 未禁止重复 `instanceId`（`src/main/core/config/types.ts:37` 无唯一性 refine）；同一 import 内同 key 写两次时，回滚按序执行可能残留本次导入的中间值。畸形输入下的 contrived 场景。
        3. 回滚每步 `.catch(() => undefined)` 静默吞错（沿用旧模式），restore 失败时旧值无法恢复且无日志；可考虑 `log.warn`。
- 总体判断：回滚语义正确（新建→delete、覆盖→restore 旧值），get 前置与 vault 脱敏/所有权约束一致，既有「无残留」用例语义保持，新用例可捕获被修复的 delete-all 回归；2 条 minor 均非阻断。
- 系统性 follow-up：无

verdict: PASS

## Round 2 (2026-08-10 23:31 UTC+8)

### 前轮 finding 复核

- **t285_code_f001（minor）— 已修**。证据：`tests/unit/main/cli/import-config.test.ts:268-323`。二轮导入文件改 `sk-second-secret`（行 306），回滚后断言 vault 恢复首轮旧值 `sk-live-secret`（行 321），并断言 `deleteMock` 未以 `claude-1:API_KEY` 调用（行 322）。三种实现可区分：restore → 恢复旧值（断言通过）；delete-all（旧 bug）→ 值被删 + deleteMock 命中，两断言均失败；no-op → 残留 `sk-second-secret`，行 321 失败。生产 restore 分支真实触达：`makeDeps` 的 `get` 改为读内存 mock（diff 中 `tests/...:64`），二轮 `get` 返回首轮值 → `import-config.ts:87` 走 `action: "restore"`。`pnpm exec vitest run tests/unit/main/cli/import-config.test.ts` → 8 passed。
- **t285_code_f002（minor）— 已修**。证据：`docs/guides/cli-mode.md:24-47`。清单已两段化：Ubuntu 24.04+ / Debian 13+ 用 t64 名，旧发行版（Ubuntu ≤22.04 / Debian ≤12）去 t64 后缀。事实抽查：noble 侧 6 个 t64 包（`libgtk-3-0t64` `libasound2t64` `libatk1.0-0t64` `libatk-bridge2.0-0t64` `libcups2t64` `libatspi2.0-0t64`）在 packages.ubuntu.com 全部存在（HTTP 200）；trixie 侧抽查 3 个 t64 包存在（packages.debian.org 200）；本机 Ubuntu 22.04 实测 6 个 t64 名 apt-cache 均 NOT FOUND，而非 t64 名（`libgtk-3-0` 等 6 个）全部存在——与两段划分吻合。旧发行版段列出的去后缀包与 t64 段带后缀包一一对应，无遗漏。

### 本轮新发现

### t285_code_f003 - 新用例非空断言违反 eslint error 级规则（f001 处置引入）

- 严重度：minor
- 锚点：工具链门禁（`pnpm check` 含 lint；lint-staged 提交钩子），非 AC 违反
- 位置：`tests/unit/main/cli/import-config.test.ts:306`
- 问题：`{ ...config.plugins[0]!, parameterValues: { API_KEY: "sk-second-secret" } }` 的 `!` 非空断言触发 `@typescript-eslint/no-non-null-assertion`（项目 lint 配 `--max-warnings=0`，error 级）。Round 1 同用例无 `!`，此错误为 f001 处置（改用不同值构造二轮文件）时引入。验证：`pnpm run lint` 报 `306:26 error Forbidden non-null assertion`。后果可观测：lint-staged 对 `*.{ts,tsx}` 跑 `eslint --fix`，提交本文件时被拦截；合并前 `pnpm check`（typecheck + lint + ...）失败。功能与测试正确性不受影响（8 passed、typecheck 干净）。
- 建议：最小修复——取 `config.plugins[0]` 为局部变量后做存在性断言（或改用 `as` 类型断言），避免 `!`。例如构造二轮文件时 `const first = config.plugins[0]!` 仍不行，需 `if (!first) throw new Error("unreachable")` 之类，或直接用首轮同源插件对象复制。

## 结论

- 前轮 finding 复核：f001 已修（断言可区分 restore/delete-all/no-op，restore 分支真实触达，8 passed）；f002 已修（两段清单与 noble/trixie/jammy 三方事实核对一致）。
- 本轮新发现：1 条（t285_code_f003，minor）
- 未进表的提示：
    - 文件行数：`src/main/cli/import-config.ts` 133、`tests/unit/main/cli/import-config.test.ts` 324、`docs/guides/cli-mode.md` 113，均低于阈值。
    - 复杂度：回滚循环单层 if/else 转发，无超限函数。
    - 范围外观察（pre-existing，非本 task diff 引入，不阻断）：`pnpm run lint` 全量另报 3 个 Parsing error——`scripts/repo_template/repo_task/view_static/board.js`、`chain_plan.js`、`tests/repo_template/test_chain_plan_cases.js` 不在 tsconfig project service / allowDefaultProject 内。模板工具链既有状态，与本 task 无关。
- 总体判断：f001/f002 处置均成立且已核实；仅 1 条 minor 新问题（lint 规则违反，一行修复），无未解决 critical / important。
- 系统性 follow-up：无

verdict: PASS

## Round 3 (2026-08-10 23:40 UTC+8)

### 前轮 finding 复核

- **t285_code_f003（minor）— 已修，复核成立**。处置落位 `tests/unit/main/cli/import-config.test.ts:301-307`：`config.plugins[0]` 先取局部变量 `plugin0`，`if (!plugin0) throw new Error("fixture 缺 plugin")` 存在性守卫，构造二轮文件改用 `...plugin0` 展开，原 `!` 已消除。fixture 的 config 为内联字面量（行 272-288，plugins 恒非空），throw 为 unreachable 守卫，语义与 `!` 等价且不再触发 `@typescript-eslint/no-non-null-assertion`；f001 断言语义（二轮 `sk-second-secret` → 回滚恢复 `sk-live-secret` + deleteMock 未调用，行 320-322）保持原样未弱化。验证：`pnpm exec eslint tests/unit/main/cli/import-config.test.ts src/main/cli/import-config.ts` → exit 0（0 error）；`pnpm exec vitest run tests/unit/main/cli/import-config.test.ts` → 8 passed；`pnpm typecheck` → exit 0。

## 结论（Round 3）

- 前轮 finding 复核：f003 已修且复核成立，处置形式与 Round 2 建议一致（局部变量 + 存在性守卫），lint 门禁恢复通过。
- 本轮新发现：无
- 总体判断：全量 finding 处置闭环（f001/f002/f003 均 已修），lint / 测试 / typecheck 三项门禁全绿，无未解决项。
- 系统性 follow-up：无

verdict: PASS
