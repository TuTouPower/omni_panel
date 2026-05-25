# Packaged App Smoke Check

每次 `pnpm package` 后必须执行以下检查，确认产物可用。

## 检查步骤

1. **启动应用**
    - 运行打包产物（如 `./out/OmniUsage-win32-x64/OmniUsage.exe`）
    - 确认无启动崩溃

2. **渲染进程**
    - 确认无白屏
    - 确认 Popup 窗口正常显示（E2E 模式）

3. **系统托盘**
    - 确认托盘图标出现
    - 右键确认菜单项（仅"退出"）
    - 左键点击确认 Popup 窗口弹出

4. **Popup 窗口**
    - 确认标题显示 "OmniUsage"
    - 确认 Popup 显示插件卡片或空状态
    - 确认刷新按钮可用
    - 确认设置按钮可跳转

5. **插件自动加载**
    - 首次启动后确认插件实例自动创建
    - Popup 显示插件卡片
    - Settings 显示插件列表

6. **Settings 功能**
    - 确认侧栏导航显示插件列表
    - 确认选择插件后显示参数表单
    - 确认保存按钮可点击

7. **退出**
    - 右键托盘 → 退出
    - 确认进程完全退出，无残留

## 快速命令

```bash
# 打包并启动
pnpm package && ./out/OmniUsage-win32-x64/OmniUsage.exe
```
