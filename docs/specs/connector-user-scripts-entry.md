# connector-user-scripts-entry

用户数据源脚本目录入口。让用户从「添加账号」弹窗一键打开 `userData/connectors` 目录，便于手动放入自定义 connector 脚本（为 connector-user-scripts 自定义支持提供入口）。

## 实现要点

- 弹窗 `AddAccountDialog.tsx` VendorPicker 内「打开脚本目录」按钮，点击调用 `window.usageboard.settings.openConnectorsDir()`。
- IPC 通道 `SETTINGS_OPEN_CONNECTORS_DIR = "settings:openConnectorsDir"`（settings 命名空间，因按钮位于 settings 窗口）。
- 主进程 handler 调 `open_connectors_dir`（`src/main/core/open-connectors-dir.ts`，纯函数 + 依赖注入）：
    - `mkdir(dir, { recursive: true })` 确保目录存在；失败记 warn（recursive:true 时 EEXIST 不抛，捕获到的均为真实失败）。
    - `shell.openPath(dir)` 打开文件管理器；返回非空错误字符串时记 warn。
- preload `settings_methods.openConnectorsDir` 暴露给 renderer；类型见 `UsageboardApi.settings.openConnectorsDir`。

## 验证方式

Desktop（IPC handler + Electron shell 副作用）。单元测试覆盖纯函数三路径；组件测试覆盖按钮渲染与点击。

## 非范围

- 不实现 connector 脚本编辑器（仅打开目录）。
- 不改 connector 加载/发现机制（`discover_connector_definitions` 已扫 user_dir）。
- 自定义脚本 schema 扩展与文档见 t095。
