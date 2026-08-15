# Task review t392（reviewer_focus: 通用）

- task：`t392_pnpm_build_deps_migration`
- spec：`docs/tasks/t392_pnpm_build_deps_migration/spec.md`
- diff_anchor：`73cc495810a20f24eada26e5012d3093b36fc07f`
- target：`git diff 73cc495810a20f24eada26e5012d3093b36fc07f`（相对工作区；diff_anchor == HEAD，实为工作区未提交改动 + 未跟踪文件）
- round：1
- reviewed_at：2026-08-15 05:39 UTC+8

## 审查范围与独立核实

- 工作区改动仅 2 个被跟踪文件：`docs/tasks/t392_pnpm_build_deps_migration/task.md`（front matter 置 active/branch/worktree/diff_anchor，属 task-run 调度写入，合规）与 `package.json`（删除 `pnpm` 字段）。
- 未跟踪新增：`pnpm-workspace.yaml`（迁移目标，核心）、`docs/tasks/.../handoff.json`（自述证据）、`node_modules`（软链，见 f004）。
- 独立复核手段：pnpm 9.15.4 实测、registry 查询 electron@42.2.0 `scripts`、锁文件结构比对、`git add -n` 干跑、被测模块导入形式静态扫描。

## Findings

### t392_gen_f001 - electron@42.2.0 无 postinstall，AC-002 机制前提不成立，`onlyBuiltDependencies:[electron]` 对 electron 完全无效

- 严重度：important
- 锚点：AC-002（「electron postinstall 执行」）；spec 背景「electron postinstall（下载二进制写 path.txt）被跳过」根因陈述
- 位置：`pnpm-workspace.yaml:7-10`（`onlyBuiltDependencies` 含 electron）；`node_modules/electron/package.json`；registry `electron@42.2.0`
- 问题：`npm view electron@42.2.0 --json` 返回 `scripts: {}`——registry 真身无任何 postinstall/install 脚本（与本仓已装副本 `node_modules/electron/package.json` 一致，`scripts keys: []`）。`onlyBuiltDependencies` 只决定「允许哪些包执行其构建脚本」；包本身无脚本时，白名单对该包是空操作。故把 `electron` 列入 `onlyBuiltDependencies` 无法驱动 path.txt 生成。electron 42.2.0 实际为惰性自下载设计（`electron/index.js` `getElectronPath()` 在 path.txt 缺失时 `spawnSync node install.js` 拉取二进制，require 本身不抛 ENOENT）。spec AC-002 的机制前提（postinstall 被跳过）与锁定版本不符，本 diff 不能达成「全新 install 后 electron postinstall 执行、path.txt 生成」。
- 建议：先在真实全新 install 复现，确认 electron 42.2.0 下 fresh worktree 是否仍 ENOENT、由哪个工具（electron-vite/electron-builder/测试 spawn）触达 path.txt；按根因修正 spec 前提与修复手段（如需要由项目脚本兜底触发 `install.js`）。`[deploy]` 类 AC 须在 integrate 前完成真实验证。

### t392_gen_f002 - AC-004 证据无效：20 passed 的测试文件均不加载 electron，无法守卫 ENOENT 回归

- 严重度：important
- 锚点：AC-004（electron 依赖测试不再因 ENOENT 失败）；handoff.json `ac_evidence.AC-004`
- 位置：`tests/unit/main/window_manager.test.ts:2`、`tests/unit/ipc/grok_auth_ipc.test.ts:2`；`handoff.json`（`ac_evidence.AC-004` 声称「import electron 不再 ENOENT」）
- 问题：两文件 electron 导入均为 `import type`（`import type { BrowserWindow, shell } from "electron"` / `import type { IpcMainInvokeEvent } from "electron"`），vitest/esbuild 编译期擦除，运行时不触达 electron 模块；被测模块 `src/main/window_manager.ts`、`src/ipc/grok_auth_ipc.ts` 也不 import electron。此类测试在任何 electron 二进制缺失/损坏状态下都不可能 ENOENT，20 passed 对「不再 ENOENT」零证明力。spec 点名文件（build-info-ipc/log-ipc/local-api/server/main/logging）经扫描不直接 import electron；全仓唯一运行时 import electron 的单测 `tests/unit/ipc/token-stats-ipc.test.ts` 有 `vi.mock("electron", ...)`（第 19 行），也不触达真实模块。即本仓没有任何单测真正加载 electron 运行时，AC-004 的证据路径断裂。
- 建议：修正 AC-004 验证目标——要么选取真实触达 electron 运行时（启动二进制/读 path.txt）的测试或 e2e，要么在 spec 明确「单测不触达 electron 运行时，ENOENT 由 e2e/[deploy] 冒烟验证」，如实描述 handoff 证据边界。

