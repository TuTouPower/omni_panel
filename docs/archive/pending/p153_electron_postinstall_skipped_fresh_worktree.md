# p153 全新 worktree pnpm install 跳过 electron postinstall，electron 测试全挂

- 现象：task 用 `task.py start` 创建全新 worktree 后 `pnpm install --frozen-lockfile`，electron 包缺 `node_modules/electron/path.txt`，所有 import electron 的测试文件启动即崩（`Error: ENOENT open .../node_modules/electron/path.txt`，见 `getElectronPath`）。主仓（旧 install）有 path.txt，测试正常。
- 影响：每个 task worktree 的首轮测试运行都会遇到 10 个左右 electron 依赖测试文件失败（本次 t338：build-info-ipc/log-ipc/local-api/server/main/logging/main_panel_controller/window-bounds/cli/client/session-history×3），全是环境失败非逻辑失败；会干扰 task 测试判断与 review。
- 根因：`package.json` 的 `pnpm.onlyBuiltDependencies: [better-sqlite3, electron, electron-winstaller]` 被当前 pnpm 忽略——每次 pnpm 命令都输出 `[WARN] The "pnpm" field in package.json is no longer read by pnpm... ignored: pnpm.onlyBuiltDependencies`（pnpm 9.15.4 已按 v10 规则只读 `pnpm-workspace.yaml`，不读 package.json 的 pnpm 字段）。electron 的 postinstall（下载二进制并写 path.txt）因此在全新安装中被跳过；better-sqlite3 同理可能受影响。分类：环境/工具链问题。
- 已扫同类位点：同一机制（onlyBuiltDependencies 被忽略 → 构建依赖 postinstall 跳过）覆盖 `better-sqlite3`（native module，依赖 prebuild 下载，全新 install 可能缺）与 `electron-winstaller`；已确认 electron 一处，better-sqlite3/electron-winstaller 待确认（若 better-sqlite3 用 node-gyp 现场编译则不受影响）。
- 修复方向（供决策）：把 `onlyBuiltDependencies`/`overrides`/`patchedDependencies` 迁移到 `pnpm-workspace.yaml`（pnpm v10 规范位置），或固定 pnpm 到仍读 package.json pnpm 字段的版本；迁移后所有依赖方重新 install 验证 electron path.txt 生成。
- 测试缺口：无现有测试覆盖「全新安装后 electron postinstall 是否执行」；补测为 CI/worktree 验收脚本断言 `node_modules/electron/path.txt` 存在，或安装后用 `npx electron --version` 冒烟。
- 线索：`.scratch/electron_probe/`（t338 期间验证：worktree 缺 path.txt、主仓有；`node node_modules/electron/install.js` 单独跑也不写 path.txt）
- 处理：t392
