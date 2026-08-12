# d033 平台感知路径层：process.platform 映射与 path.win32 构造 UNC

- 来源：s025 platform_host_env_path spike（t308）
- 结论：`process.platform` 本机（Linux）返回 `linux`，Windows 宿主返回 `win32`（Node 契约）；`path.join` 用本机分隔符，`path.win32.join` 恒用 `\` 且可在 Linux 上构造 Windows/UNC 路径（不触文件系统）。
- 证据：`node -e` 实测 `platform: linux`、`path.join(os.homedir(), '.claude', 'projects')` → `/home/karon/.claude/projects`；`path.win32.join('\\\\wsl.localhost\\Ubuntu','home','karon','.claude','projects')` → `\\wsl.localhost\Ubuntu\home\karon\.claude\projects`。Windows 真机行为留 `[deploy]`。
- 影响：t308 路径层以 `(host, env, cfg) -> path|null` 纯函数实现，host 由 `process.platform` 映射（win32→windows/linux→linux/darwin→macos）；`local` 源用 `path.join`+`homedir()`，`wsl` 源仅 `host==='windows'` 且 `wsl_user` 非空时用 `path.win32.join` 构造 UNC。t309/t310 复用。
- 现状：有效
