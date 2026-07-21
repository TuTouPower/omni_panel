# Task review t030（reviewer_focus: 文档+代码）

- task：`t030_build_info_inject`
- spec：`spec.md`（同目录相对路径）
- diff_anchor：`0167f66`
- target：`git diff 0167f66` + 未跟踪新文件 `scripts/gen-build-info.ts` / `src/generated/build-info.ts` / `src/main/ipc/build-info-ipc.ts` / `tests/unit/ipc/build-info-ipc.test.ts`
- round：1
- reviewed_at：2026-07-21 17:10 UTC+8

## Findings

### t030_code_f001 - `.gitignore` 未加 `src/generated/`，违反 spec 验收标准

- 严重度：critical
- 位置：`.gitignore`（整文件未出现 `generated`）
- 问题：spec 第 15 行明确 `…gitignore：加 src/generated/`，验收标准第 28 行 `[ ] src/generated/ 在 .gitignore，不入库`。实际：
    1. `git diff 0167f66 -- .gitignore` 空 diff，未追加任何 entry；
    2. `src/generated/build-info.ts` 当前状态 `??`（未跟踪），一旦 task commit 落地，该文件会以占位形式永久入库；
    3. `pnpm build` 执行 `tsx scripts/gen-build-info.ts` 会原地覆写 `src/generated/build-info.ts`（`scripts/gen-build-info.ts:22`），导致 working tree 永远 dirty，且每次 branch/commit 变动都会把新 build-info 带入下一次 commit，与 spec「不入库」直接冲突。
       后果：开发期任何 build 之后 `git status` 都会报 `src/generated/build-info.ts` modified；打包产物里的 branch@commit 反而成了仓库内容；task 关于「识别电脑上运行的是哪次打包」的初衷被破坏（仓库内的占位值会被真实值污染）。
- 建议：
    1. `.gitignore` 追加一行 `src/generated/`；
    2. 由于当前文件尚未入库，不需 `git rm --cached`；保留 `src/generated/build-info.ts` 作为 untracked dev 占位即可；
    3. 为避免 dev 启动前文件不存在导致 TS 解析失败，`dev` 脚本前同样插一次 `tsx scripts/gen-build-info.ts`（或保留当前 untracked 占位靠其存在），并在 plan/log 里记录权衡。

### t030_code_f002 - `build-info-ipc.ts` 使用 `await import("electron")` 动态导入，与兄弟 IPC 模块风格不一致

- 严重度：minor
- 位置：`src/main/ipc/build-info-ipc.ts:20-22`
- 问题：同目录 `popup-ipc.ts:1`、`event-ipc.ts`、`grok_auth_ipc.ts` 均在文件顶部静态 `import { ipcMain, type IpcMainInvokeEvent } from "electron"`；本文件单独走 `const { ipcMain } = await import("electron")`，且 `registerBuildInfoIpc` 因此被声明为 `async`，调用方 `src/main/index.ts:359` 被迫加 `await`。无功能必要性（main 进程顶部 electron 已可同步导入），徒增风格漂移与调用点复杂度。
- 建议：改为静态 `import { ipcMain, type IpcMainInvokeEvent } from "electron"`，函数签名回到同步 `registerBuildInfoIpc(getVersion: () => string): void`，调用点去掉 `await`，与 `registerGrokAuthIpc` / `registerPopupIpc` 对齐。

### t030_code_f003 - renderer `useEffect` 静默吞错，与同文件日志约定不一致

- 严重度：minor
- 位置：`src/renderer/views/SettingsView.tsx:715-724`
- 问题：同文件第 39 / 102 行已建立 `const log = createLogger("renderer:settings-view")`，其他异步路径（如 127 / 130 行）都用 `log.error(...)` 记录。此处的 `.catch(() => { /* dev fallback … */ })` 空体吞掉所有异常（包括 IPC 断言失败、preload 未暴露等非预期错误）。违反 CLAUDE.md「日志优先，禁止 print/console.log 调试输出」反向要求——这里是「无日志」。dev 环境下 preload 抛错或 channel 未注册时无任何线索，排查成本高。
- 建议：`.catch((err) => log.warn("buildInfo load failed", { err }))`；保留 fallback 行为（`build_info` 维持 `null`，UI 渲染空串）。

### t030_code_f004 - `gen-build-info.ts` execSync 失败兜底为 `"unknown"` 无任何告警

- 严重度：minor
- 位置：`scripts/gen-build-info.ts:5-10`
- 问题：`run()` 捕获所有异常后返回字符串 `"unknown"`；若打包环境 git 缺失或不在仓库内（CI shallow clone / 非 git 镜像），最终产物会是 `unknown@unknown`，但 stdout 仅打印 `build-info: unknown@unknown`，CI 日志里与正常输出几乎不可区分。spec 第 35 行「gen 脚本失败时写占位让 dev 能跑」的意图是 dev 兜底，而不是让打包静默接受 unknown。无 severity 提升，但建议补 stderr 警告便于诊断。
- 建议：catch 分支 `process.stderr.write("warning: git command failed: " + cmd + "\n")` 后再返回 `"unknown"`；打包日志中一眼可见。

