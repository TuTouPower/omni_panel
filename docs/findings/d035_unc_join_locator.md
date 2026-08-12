# d035 path.win32.join 对 UNC/盘符/空用户名片段行为（locator 复用）

- 来源：s027 unc_join_behavior spike（t310）
- 结论：`path.win32.join` 正确处理 UNC 前缀与盘符；空用户名片段会拼出 `\home\.claude` 形态缺用户名 UNC（不可用）；POSIX `path.join` 对 `\` 字面量不特殊处理（原 bug 机制）。locator 复用 t308 路径层（`wsl` 源仅 windows 且 `wsl_user` 非空）即获得正确行为，无新增事实。
- 证据：`node -e` 实测——`path.win32.join('\\\\wsl.localhost\\Ubuntu-22.04','home','karon','.claude','projects')` → `\\wsl.localhost\Ubuntu-22.04\home\karon\.claude\projects`；空用户名 → `\\wsl.localhost\Ubuntu-22.04\home\.claude`。Windows 真机留 `[deploy]`。
- 影响：t310 session-locator/subscription/path-index 改走 t308 路径层；`wsl_user` 非空守卫必须保留（空则 wsl 源不可用）。
- 现状：有效
