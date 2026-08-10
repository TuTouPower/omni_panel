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

### Electron GUI 运行时依赖（apt）

Electron 主进程（含 CLI 模式，无窗口也会加载图形栈）需要以下运行时库，缺失时启动报
`error while loading shared libraries` 或静默崩溃。

**Ubuntu 24.04+ / Debian 13+**（t64 过渡包名）：

```bash
sudo apt install \
  libgtk-3-0t64 \
  libnss3 \
  libasound2t64 \
  libatk1.0-0t64 \
  libatk-bridge2.0-0t64 \
  libcups2t64 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libpango-1.0-0 \
  libcairo2 \
  libatspi2.0-0t64
```

**旧发行版（Ubuntu ≤22.04 / Debian ≤12）**：同上清单去掉 `t64` 后缀（`libgtk-3-0`
`libasound2` `libatk1.0-0` `libatk-bridge2.0-0` `libcups2` `libatspi2.0-0`）。

安装后可用 `omni-panel --cli serve --config ~/import.json` 直接验证；仍报缺库时按
报错的 `.so` 名用 `apt-file search` 定位对应包。

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

### 网页登录与 Cookie 回退

- 认证交互（grok/kimi device-code OAuth、cookie 类连接器网页登录）在 web 设置页内完成；grok/kimi 在页面内展示授权 URL 与码，cookie 类连接器（mimo、opencode_go）点击「网页登录」会在桌面侧弹出可见登录窗，捕获成功后密钥落 vault 并自动刷新。
- 无图形显示环境（如无 WSLg 的 WSL）捕获无法发起，会给出可读错误；此时在设置页「Cookie 字符串」输入框手动粘贴浏览器登录后复制的完整 Cookie 再保存即可，两种方式共用同一保存链路。
- 已知降级：web/headless 下无静默 cookie 续期，Cookie 过期后需重新登录或重新粘贴；登录窗口打开期间勿刷新页面（未落 vault 的捕获结果会丢失）。

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