### t030_code_f005 - `gen-build-info.ts` 输出路径硬编码相对路径

- 严重度：minor
- 位置：`scripts/gen-build-info.ts:22` `writeFileSync("src/generated/build-info.ts", …)`
- 问题：依赖进程 CWD 是项目根。`package.json` 的 `build` 脚本以仓库根执行不会触发，但任何 monorepo / 子目录调用都会写到错误位置且无报错。其他脚本（如 `scripts/e2e/gen_fixture.mjs`）多用 `import.meta.dirname` 相对推导。
- 建议：`writeFileSync(fileURLToPath(new URL("../src/generated/build-info.ts", import.meta.url)), …)` 或等价 `path.resolve` 写法；同时 `run()` 命令加 `{ cwd: project_root }` 以防 git rev-parse 在错误目录执行。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：5 条（1 critical，4 minor）。
- 总体判断：IPC 主路径、preload 三处 case、SettingsView 展示、类型定义、单元测试均按 spec 落地，功能闭环；但 spec 验收标准第 4 条「`src/generated/` 在 .gitignore，不入库」完全未达成——该目录未忽略，占位文件未入库即将随 commit 跟踪，build 脚本覆写后仓库永久 dirty。这是 spec 硬约束，必须修复后方可 done。其余 minor 为风格与可观测性建议。

verdict: FAIL

## Round 2 (2026-07-21 17:35 UTC+8)

- 触发：implementer 按 Round 1 adoption 处置修订后复核。
- 复核方式：`git diff 0167f66 -- <file>` + 未跟踪新文件直接 Read。

### Round 1 finding 复核

#### t030_code_f001 — 已修

- `.gitignore` 追加 `src/generated/`（diff 第 10 行后插入）。`git ls-files src/generated/` 输出空，确认占位文件未入库；物理文件仍存在作为 dev/test 解析垫底，符合 Round 1 建议 #2。
- `package.json`：`start` 与 `build` 均在前插 `tsx scripts/gen-build-info.ts`（`start`: ensure_electron_abi → gen → dev；`build`: gen → electron-vite build → vite web）。保证 dev/build/import 解析链均不读陈旧占位。

#### t030_code_f002 — 已修

- `src/main/ipc/build-info-ipc.ts:1` 改为静态 `import { ipcMain, type IpcMainInvokeEvent } from "electron"`。
- `registerBuildInfoIpc(getVersion: () => string): void` 同步签名，内部直接 `ipcMain.handle(...)`。
- `src/main/index.ts:359` 调用 `registerBuildInfoIpc(() => app.getVersion())`，无 `await`，与兄弟 IPC 模块风格一致。

#### t030_code_f003 — 已修

- `SettingsView.tsx:720-722`：`.catch((err: unknown) => { log.warn("加载 build info 失败，关于段不显示 branch@commit", err); })`，使用同文件已有的 `log = createLogger("renderer:settings-view")`，保留 UI fallback 行为。

#### t030_code_f004 — 已修

- `scripts/gen-build-info.ts:11-13`：catch 分支 `process.stderr.write("[gen-build-info] ${cmd} 失败，回退 "unknown": ${String(err)}\n")` 后返回 `"unknown"`。CI 日志中与正常 `build-info: branch@commit` stdout 行可区分。

#### t030_code_f005 — 修不彻底（非阻塞）

- 已修部分：`scripts/gen-build-info.ts:5-6` 改为 `const repo_root = resolve(__dirname, ".."); const out_path = resolve(repo_root, "src/generated/build-info.ts");`，不依赖进程 CWD。`__dirname` 在 tsx（CJS，`package.json` 无 `"type": "module"`）下可用，与建议中 `import.meta.dirname` / `fileURLToPath(new URL(...))` 等价。
- 未修部分：`execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] })` 未传 `{ cwd: repo_root }`。若调用方将 CWD 切到非仓库根，`git rev-parse` 可能返回错误仓库的信息且无报错。
- 风险评估：脚本仅由 `pnpm start` / `pnpm build` 触发，npm/pnpm 默认将 CWD 设为 `package.json` 所在目录，实际路径与 `repo_root` 一致，现实风险极低。不升级为 important，不阻塞 done。

### 本轮新发现

无新 critical / important / minor finding。

- 扫描项：`__dirname` 可用性（CJS，✅）、`vi.mock` 路径与源码 import 路径一致性（`../../../src/generated/build-info` vs `"../../generated/build-info"` 规范化后同一物理文件，✅）、占位文件内容（`branch: "t030_build_info_inject", commit: "0167f66"`）被 `.gitignore` 阻止入库，仅作 dev fallback，✅、`build` 链路新增 tsx 进程开销（轻微，非问题）。

### 结论

- 5 条前轮 finding：4 条完全修复（f001 critical + f002/f003/f004 minor），1 条核心已修、次要建议未采纳（f005 minor，风险低）。
- 修复未引入新 critical / important 问题。
- spec 验收标准第 4 条（`src/generated/` 在 .gitignore，不入库）已达成。

verdict: PASS