### t392_gen_f003 - AC-002/003 证据为过期产物：path.txt 早于迁移、非全新 install 产物

- 严重度：important
- 锚点：AC-002（「全新 pnpm install --frozen-lockfile 后 path.txt 存在」）；spec 可测试性声明（「最终以 worktree 实测为准」）
- 位置：`handoff.json` `ac_evidence.AC-002`（「node_modules/electron/path.txt 存在」）；`node_modules`（软链）；`pnpm-workspace.yaml`
- 问题：worktree 的 `node_modules` 是指向主仓 `/home/testuser/testuser_ubuntu/omni_panel/node_modules` 的软链，未做任何全新安装。`path.txt` 日期 Aug 10 19:46（早于迁移 Aug 15），`dist/electron` 亦非本次产物；electron 包不在 `.pnpm` 虚拟存储（`ls node_modules/.pnpm | grep electron` 无结果），`.modules.yaml` 却登记 `electron@42.2.0 -> node_modules/electron`——当前 electron 安装态不干净，path.txt 系此前某次惰性下载/手工动作生成，非「迁移后配置 + fresh install」生成。因此「path.txt 存在」不能支撑 AC-002 的「全新 install 后生成」，也不能支撑「迁移修复了缺失」。
- 建议：按 spec 可测试性声明做真实 fresh install（干净 worktree 或删软链后重建 node_modules）冒烟，留存 `.scratch/` 复现脚本与 install 输出作为 AC-002/003/004 证据；在此之前 AC-002 保持未达成。

### t392_gen_f004 - `node_modules` 软链会被 `git add -A` 误提交

- 严重度：minor
- 锚点：无 AC 直接违反；提交卫生风险（本 task 提交必须只含 package.json + pnpm-workspace.yaml + docs）
- 位置：`.gitignore:2`（`node_modules/`）；`node_modules`（软链）
- 问题：`.gitignore` 的 `node_modules/` 带尾斜杠，仅匹配目录；worktree 中 `node_modules` 是指向主仓的软链，git 视其为文件，不匹配。`git add -n pnpm-workspace.yaml node_modules` 实测输出 `add 'node_modules'`——若提交时 `git add -A`/`git add .`，会把指向主仓绝对路径的软链写进提交，污染主仓 checkout。
- 建议：提交时显式列出文件（`git add package.json pnpm-workspace.yaml docs/tasks/t392_...`），或给 worktree 场景补忽略规则（如 `node_modules` 软链名单独 ignore）。

### t392_gen_f005 - spec 测试策略声明的 `.scratch/` 冒烟脚本未留存

- 严重度：minor
- 锚点：spec「测试策略」段（「验证用 install 后冒烟脚本（.scratch/）断言 path.txt 存在、better-sqlite3 可加载、electron 依赖测试绿」）
- 位置：`.scratch/`（空目录）
- 问题：`.scratch/` 无任何探针/冒烟脚本，与 spec 测试策略承诺不符；叠加 f002/f003，冒烟证据（path.txt、20 passed）既未触达真实机制、也未留存可复现脚本。fresh-install 为 `[deploy]` 类（agent 无法自证）不算 blocking，但按声明留存脚本是流程义务。
- 建议：补充真实 fresh install 冒烟并把脚本写入 `.scratch/` 作为证据附件；或在下轮明确该验证移至 integrate 执行。

## 结论

