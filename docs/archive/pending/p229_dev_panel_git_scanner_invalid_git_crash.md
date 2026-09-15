# p229 开发面板 git-scanner 扫描到伪 .git 文件与跨机孤立 worktree 时报错

- 现象：开发面板在扫描代码目录时弹出警告框「部分目录未能读取」，错误信息形如：
    - `/Users/testuser/kar/code/example_game/.scratch/uv_cache/sdists-v9: fatal: invalid gitfile format: .../.scratch/uv_cache/sdists-v9/.git`
    - `/Users/testuser/kar/backup/dev_backup/Code/example_chat/.claude/worktrees/chat-analyze: fatal: not a git repository: .../D:/Dev/Code/example_analysis/.git/worktrees/chat-analyze`
- 影响：开发面板扫描中断并报红；用户工作区内包含缓存文件（如 uv 缓存的 0 字节 `.git`）或外部/备份 worktree 目录时，无法正常完成全局 git 统计。
- 根因：
    1. `src/main/core/dev-panel/git-scanner.ts` 中的 `SKIP_DIRECTORIES` 缺少 `.scratch`、`.claude`、`.cache` 等临时与工具链目录。
    2. `discover_repositories` 仅根据 `entry.name === ".git"` 判定为 git 仓库，未校验 `.git` 是真实合法目录还是损坏的 gitfile（0 字节空文件或指向外部不存在路径的 worktree 指针）。
    3. `scan_git_roots` 执行 `git rev-parse --git-common-dir` 遇到非法 gitfile 时直接抛错进入 `errors`，未能静默跳过伪仓库。
- 测试缺口：`tests/unit/main/dev-panel-git-scanner.test.ts` 仅使用 `fixture_repo` 构造了标准的规范 git 仓库，未覆盖 0 字节 `.git` 文件、跨机 Windows 绝对路径 worktree 指针文件，以及包含 `.scratch` 等忽略目录的发现场景。
- 线索：`.scratch/reproduce_git_scanner.ts`
- 处理：t485
