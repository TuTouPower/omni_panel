# Task spec

## 背景

t035 测试实例靠 `TEST_INSTANCE` env + `OMNI_USAGE_PORT` env 运行时切换，但打包 exe 无 env 注入。需两套永久打包配置产出独立测试 exe（黄图标 + 17864 + 沙盒 userData + 区分窗口标题），不靠运行时手动设 env。

## 范围

- `electron-builder.test.yml`：独立测试打包配置
    - `productName: OmniUsage Test`（窗口/安装器名区分）
    - `appId: com.omniusage.app.test`（避免与正常 exe 注册表冲突）
    - `win.icon: assets/icon-test.ico`（PE 黄图标）
    - `extraResources`：`tray-icon-test.png` -> `tray-icon.png`、`icon-test.png` -> `icon.png`（同名打入，paths.ts 不需改）
    - `nsis.installerIcon`/`uninstallerIcon` 用 test 版
    - `directories.output: artifacts/test`（与正常产物分目录）
- `src/main/core/paths.ts`：新增 `is_test_build()`--读 `app.getName() === "OmniUsage Test"` 判定测试构建（不靠 env）
    - `get_app_icon_path`/`get_tray_icon_path`：测试构建读 resourcesPath 下 `icon.png`/`tray-icon.png`（已是黄，因 extraResources 映射）；返回名不变，逻辑简化（删 TEST_INSTANCE 分支，改 is_test_build 决定路径基）
    - 实际：测试 exe extraResources 把 `icon-test.png` 映射成 `icon.png`，所以 paths.ts 仍读 `icon.png`--**paths.ts 不用改图标逻辑**
- `src/main/core/local-api/server.ts`：`is_test_build()` 时默认端口 17864（而非 env 覆盖）
- `src/main/index.ts`：`is_test_build()` 时 userData 用 `OmniUsage Test`（Electron 默认按 productName 分目录），已在 packaged 下自动；dev 沿用 `.scratch/test-instance`
- `scripts/start-test.mjs`：保留 dev 模式（TEST_INSTANCE env for dev），packaged 测试 exe 不经此脚本
- `package.json`：加 `make:test:win`/`make:test:mac`/`make:test:linux` = `pnpm build && electron-builder --config electron-builder.test.yml --win` 等
- `assets/icon-test.ico`/`icon-test.png`/`tray-icon-test.png`（t035 已生成，复用）

## 非范围

- 不改正常 `electron-builder.yml`/`make:win`
- 不改 `paths.ts` 图标切换逻辑（extraResources 同名映射，无需切）
- dev 模式 start:test 保留 t035 现状

## 验收标准

- [ ] `electron-builder.test.yml` 产出 `OmniUsage Test` exe（黄 PE 图标）
- [ ] 测试 exe 启动：窗口标题含 Test、托盘黄图标、local-api 17864、userData 独立
- [ ] 正常 `pnpm make:win` 不受影响（蓝 exe 17863）
- [ ] 两 exe 可同时运行（端口/图标/userData 全隔离）
- [ ] pnpm test/typecheck 绿

## 依赖与约束

- assets/icon-test.\* 已存在（t035）
- 测试 exe 与正常 exe appId 不同避免 NSIS 注册表冲突