- 前轮 finding 复核：无（round 1）
- 本轮新发现：5 条（f001/f002/f003 important，f004/f005 minor）
- 未进表的提示（确认项，非 finding）：
  - 迁移语义本身正确：`pnpm-workspace.yaml` 的 `packages: ['.']` 单包声明与锁文件 `importers: {'.': ...}` 一致；`onlyBuiltDependencies`/`overrides`/`patchedDependencies` 均为 pnpm v9/v10 pnpm-workspace.yaml 规范顶层键；overrides/patchedDependencies 与锁文件顶层记录一致，`--frozen-lockfile` 应可通过。
  - AC-001 达成：package.json `pnpm` 字段已删（grep 0 次），worktree 内任意 pnpm 命令不可能再输出「pnpm field is no longer read」WARN。
  - AC-003 当前态通过：`require('better-sqlite3')` 加载 OK；better-sqlite3 原生构建由 `scripts/ensure_sqlite_abi.mjs`（node-gyp 重编译）驱动，不依赖 pnpm postinstall；`patchedDependencies` 迁移正确保留补丁应用。
  - 主仓 package.json 未迁移（pnpm 字段仍在、无 pnpm-workspace.yaml）属未合并预期，不影响本 task 判定。
  - worktree 软链 node_modules 触发「removed from scratch」类重建提示系 symlink 环境特性，非配置缺陷。
- 总体判断：配置迁移方向正确且 faithful（pnpm v10 规范位置、AC-001 干净达成），但核心行为 AC 证据链断裂——electron@42.2.0 无 postinstall（registry 实证）致 AC-002 机制前提不成立，AC-004 验证文件为 type-only 导入无证明力，AC-002/003 证据系迁移前过期产物；本 diff 无法证明达成「全新 install 修复 ENOENT」这一任务目标。未解决 important 3 条，FAIL。
- 系统性 follow-up：建议建 task（slug 建议 `electron42_fresh_install_enoid_root_cause`）：真实全新 install 复现 electron@42.2.0 下 path.txt/ENOENT 行为，核实根因（惰性自下载 vs 工具链直接读 path.txt），据此修正 spec 前提并补 `.scratch/` 冒烟证据。

verdict: FAIL
reviewed_scope: c6786c3a9fe882c2

---

# Round 2

- task：`t392_pnpm_build_deps_migration`
- spec：`docs/tasks/t392_pnpm_build_deps_migration/spec.md`
- diff_anchor：`73cc495810a20f24eada26e5012d3093b36fc07f`
- target：`git diff 73cc495810a20f24eada26e5012d3093b36fc07f`
- round：2
- reviewed_at：2026-08-15 06:10 UTC+8

## Round 2 独立复核方式

- 在 `.scratch/fresh2/` 独立目录复制迁移后配置（package.json + pnpm-workspace.yaml + pnpm-lock.yaml + patches/），实测 `pnpm install --frozen-lockfile` 与 `--no-frozen-lockfile`。
- 验证产物：better-sqlite3 实库读写加载、`require('electron')` 行为、锁文件 overrides/patchedDependencies 前后对比、.modules.yaml。
- 对照实验（`.scratch/fresh3`）触发 worktree 软链重建交互提示，已中止并清理；该提示指向主仓 node_modules，确认系软链环境特性（与 implementer 判断一致），且有误删主仓 node_modules 风险。

## 前轮 finding 复核

