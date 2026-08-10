# Task review t288（reviewer_focus: 通用）

- task：`t288_cli_control_restart_relaunch_reap`
- spec：`docs/tasks/t288_cli_control_restart_relaunch_reap/spec.md`
- diff_anchor：`d7cdbb7b87fc4aff81e7698e1bd6f19454298499`
- target：`git diff d7cdbb7b87fc4aff81e7698e1bd6f19454298499`
- round：1
- reviewed_at：2026-08-11 00:05 UTC+8

## Findings

### t288_gen_f001 - reap 超时残留静默，无「仅记录」可观测信号

- 严重度：minor
- 锚点：上下文区「风险与回退」声明「teardown 失败仅记录不阻塞测试结论」；行为缺陷场景：relaunch 进程对 SIGTERM 3s 未响应时残留不可见
- 位置：`tests/e2e/electron/cli_control.spec.ts:109-114`
- 问题：等待循环 3s 后若 `pids()` 仍有残留，helper 直接返回：无 SIGKILL 兜底（spec 测试策略建议「等待退出（超时 SIGKILL）」）、无任何日志或失败信号。残留进程继续监听端口时，当前 run 内已无后续用例暴露（AC3 是最后一个用 18811 的用例），只能等下一轮串行 run 以 EADDRINUSE / waitHealth 超时形式爆发，且无日志可归因。同理 `execFileSync("pgrep")` 抛错（ENOENT/权限）时 catch 返回 `[]`，同样无任何记录。spec 风险区的「仅记录」承诺未落实。
- 建议：等待超时后对残留 pid 补 SIGKILL 兜底（与 spec 测试策略一致），或至少输出一行可观测标记（e.g. `console.warn` 残留 pid 列表）；pgrep 异常分支同样记录而非纯静默。

### t288_gen_f002 - pgrep 无平台守卫，Windows 上静默 no-op（假绿路径）

- 严重度：minor
- 锚点：无对应 AC 在可运行环境的失败（当前 Linux/WSL 实测满足）；平台假设未显式声明
- 位置：`tests/e2e/electron/cli_control.spec.ts:88`
- 问题：`execFileSync("pgrep", ...)` 依赖 procps，Windows 无此命令 → ENOENT → catch → `[]` → helper 静默失效。`nightly.yml` full-test 矩阵含 `windows-2022` 且运行 `pnpm test:e2e:electron`（cli_control.spec.ts 所在 electron project）。本文件自 t276 起即 Linux-only（`ELECTRON = resolve(ROOT, "node_modules/electron/dist/electron")` 无 `.exe`，Windows 上 electron.launch 在 pgrep 之前即失败），故本次不新增可观测破坏；但同 project 其它 17 个 spec 是跨平台的（如 `main_panel_window_modes.spec.ts:35` 已有 `process.platform` 守卫先例），一旦将来修复 ELECTRON 路径使该文件可在 Windows 运行，reap 将静默假绿且 AC-002 不满足。建议在 helper 内加平台守卫（非 Linux 时显式跳过并记录），或在文件头注释声明 Linux-only。
- 建议：`if (process.platform !== "linux") return;` 前带可观测记录；或文件头注释说明该 spec 依赖 Linux 工具链（pgrep、无 .exe 的 electron 路径）。

## 结论

- 前轮 finding 复核：Round 1，无。
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
    - AC-001/002 在测试内无端口/进程直接断言，验收依赖 teardown 回收逻辑正确性 + AC-003 三轮串行间接回归（残留监听 18811 会使下一轮 `waitHealth(18811)` 失败而变红）。spec 可测试性声明与测试策略已批准该设计，未出 finding；收尾 handoff 的 `ac_evidence` 须记录三轮验证证据。
    - `cli_control.spec.ts` / `cli_serve.spec.ts` 硬编码无 `.exe` 的 electron 路径，Linux-only 为 t276 既存事实（本次 diff 未改变），超出本 task 范围。
    - 本文件既有 helper（`httpJson`/`waitHealth`/`launchServe`/`closeServe`/`runThinClient`/`subscribeEvents`/`waitCliJson`）为 camelCase，违反 `docs/blueprint/conventions.md`「变量、函数一律 snake_case」；本次新增 `reap_user_data_dir_processes` 符合规范，正确，未出 finding。
    - task.md 实施笔记区为「无」但本 task 有实质实施与三轮验证；收尾前应补关键验证记录与 handoff.json。
    - 复验：本机 lint（单文件 eslint，0 警告）与 `pnpm typecheck` 通过；`pgrep -f` 匹配/无匹配/排除自身语义已实测（execFileSync 无 shell 包装，测试 runner 命令行不含运行时生成的 userDataDir，无误杀路径）；`artifacts/e2e-artifacts/.last-run.json` 记录 last passed。AC-003 三轮串行通过来自调度方观测，本轮未复跑（避免与主仓全量单测资源竞争）。
