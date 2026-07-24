# Task review t094（reviewer_focus: 代码）

- task：`t094_add_dialog_open_script_dir`
- spec：`docs\tasks\t094_add_dialog_open_script_dir/spec.md`
- diff_anchor：`b4f7c9c3601fe4dde23750321873cac163cd6df0`
- target：`git diff b4f7c9c3601fe4dde23750321873cac163cd6df0`
- round：1
- reviewed_at：2026-07-24 01:20 UTC+8

## Findings

### t094_code_f001 - mkdir catch 吞掉真实错误后仍调用 openPath，失败状态不一致

- 严重度：important
- 位置：`src/main/index.ts:757-762`
- 问题：新 IPC handler 用 `fs.mkdir(dir, { recursive: true })` 创建目录，catch 块空实现，注释写「目录可能已存在，忽略」。但 `recursive: true` 时 EEXIST 本就不抛错——catch 实际吞掉的是 EACCES（权限拒绝）/ ENOSPC（磁盘满）/ ENAMETOOLONG / 父路径不存在等真实失败。吞错后紧接着 `void shell.openPath(dir)`，若目录未创建成功，openPath 会失败（返回错误字符串），而 `void` 又把返回值丢弃。结果：用户点按钮无反馈、无日志、文件管理器不开，三个环节串行静默。违反「swallowed errors / 失败状态不一致」。
    - 复现场景：userData 父目录权限不可写，或磁盘满 → mkdir 抛 EACCES/ENOSPC → catch 吞掉 → openPath 在不存在的路径上失败 → 用户什么都没看到。
- 建议：最小修复——mkdir 的 catch 区分 EEXIST（虽本不抛）与其它错误；真实失败时 `log.error` 记录并 return，不再调用 openPath。或更简：让 mkdir 错误自然冒泡，由 ipcMain 的统一错误兜底转成 reject，preload 侧可决定是否提示。

### t094_code_f002 - async 函数内用 `await import(...).then(...)` 混合 promise 风格

- 严重度：minor
- 位置：`src/main/index.ts:758`
- 问题：`await import("node:fs/promises").then((fs) => fs.mkdir(dir, { recursive: true }))` —— 外层已是 async 函数，混用动态 import + `.then` 链既无懒加载收益（主进程入口早已加载 node 内置模块），也不符合本文件静态 import 风格（line 15 已有 `import { existsSync } from "node:fs"`）。可读性差。
- 建议：顶部加 `import { mkdir } from "node:fs/promises";`，handler 内直接 `await mkdir(dir, { recursive: true });`。

### t094_code_f003 - `shell.openPath` 失败返回值被 `void` 丢弃，用户无反馈

- 严重度：minor
- 位置：`src/main/index.ts:762`
- 问题：`shell.openPath` 返回 `Promise<string>`，空串表示成功，非空串为错误信息。`void` 丢弃后用户点击按钮若 openPath 失败（路径不存在、被安全软件拦截、平台无文件管理器），无日志、无提示。与 line 753 `void shell.openExternal` 风格一致，但 openExternal 是 URL，失败语义不同；openPath 在「打开目录」这一动作上失败概率更高（依赖前置 mkdir 成功）。
- 建议：捕获 openPath 返回值，非空串时 `log.warn` 记录。若要用户可见反馈，需经 IPC 回传 renderer 弹 toast（超出本 task 范围可标遗留）。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：3 条（1 important + 2 minor）。
- 总体判断：AC 覆盖到位（按钮、IPC、mkdir、openPath 链路打通），但 mkdir 的 catch 吞真实错误 + openPath 失败值丢弃，使失败路径全链路静默，不满足 spec「目录不存在时自动创建」在异常场景下的可观测性，需修 f001。

verdict: FAIL

## Round 2 (2026-07-24 02:10 UTC+8)

### 前轮 finding 复核

- **t094_code_f001（important）**：已修。`src/main/core/open-connectors-dir.ts:22-33` 抽出 `open_connectors_dir` 纯函数 + `OpenConnectorsDirDeps` 依赖注入接口；mkdir 包 try/catch，失败 `log.warn` 并带错误字符串；openPath 返回值接 `open_err`，非空时 `log.warn`。`src/main/index.ts:757-766` handler 接线，注入 `mkdir`/`open_path`/`log`。失败路径全程可观测，不再静默。
- **t094_code_f002（minor）**：已修。`src/main/index.ts:16` 顶部静态 `import { mkdir } from "node:fs/promises";`，handler 内直接 `await mkdir(p, { recursive: true })`，不再 `await import().then()`。
- **t094_code_f003（minor）**：已修。`open-connectors-dir.ts:29-32` 接住 `shell.openPath` 返回的错误字符串并 `log.warn`。

### 本轮新发现

无。

复核扫描覆盖：新增 `open-connectors-dir.ts`（33 行，远低 400 阈值；`open_connectors_dir` CC≈3，远低 10）；`main/index.ts` handler、`preload/index.ts`、`AddAccountDialog.tsx`、`shared/types/ipc.ts` 改动均与 Round 1 修复一致，无回归。`can_add = () => true` 去掉未用参数属合理 lint 清理；`open_connectors_dir` 在 mkdir 失败后仍尝试 openPath 是合理设计（recursive:true 时 EEXIST 不抛，真实失败时由 openPath 二次 warn 兑现可观测性，日志冗余可忽略）。

### 结论

- 前轮 finding：3 条全部已修。
- 本轮新发现：0 条。
- 总体判断：Round 1 全部修复到位，失败路径可观测、无回归、无新问题。

verdict: PASS