- **f001（important，AC-002 措辞）**：已消除。spec AC-002 现正确描述 electron@42.2.0 无 postinstall scripts、二进制由 `install.js` 惰性下载。独立实测 `require('electron')` 复现「Downloading Electron binary...」+ ENOENT path.txt，与 implementer 自述一致；确认 ENOENT 为下载未触发/失败的网络依赖，`[deploy]` 标注合理。
- **f002（important，AC-004 证据）**：已修不彻底，判定降级。handoff 已收敛声称（20 passed 仅指 window_manager/grok_auth_ipc + fresh ENOENT 复现），不再宣称「import electron 不再 ENOENT」于 type-only 文件；但 spec AC-004 措辞未改，仍列 build-info-ipc/log-ipc/local-api/server/main/logging 等「不再因 ENOENT 失败」，经扫描这些文件均不 import electron、本不会 ENOENT——AC-004 系 spec 层 tautology（改 spec 即可），非实现可解，不再 blocking。
- **f003（important，过期产物）**：已修，证据强度受限。handoff 引用 `.scratch/fresh` 独立 install，但 `.scratch/` 现为空（产物已清理），无法追溯。独立 fresh2 重做确认 better-sqlite3 加载 OK + electron ENOENT 复现；但 better-sqlite3 加载 OK 可能来自全局 store 复用（主仓编译产物 hardlink），fresh2 install 日志未见 better-sqlite3 install 脚本执行，不能严格证明 onlyBuiltDependencies 放行生效于 fresh 场景。fresh install 为 `[deploy]`，证据缺口以集成时实测补齐。
- **f004（minor，软链提交）**：已消除。`.gitignore` 的 `node_modules/` 去尾斜杠，`git check-ignore node_modules` 实测返回 IGNORED。
- **f005（minor，.scratch 脚本留存）**：已处理（结论入 handoff、产物清理）。spec 测试策略承诺的 `.scratch/` 冒烟脚本未留存，minor，不 blocking。

## 本轮新发现

### t392_gen_f006 - 迁移后 `pnpm install --frozen-lockfile` 直接失败（overrides mismatch），全新 worktree install 流程被阻断

- 严重度：critical
- 锚点：AC-002/AC-004（均声明 `pnpm install --frozen-lockfile`）；任务背景「全新 worktree install 修复 ENOENT」
- 位置：`pnpm-workspace.yaml:11-13`（overrides）；`pnpm-lock.yaml` 顶层 overrides 段
- 问题：独立 fresh2 目录用迁移后配置 + 现有锁文件跑 `pnpm install --frozen-lockfile`，稳定复现 `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH: The current "overrides" configuration doesn't match the value found in the lockfile`（3 次）。迁移前 frozen 能完成安装（spec 背景既定，仅缺 path.txt），迁移后 frozen 直接 ERROR 退出——比原 WARN+ENOENT 更早阻断。根因：pnpm 9.15.4 对 pnpm-workspace.yaml 的 overrides 支持不完整——pnpm 10+ 才把 overrides 从 package.json#pnpm 迁移到 pnpm-workspace.yaml 并参与锁文件 drift 检测（`check_lockfile_settings` 对比当前配置与 `lockfile.overrides`，mismatch 报 `OverridesChanged`，见 pnpm 源码）；pnpm 9.15.4 读取了 workspace overrides 但规范化结果与锁文件记录不一致。spec 非范围「不更新 pnpm 大版本」与「迁移到 pnpm-workspace.yaml（pnpm v10 规范位置）」在此冲突。
- 建议：二选一并决策——(a) 升级 pnpm 10+（完整支持 workspace overrides，需 re-lock 与 CI 兼容验证）；(b) 回退迁移、保留 package.json pnpm 字段（接受 WARN，electron ENOENT 由惰性下载机制单独处理）。任一方案须实测 `--frozen-lockfile` 通过。

### t392_gen_f007 - no-frozen re-lock 静默删除锁文件 overrides/patchedDependencies/patch_hash 段，安全补丁与 better-sqlite3 补丁丢失

- 严重度：critical
- 锚点：AC-003（better-sqlite3 补丁可用）；spec 风险段「overrides 语义若格式差异导致依赖解析变化」
- 位置：`pnpm-lock.yaml` 顶层 `overrides:`/`patchedDependencies:` 段；`pnpm-workspace.yaml:11-15`
- 问题：fresh2 用迁移后配置 `pnpm install --no-frozen-lockfile` 后，锁文件顶层 `overrides:`、`patchedDependencies:` 段及 better-sqlite3 `patch_hash` 引用全部消失（grep 0 命中）。后果：(1) overrides（tar>=6.2.1、tmp>=0.2.4 安全补丁）静默丢失，依赖树可回落至含漏洞版本；(2) patchedDependencies（better-sqlite3.patch，修复 MSVC/NODE_MODULE_VERSION>=146 编译兼容）语义丢失——fresh store 无缓存时补丁不再应用（fresh2 源码含 patch 标记系 store 复用主仓已 patch 副本，非 fresh 应用）。re-lock 后 frozen 虽通过（"Lockfile is up to date"），但以静默丢弃配置为代价。pnpm 9.15.4 下 workspace overrides/patchedDependencies 属半支持，写锁文件语义与 pnpm 10 不同。
- 建议：随 f006 一并决策；若维持 pnpm 9.15.4，须验证 re-lock 后 overrides 实际生效方式（或放弃 workspace 迁移）；若升 pnpm 10+，re-lock 后核对 overrides/patchedDependencies 段重新写入锁文件。