- 总体判断：回收语义正确、无误杀、SIGTERM + 3s 等待在当前 Linux 环境实测充分，AC-001/002/003 均满足；两处 minor 均为加固/可观测性缺口，不阻断。
- 系统性 follow-up：建议「CLI e2e 平台可运行性声明与 Windows 适配」，slug `cli_e2e_platform_runtime`，不阻断（minor）。

verdict: PASS

## Round 2 (2026-08-11 00:02 UTC+8)

复核对象：`git diff d7cdbb7b87fc4aff81e7698e1bd6f19454298499`（相对工作区，含 Round 1 后实施方修复）。

### 前轮 finding 复核

- **t288_gen_f001（minor，SIGKILL 兜底缺失）**：已消除。`cli_control.spec.ts:111-124` 等待循环后新增 SIGKILL 兜底：`remaining = pids()` 在 while 内每次轮询重取（`cli_control.spec.ts:116`），超时后对 `remaining` 逐个 `process.kill(pid, "SIGKILL")` 并吞掉「已退出」异常（`cli_control.spec.ts:118-124`）。主建议（spec 测试策略「等待退出（超时 SIGKILL）」）落实。残余：f001 附带建议「pgrep 异常分支记录而非静默」未做（`cli_control.spec.ts:100-102` catch 仍返回 `[]` 无日志），属 minor 内加固细节，不影响回收正确性；f002 平台守卫落实后其实际影响进一步收窄（非 win32 直接 return），不阻断、不再单独出 finding。
- **t288_gen_f002（minor，pgrep 无平台守卫）**：已消除。`cli_control.spec.ts:87` helper 顶部 `if (process.platform === "win32") return;`，注释 `:84` 声明「仅 Linux（pgrep 依赖 /proc）；cli e2e 本就 Linux-only（ELECTRON 无 .exe）」，守卫 + 声明均落实，符合 Round 1 建议。

### 本轮新发现

- 0 条。修复未引入新问题：`execFileSync` import（`:3`）已使用无残留；reap 调用仅加于 AC1 组合用例（`:230`，quit 后无 relaunch，安全 no-op）与 AC3（`:264`）两个 finally，均在 `closeServe` 后、`rmSync` 前，顺序正确；AC3 断言（pid 变化 + health）完成后才 reap，无 spec 风险区所述竞争；pgrep 按唯一 `mkdtempSync` 目录匹配，不误杀其它用例。

### 验证

- `pnpm exec eslint tests/e2e/electron/cli_control.spec.ts`：0 错误 0 警告。
- `pnpm typecheck`：通过（exit 0）。
- AC3 restart 用例单独实跑（`npx playwright test --config=playwright.config.ts --project=electron tests/e2e/electron/cli_control.spec.ts -g "AC3：restart 后"`）：1 passed。
- 残留抽查：跑后 `ss -tlnp | grep 18811` 无监听；`pgrep -af "out/main/index.js"` 无 electron 进程（仅命中检查命令自身 bash 命令行），relaunch 进程已全部退出。

### 未进表的提示

- task.md 处置表 fix_ref 行号（f001 `:84`、f002 `:72`）与最终代码行（守卫 `:87`、SIGKILL 兜底 `:118-124`）不一致，疑为修复中间行号；指向同一 helper，无实际危害，仅提示实施方收尾时如愿意可对齐。
- Round 1 结论段已提示的「收尾前补实施笔记与 handoff.json ac_evidence」仍有效（task.md 实施笔记为「无」，需补三轮验证记录）。

- 总体判断：f001/f002 处置均成立，未引入新问题，AC-001/002/003 复核满足；无未解决 critical / important。
- 系统性 follow-up：同 Round 1（`cli_e2e_platform_runtime`，不阻断）。

verdict: PASS
