# Spike report

## 问题

WSL/Linux 宿主上如何零配置自动发现 Windows 用户 home（t438 未知契约清单）：发现顺序与失败回退。

## 成功判据

- 本机（WSL2）实测至少一条可行路径定位到真实 Windows 用户 home，且含 agent 数据目录。

## 尝试

- 本机 WSL2（kernel 6.18.33.2-microsoft-standard-WSL2）实测：
    1. `/mnt/c` 存在（drvfs 自动挂载）；`/mnt/c/Users/` 枚举得 `All Users / Default / Default User / TestUser / Public / desktop.ini`。
    2. shell 探测：`pwsh.exe -NoProfile -Command '$env:USERPROFILE'` → `C:\Users\TestUser`。
    3. agent 标记验证：`/mnt/c/Users/TestUser/` 下 `.claude` / `.kimi-code` / `.grok` / `.local/share/opencode` 四个标记目录全部存在；`.kimi-code/sessions` 有真实会话。

## 证据

- 见上「尝试」各步输出；候选过滤后唯一用户目录 `TestUser` 与 USERPROFILE 一致。

## 结论

发现规则（按序，首个命中即用，进程内缓存）：

1. `/mnt/c/Users` 不可枚举 → 未发现（win 源 unavailable，不崩溃）。
2. 枚举 `/mnt/c/Users/*`，剔除公共项（`All Users`、`Default`、`Default User`、`Public`、`desktop.ini` 等系统项），候选 = 含任一 agent 标记目录（`.claude` / `.kimi-code` / `.grok` / `.local/share/opencode`）的用户目录。
3. 恰好一个候选 → 采用；多个候选 → 取含标记目录最多者（并列取名字典序首），日志记录决策；零候选 → 回退 shell 探测 `powershell.exe -NoProfile -Command $env:USERPROFILE`（存在时），`C:\Users\X` → `/mnt/c/Users/X` 转换后校验目录存在。
4. 全部失败 → win 源 unavailable（AC-005）。

可信度：高（本机实测）。限制：非标准挂载点（非 /mnt/c）与企业定制 profile 目录不覆盖——走 AC-005 回退，可选配置覆盖作逃生舱（spec 非范围允许）。

## 是否采纳

- 决定：是
- 理由：零配置、确定性强、失败可回退
- 后续 task：t438
