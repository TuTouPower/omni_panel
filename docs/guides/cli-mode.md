# CLI 模式运行指南

OmniPanel 默认是桌面托盘应用。CLI 模式让你在无界面环境（如 WSL 服务器、SSH 会话）以无窗口进程运行：命令行指定配置文件启动，进程只起 local-api 服务并打印 web 面板地址，你用浏览器访问用量面板。

## 前置依赖

Electron 需要 Linux 图形库。WSL 环境通常缺省不带显示服务器：

- 有 WSLg（`DISPLAY` 已设置，Windows 11 默认）：可直接运行。
- 无 WSLg（`DISPLAY` 未设置）：用 `xvfb-run` 包一层提供虚拟显示。

示例（无 WSLg）：

```bash
sudo apt install xvfb   # 一次性
xvfb-run -a omni-panel --cli serve --config ~/import.json
```

## 启动语法

```bash
omni-panel --cli serve [--config <path>] [--port <n>]
```

- `--cli`：CLI 模式总开关。
- `serve`：唯一子命令，无窗口常驻运行。
- `--config <path>`：可选。启动时把指定配置文件内容覆盖写入规范配置（`config.json`），并做 `.bak` 备份。配置文件是规范 config.json 形态，secret 参数（如 `API_KEY`）以明文内嵌于 `plugins[].parameterValues`；导入时明文 secret 转存加密 vault，落盘的规范配置只保留非 secret 参数与 `hasSecret` 标志。
- `--port <n>`：可选。覆盖 local-api 监听端口，优先级高于 `OMNI_PANEL_PORT` 环境变量。

不带 `--config` 时沿用现有规范配置。

## 启动输出与实例发现

启动成功后 stdout 打印面板地址：

```
OmniPanel CLI mode listening on http://localhost:18263/
```

同时把实例发现信息写入 `<dataRoot>/cli.json`：

```json
{
    "port": 18263,
    "url": "http://localhost:18263/",
    "userData": "/home/user/.config/OmniPanel",
    "pid": 12345,
    "startedAt": "2026-08-08T15:31:50.041Z"
}
```

瘦客户端（CLI 控制子命令）读取该文件取得端口，无需扫描进程。

## 浏览器访问

浏览器打开 stdout 打印的 URL 即可看到用量面板。local-api 监听 `0.0.0.0`，WSL 内可从 Windows 宿主以 `http://localhost:<port>/` 访问。

## 控制子命令（t276）

CLI 进程常驻。控制子命令（瘦客户端）经 local-api 作用于运行中实例，执行完即退出：

```bash
omni-panel --cli refresh-all     # 触发全部连接器刷新
omni-panel --cli pause           # 暂停自动刷新（幂等）
omni-panel --cli resume          # 恢复自动刷新
omni-panel --cli restart         # 重启实例（保持原 argv，端口可能因旧进程未释放而变化）
omni-panel --cli quit            # 干净退出实例
omni-panel --cli open            # 打印面板 URL，WSL 下尝试经 wslview 打开宿主机浏览器
omni-panel --cli autostart       # Linux 返回 unsupported；Windows 切换开机自启
```

- 实例发现：默认读 `<dataRoot>/cli.json` 取得端口；`--port <n>` 可覆盖（桌面/自建实例）。
- 实例未运行时给出「实例未运行」可读错误 + 非零退出码。
- 控制子命令与桌面 tray 菜单动作走同一份 main 侧能力，行为一致。
