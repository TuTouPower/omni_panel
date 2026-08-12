# Spike report

## 问题

`process.platform` 在各宿主上的实际取值，以及 `path.join`/`path.win32.join` 分隔符行为——为 t308 平台感知路径层（host×env 分离）确定实现依据。

## 成功判据

- 确认 `process.platform` 在本机（Linux）返回 `linux`；Windows 宿主预期返回 `win32`（Node 文档）。
- 确认 `path.join` 用本机分隔符（POSIX `/`），`path.win32.join` 用 `\`，适合在 Linux 上构造 UNC 路径。
- 确认 UNC 构造 `\\wsl.localhost\{distro}\home\{user}\...` 可用 `path.win32.join` 表达。

## 尝试

- `node -e` 实测本机 `process.platform`、`path.sep`、`path.join`（POSIX）、`path.win32.join`（Windows 分隔符）与 UNC 拼接，见 `code/probe.mjs`。

## 证据

- `platform: linux`（本机）；`sep: /`；`join(os.homedir(), '.claude', 'projects')` → `/home/testuser/.claude/projects`。
- `path.win32.join('C:\\Users\\test', '.claude', 'projects')` → `C:\Users\test\.claude\projects`。
- `path.win32.join('\\\\wsl.localhost\\Ubuntu', 'home', 'testuser', '.claude', 'projects')` → `\\wsl.localhost\Ubuntu\home\testuser\.claude\projects`。
- `path.win32` 模块在 Linux 上可用且只影响分隔符与盘符语义，不触文件系统。
- Windows 宿主 `process.platform === 'win32'` 为 Node 既定契约（`process.platform` 文档），本机无法真机验证，留 `[deploy]` 人工验证。

## 结论

- 路径层以 `process.platform` 映射 host（`win32→windows`、`linux→linux`、`darwin→macos`），`local` 源用 `path.join`（宿主本机分隔符）+ `homedir()`；`wsl` 源仅 `host === 'windows'` 且 `wsl_user` 非空时用 `path.win32.join` 构造 UNC，否则返回 `null`。注入 host 的单测可等价覆盖三平台，不依赖真实宿主。
