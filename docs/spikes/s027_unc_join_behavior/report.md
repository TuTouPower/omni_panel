# Spike report

## 问题

Windows 宿主上 `path.join`（win32）与 UNC 前缀的组合行为——t310 session-history locator 复用 t308 路径层时需确认 `path.win32.join` 对 UNC/盘符/空用户名片段的实际拼接。

## 成功判据

- 确认 `path.win32.join` 正确处理 UNC 前缀（`\\wsl.localhost\<distro>`）、盘符（`C:\...`）与多级子路径。
- 确认 `path.join`（POSIX）对反斜杠字面量不特殊处理——原 bug 机制（homedir POSIX + `\` 字面量拼接失效）。
- 确认空用户名片段会拼出 `\home\.claude` 形态的缺用户名 UNC——验证 t308 的 `wsl_user` 非空守卫必要性。

## 尝试

- `node -e` 实测 `path.win32.join` 四种组合，见 `code/probe.mjs`。

## 证据

- `path.win32.join('\\\\wsl.localhost\\Ubuntu-22.04','home','testuser','.claude','projects')` → `\\wsl.localhost\Ubuntu-22.04\home\testuser\.claude\projects`（UNC 前缀保留，正常拼接）。
- `path.join('/home/testuser','.claude','projects')` → `/home/testuser/.claude/projects`（POSIX 正常；`\` 字面量在 POSIX 中是普通字符，拼接 `C:\...` 会产出坏路径）。
- `path.win32.join('C:\\Users\\Test','.kimi-code','sessions')` → `C:\Users\Test\.kimi-code\sessions`（盘符正常）。
- `path.win32.join('\\\\wsl.localhost\\Ubuntu-22.04','home','','.claude')` → `\\wsl.localhost\Ubuntu-22.04\home\.claude`（空用户名拼出缺用户名 UNC，不可用）。

## 结论

- locator 复用 t308 路径层即可获得正确行为：`local` 源 `path.join` + `homedir()`（宿主本机分隔符），`wsl` 源仅 `host==='windows'` 且 `wsl_user` 非空时 `path.win32.join` 构造 UNC，否则不可用（null）。与 d033/t308 结论一致，无新增事实；Windows 真机行为留 `[deploy]`。
