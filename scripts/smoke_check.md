# Packaged App Smoke Check

每次 `pnpm package` 后必须执行以下检查，确认产物可用。

前置（通篇适用）：工作目录 = 仓库根目录；`artifacts/win-unpacked/` 为 **Windows** 产物（macOS/Linux 对应 `*-unpacked/` 目录），须先 `pnpm package`。第 7 步会启动并控制常驻实例，可能触碰正在运行的实例——按 `docs/blueprint/testing.md`「用户干扰分级」须先取得用户明确许可。

## 检查步骤

1. **启动应用**

    - 运行打包产物（如 `./artifacts/win-unpacked/OmniPanel.exe`）
    - 确认无启动崩溃

2. **渲染进程**

    - 确认无白屏
    - 确认 Popup 窗口正常显示

3. **系统托盘**

    - 确认托盘图标出现
    - 左键点击确认 Popup 窗口弹出
    - 右键点击确认上下文菜单出现（设置 + 退出）
    - 点击"设置"确认 Settings 窗口弹出
    - 点击"退出"确认应用完全退出（无确认对话框，直接退出）

4. **Popup 窗口**

    - 确认标题显示 "OmniPanel"
    - 确认 Popup 显示连接器卡片或空状态
    - 确认刷新按钮可用
    - 确认设置按钮可跳转

5. **连接器账号加载**

    - 首次启动后确认已配置连接器账号自动创建
    - Popup 显示连接器用量卡片
    - Settings 显示连接器列表与账号配置

6. **Settings 功能**

    - 确认侧栏导航显示连接器列表
    - 确认选择连接器后显示参数表单
    - 确认保存按钮可点击

7. **CLI serve**

    - 用法：`omni_panel <子命令>`（单一二进制入口，无 `--cli` 前缀；`omni_panel` 指 PATH 中的打包产物或 `artifacts/*-unpacked/` 内可执行文件）。本步会启动/控制常驻实例，可能触碰运行实例，须先取得用户许可（见文首前置）。
    - 运行 `omni_panel serve`，确认无窗口常驻服务启动、无崩溃（默认后台，日志落 `<dataRoot>/logs/serve-<时间戳>.log`）
    - 通过 `omni_panel open` / `omni_panel refresh-all` 等子命令连接，确认返回可读结果
    - 导出配置：`omni_panel export [--include-secrets]`，确认输出可读配置
    - 停止服务：`omni_panel quit --port <n>`
    - Web 面板：`pnpm build:web` 后浏览器打开 `out/web/index.html`，确认用量/面板渲染正常

8. **退出**

    - 托盘菜单点"退出"，确认应用完全退出（无残留进程）
    - 确认无残留进程（app 托盘常驻：直接关窗口不会退出进程，仅隐藏）

## 快速命令

```bash
# Windows、仓库根目录下：打包并启动
pnpm package && ./artifacts/win-unpacked/OmniPanel.exe
```
