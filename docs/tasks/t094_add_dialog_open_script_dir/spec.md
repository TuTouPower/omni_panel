# Task spec

## 背景

用户希望在添加账号弹窗中加一个按钮，一键打开数据源脚本目录（`userData/connectors`），让用户可以在此目录添加自定义 connector 脚本。

后端已支持用户 connector 目录（`getUserConnectorsDir()` = `userData/connectors`，`discover_connector_definitions` 已扫 user_dir），但前端无入口暴露此目录。

参考项目：https://github.com/router-for-me/CLIProxyAPI

## 范围

- `AddAccountDialog.tsx`：在弹窗底部或"常用服务"网格后加"打开脚本目录"按钮。
- 新增 IPC 通道 `shell:openConnectorsDir`（主进程 `shell.openPath(getUserConnectorsDir())`）。
- preload 暴露 `usageboard.shell.openConnectorsDir()`。
- 按钮点击后系统文件管理器打开 `userData/connectors` 目录。
- 目录不存在时自动 mkdir。

## 非范围

- 不实现 connector 脚本编辑器（仅打开目录）。
- 不改 connector 加载机制。

## 验收标准

- [ ] 添加账号弹窗有"打开脚本目录"按钮。
- [ ] 点击后系统文件管理器打开 `userData/connectors` 目录。
- [ ] 目录不存在时自动创建。
- [ ] `pnpm test` / `pnpm typecheck` 全绿。

## 依赖与约束

- Electron `shell.openPath` API。
- 与 t095（自定义 connector 支持）协同。
