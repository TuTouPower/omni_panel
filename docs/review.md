# Phase 3 Commit Review

## 范围

- Commits: `6623641^..777ee5d`
- 覆盖：IPC contract、IPC handlers、preload、Forge/Vite entry、main process、React renderer、组件、views、测试。

## 总体结论

Request changes。当前不能进入合并。

- 自动验证：`typecheck` 通过，`lint` 通过，`test` 通过；`pnpm make` 因本机缺 `rpmbuild` 失败。
- 主要问题不是类型或单测，而是主进程运行路径和未接入真实刷新服务。
- 发现 3 个 HIGH，2 个 MEDIUM。

## Findings

### HIGH

#### 1. Renderer 加载路径错误，生产/开发都可能无法打开页面

- 文件：`src/main/index.ts:51`
- 现状：`void win.loadURL(`../renderer/${cfg.route}`);`
- 问题：`loadURL` 需要有效 URL。这里传相对路径字符串，不是 Forge/Vite renderer dev server URL，也不是 packaged `index.html#route`。Phase 3 spec 要求共享 renderer bundle + hash route。
- 影响：dashboard/settings/popup 窗口可能白屏或加载失败。
- 建议：按 Electron Forge Vite 模板使用 renderer entry 常量，开发期加载 dev server，打包期加载 `index.html#${route}`。至少应改为 `loadFile(..., { hash: cfg.route })` 或 Forge 插件提供的 renderer URL。

#### 2. Popup 窗口创建后不会显示

- 文件：`src/main/index.ts:29`, `src/main/index.ts:41-52`, `src/main/index.ts:125-135`
- 现状：popup config 为 `show: false`，托盘点击只 `createWindowFor("popup")`，没有 `show()` / `showInactive()` / 定位逻辑。
- 问题：点击托盘后窗口被创建但保持隐藏。
- 影响：核心入口不可用。
- 建议：托盘点击时定位到 tray 附近并显式 `popupWin.show()`；再次点击再隐藏/关闭。

#### 3. 插件刷新 IPC 已注册，但实际刷新服务为空实现

- 文件：`src/main/index.ts:75-83`
- 现状：`refresh` / `refreshAll` 只是空 async 函数，注释写 “Will be wired”。
- 问题：`plugin:refresh` 和 `plugin:refreshAll` 返回成功，但不会执行插件刷新，也不会更新 runtime state。
- 影响：UI 的刷新按钮看似成功但无效果，错误被静默掩盖。
- 建议：接入现有 `PluginRefreshService` / scheduler 真实刷新路径；未接入前不要返回成功。

### MEDIUM

#### 1. `saveSecrets` 校验不完整

- 文件：`src/main/ipc/config-ipc.ts:82-99`
- 现状：只校验 payload 是 object 和插件存在；未校验插件是否 enabled，也未校验 `secrets` 是 plain object 且 values 为 string。
- 问题：spec 要求只保存已启用插件的 secret；当前 disabled 插件也可写入 secret store。
- 影响：边界行为不一致，错误输入不易诊断。
- 建议：补 `plugin.enabled` 校验；补 `secrets` shape/value 校验。非法 `paramName` 静默跳过符合 spec，可保留。

#### 2. `pnpm make` 在当前 Linux 环境失败

- 命令：`pnpm make`
- 结果：失败，缺少 `rpmbuild`。
- 原因：Forge maker-rpm 需要系统二进制。
- 影响：不是代码逻辑失败，但当前环境无法完成打包验证。
- 建议：CI 安装 rpm 构建依赖，或 Linux 本地验证时指定可用 maker target。

## Validation Results

| Check                         | Result                      |
| ----------------------------- | --------------------------- |
| Type check (`pnpm typecheck`) | Pass                        |
| Lint (`pnpm lint`)            | Pass                        |
| Tests (`pnpm test`)           | Pass — 17 files / 102 tests |
| Build/package (`pnpm make`)   | Fail — missing `rpmbuild`   |

## Files Reviewed

- `forge.config.ts` — modified
- `package.json` / `pnpm-lock.yaml` — modified
- `src/main/index.ts` — modified
- `src/main/ipc/config-ipc.ts` — added
- `src/main/ipc/event-ipc.ts` — added
- `src/main/ipc/helpers.ts` — added
- `src/main/ipc/plugin-ipc.ts` — added
- `src/preload/index.ts` — added
- `src/preload/usageboard-api.ts` — added
- `src/renderer/**` — added
- `src/shared/types/config.ts` — modified
- `src/shared/types/ipc.ts` — modified
- `tests/unit/ipc/*.test.ts` — added
- legacy entry files removed：`src/main.ts`, `src/preload.ts`, `src/renderer.ts`, `src/index.css`

## 最终判断

Request changes。先修 4 个 HIGH，再重跑 `pnpm typecheck && pnpm lint && pnpm test`，并补一次可用 target 的打包/启动验证。
