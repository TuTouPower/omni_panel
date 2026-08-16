# CLI 模式运行指南

OmniPanel 默认是桌面托盘应用。CLI 模式让你在无界面环境（如 WSL 服务器、SSH 会话）以无窗口进程运行：命令行指定配置文件启动，进程只起 local-api 服务并打印 web 面板地址，你用浏览器访问用量面板。

## 前置依赖

Electron 需要 Linux 图形库。WSL 环境通常缺省不带显示服务器：

- 有 WSLg（`DISPLAY` 已设置，Windows 11 默认）：可直接运行。
- 无 WSLg（`DISPLAY` 未设置）：用 `xvfb-run` 包一层提供虚拟显示。

示例（无 WSLg）：

```bash
sudo apt install xvfb   # 一次性
xvfb-run -a omni-panel serve --config ~/import.json
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

安装后可用 `omni-panel serve --config ~/import.json` 直接验证；仍报缺库时按
报错的 `.so` 名用 `apt-file search` 定位对应包。

## 启动语法

```bash
omni-panel serve [--config <path>] [--port <n>]   # 默认后台运行
omni-panel serve --foreground [--config <path>] [--port <n>]  # 前台阻塞
```

- 命令行默认是 CLI 模式：`omni_panel serve` 等价于旧 `omni_panel --cli serve`（launcher 自动注入 `--cli`）。`--cli` 前缀仍兼容。
- 帮助（t400）：`omni_panel`（无参）/ `--help` / `-h` / `help` 四入口输出**同一份**帮助（含 `--gui` 与全部子命令）；真相源 `scripts/cli_help.mjs`。`omni_panel --cli help` 与上述一致（主进程打印同一常量）。help 不启动任何进程。
- `--gui`：启动图形界面（双击桌面图标同效），非 CLI。
- `serve`：唯一常驻子命令，无窗口常驻运行。**默认后台运行**：命令打印面板地址后立即返回，服务在后台继续（stdout/stderr 落 `<dataRoot>/logs/serve-<时间戳>.log`），可用 `omni-panel quit --port <n>` 停止。
- `--foreground`：可选。显式指定前台运行——打印面板地址后阻塞终端，`Ctrl+C` 停止（旧行为）。
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
omni-panel refresh-all     # 触发全部连接器刷新
omni-panel pause            # 暂停自动刷新（幂等）
omni-panel resume           # 恢复自动刷新
omni-panel restart          # 重启实例（保持原 argv，端口可能因旧进程未释放而变化）
omni-panel quit             # 干净退出实例
omni-panel open             # 打印面板 URL，WSL 下尝试经 wslview 打开宿主机浏览器
omni-panel autostart        # Linux 返回 unsupported；Windows 切换开机自启
```

以上命令等价于旧 `omni-panel --cli <子命令>`（launcher 自动注入 `--cli`）。

- 实例发现：默认读 `<dataRoot>/cli.json` 取得端口；`--port <n>` 可覆盖（桌面/自建实例）。
- 实例未运行时给出「实例未运行」可读错误 + 非零退出码。
- 控制子命令与桌面 tray 菜单动作走同一份 main 侧能力，行为一致。

## 开发/测试启动 vs 全局 CLI（重要：不要用 `pnpm start` 开窗口）

`pnpm start` 是 **GUI 开发模式**（`electron-vite dev`）——必然打开 Electron 窗口，且 dev server 与 Electron 生命周期耦合：dev server 退出后 Electron 仍存活但加载不到 renderer，窗口白屏（2026-08-12 实测踩坑）。**开发/测试启动一律走无窗口 CLI 模式**：

```bash
pnpm cli:serve    # 开发/测试无窗口实例：沙盒 userData（.scratch/dev-serve）+ 端口 17864
pnpm cli:quit     # 停掉该实例（瘦客户端，--port 17864 对齐）
```

`pnpm cli:serve` 内部：ensure ABI → gen build-info → `electron-vite build` → `electron out/main/index.js --cli serve --port 17864 --user-data-dir=.scratch/dev-serve`。沙盒 userData 保证**不触碰真实用户数据**（`~/.config/OmniPanel`）；开发构建只写 `out/`。

### 全局命令 `omni_panel`（release 产物专用）

全局 CLI 命令名 `omni_panel`（下划线），由 `scripts/omni_panel.mjs` launcher 提供，**永远指向 electron-builder 打包产物**（`artifacts/linux-unpacked/omni_panel`，`pnpm make:linux` 生成），**不回退 dev 产物（`out/`）**：

- 全局用户：`omni_panel serve [--port <n>]`（**真实用户数据** `~/.config/OmniPanel`）——稳定版，不受开发构建影响。`--gui` 显式开图形界面。
- release 产物缺失时 launcher 明确报错「先 `pnpm make:linux`」，不回退。
- 全局命令始终使用真实用户数据（可用 `--user-data-dir` 显式指向其他目录）；**沙盒只属于开发命令** `pnpm cli:serve`（`.scratch/dev-serve`）。
- 开发/测试不要用 `omni_panel`（它是给全局稳定版用户的），用 `pnpm cli:serve`。

### 产物与数据隔离矩阵

| 用途          | 命令                   | 产物                    | userData                         | 窗口             |
| ------------- | ---------------------- | ----------------------- | -------------------------------- | ---------------- |
| GUI 开发      | `pnpm start`           | `out/`（dev）           | 真实                             | 开窗口（调试用） |
| 开发/测试 CLI | `pnpm cli:serve`       | `out/`（build）         | `.scratch/dev-serve` 沙盒        | 无               |
| 全局稳定版 CLI | `omni_panel serve ...` | `artifacts/`（release） | 真实（`--user-data-dir` 可覆盖） | 无               |
| 全局 GUI      | `omni_panel --gui`     | `artifacts/`（release） | 真实                             | 开窗口           |

开发（改 `out/`）与全局（用 `artifacts/`）产物隔离，互不影响；`pnpm make:linux` 打包新稳定版后全局自动用新版本。