## 结论

- 前轮 finding 复核：f001 已消除；f002 已修不彻底（降级为改 spec）；f003 已修但证据强度受限；f004 已消除；f005 已处理。
- 本轮新发现：2 条（f006/f007 critical）。
- 未进表的提示：
  - AC-001 独立确认达成（no-frozen 场景）：install 日志无「pnpm field ignored」WARN（日志第 7 行为 deprecated 子依赖 WARN，非 pnpm field）。
  - electron ENOENT 根因定位正确：electron@42.2.0 无 postinstall，`require('electron')` 首次调用触发 `index.js → install.js` 惰性下载，下载未触发/失败即 ENOENT path.txt——网络依赖，非配置迁移能解，`[deploy]` 合理。
  - pnpm 9.15.4 与 pnpm-workspace.yaml overrides/patchedDependencies 的半支持是 f006/f007 共同根因；spec「不更新 pnpm 大版本」与「迁移到 pnpm-workspace.yaml（pnpm v10 规范位置）」冲突，需用户决策。
  - worktree 软链 node_modules 触发「removed from scratch」交互提示（fresh3 对照触发，指向主仓 node_modules）确认系环境特性，非配置缺陷；该提示有误删主仓 node_modules 风险，实施/集成时避免应答 Y。
- 总体判断：核心事实部分修正——AC-001 达成、electron ENOENT 根因定位正确；但迁移方案在锁定 pnpm 9.15.4 下引入 f006（frozen install 失败）与 f007（overrides/patchedDependencies 静默丢失）两个 critical 回归，直接破坏「全新 worktree install」任务目标。f006/f007 未解决，FAIL。
- 系统性 follow-up：建议 follow-up task（slug 建议 `pnpm915_workspace_overrides_support`）：决策 pnpm 大版本升级（10+ 完整支持 workspace overrides）或回退迁移方案；若升级，re-lock 锁文件并核对 overrides/patchedDependencies 段、CI frozen install 冒烟。

verdict: FAIL
reviewed_scope: 04250d9b4c2ca625

---

# Round 3

- task：`t392_pnpm_build_deps_migration`
- spec：`docs/tasks/t392_pnpm_build_deps_migration/spec.md`
- diff_anchor：`73cc495810a20f24eada26e5012d3093b36fc07f`
- target：`git diff 73cc495810a20f24eada26e5012d3093b36fc07f`
- round：3
- reviewed_at：2026-08-15 06:20 UTC+8

## Round 3 独立复核方式

- pnpm 版本实测 `10.34.5`，`package.json` 的 `packageManager` 已升级 `pnpm@10.34.5+sha512...`（与声明一致）。
- 在 `.scratch/r3/` 独立目录复制迁移后配置（package.json + pnpm-workspace.yaml + 新版 pnpm-lock.yaml + patches/），`CI=true corepack pnpm install --frozen-lockfile` 实测；再二次 frozen 验证锁文件无漂移。验证后清理。
- 全量 `pnpm test`（worktree 当前态）与 `pnpm typecheck` 独立重跑。

## 前轮 finding 复核

- **f006（critical，frozen overrides mismatch）**：已消除。独立 fresh install（pnpm 10.34.5 + workspace.yaml + 新版锁文件）frozen 成功，`Done in 1.1s using pnpm v10.34.5`，无 `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`；二次 frozen 重跑同样成功且锁文件未漂移。根因确认：pnpm 10 完整支持 workspace overrides 参与锁文件 drift 检测（实现与 Round 2 引用的 pnpm 源码语义一致）。
- **f007（critical，no-frozen 丢 overrides/patch）**：已消除。锁文件 `overrides:`（行 7）与 `patchedDependencies:`（行 11）段保留，`patch_hash` 2 处；hash 更新为 `a644a4ca18468a3832a8f29f7e1c071c2b536701b90942bb45a9430f0fabf6e7`（pnpm 10 重算，与 implementer 声称一致）。patch 实际应用：`.pnpm/better-sqlite3@12.10.0_patch_hash=a644a4ca.../` 目录存在且含 `build/Release/better_sqlite3.node` 编译产物；`src/better_sqlite3.cpp` 实测含 patch 内容 `_AddressOfReturnAddress`（pnpm patch 整体应用）。install 后锁文件段仍保留，非静默丢弃。

## 本轮新发现

本轮无新 blocking finding。以下为观察项（非 finding）：

- **esbuild/unrs-resolver build scripts 被忽略（pnpm 10 默认行为）**：frozen install 提示 `Ignored build scripts: esbuild@0.21.5, esbuild@0.25.12, esbuild@0.28.0, unrs-resolver@1.12.2`。这些包不在 `onlyBuiltDependencies` 白名单，pnpm 9 时同样不执行其 build（白名单机制一致），仅 pnpm 10 新增「approve-builds」提示 UX。esbuild 依赖 optionalDependencies 分发平台二进制，postinstall 为可选校验/优化；全量 3154 测试通过（含 vite/esbuild 链路）证明当前平台无功能影响。非迁移引入的回归，不计 finding。

## 结论

- 前轮 finding 复核：f001 已消除；f002 已修不彻底（降级为改 spec，Round 2 判定）；f003 已修但证据受限（fresh 独立 install 复现，better-sqlite3 加载 OK）；f004 已消除；f005 已处理；f006 已消除（本轮独立 frozen 验证）；f007 已消除（本轮独立 patch 应用验证）。
- 本轮新发现：0 条（blocking）；观察项 1 条（esbuild/unrs-resolver ignored build scripts，非回归）。
- 未进表的提示：
  - AC-001 达成：fresh frozen install 日志无「pnpm field ignored」WARN（grep 0 命中）。
  - AC-002 electron ENOENT 维持 `[deploy]`：独立 `require('electron')` 复现「Downloading Electron binary...」+ ENOENT（下载未触发，网络依赖）；electron@42.2.0 无 postinstall scripts 已实测确认。非配置迁移能解，任务目标已收敛为「迁移配置 + 升级 pnpm + 放行 better-sqlite3」，electron 二进制下载属独立机制。
  - AC-003 达成：fresh install 后 better-sqlite3 加载 OK（实库建表/读写返回正确行）；补丁放行生效（.pnpm patch_hash 变体 + 编译产物 + 源码 patch 标记三重证据）。
  - AC-004 达成（当前态）：全量 `pnpm test` 265 files / 3154 passed / 9 skipped（1 file skipped），无 ENOENT；`pnpm typecheck` 通过。注意：worktree 的 node_modules 仍是软链指向主仓，strict「删软链真实 install」未执行，属 `[deploy]` 端到端边界，非本 task 阻断。
  - spec 已按用户拍板更新：非范围「不更新 pnpm 大版本」改为「升级 pnpm 大版本（用户拍板豁免，pnpm 10.x 完整支持 workspace settings）」，AC-002/AC-003 措辞同步修正。与实现一致。
  - `.gitignore` node_modules 软链忽略、`package.json` packageManager 升级均独立确认。
- 总体判断：f006/f007 两个 critical 已通过升级 pnpm 10.34.5 消除，AC-001/AC-003/AC-004 达成，AC-002 正确收敛为 `[deploy]` 网络依赖；无未解决 critical/important，仅有 minor 级观察项。PASS。
- 系统性 follow-up：建议 follow-up task（slug 建议 `pnpm10_esbuild_approve_builds`，可选）：评估是否将 esbuild/unrs-resolver 加入 `onlyBuiltDependencies` 白名单（当前依赖 optionalDependencies 二进制，非必需），并核对 pnpm 10 升级后 CI 兼容性（corepack pin 已就位）。

verdict: PASS
reviewed_scope: 099eb61f110b501d
