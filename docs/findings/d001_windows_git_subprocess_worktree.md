# d001 Windows 下 git subprocess 编码与 worktree 路径分隔符（2026-07-31）

- 来源：t169
- 结论：从 Linux 模板移植的 Python 脚本在 Windows 跑 git 子进程需两处适配，否则中文输出炸、worktree 路径比较恒 False。
- 证据：
    - `subprocess.run(..., text=True)` 在 Windows 默认用 locale 编码（GBK）解码 git 输出，含中文 commit message / 文件名时抛 `UnicodeDecodeError`，stdout 变 None。须显式 `encoding="utf-8", errors="replace"`。
    - `git worktree list --porcelain` 在 Windows 输出正斜杠（`D:/Dev/...`），`str(Path.resolve())` 是反斜杠（`D:\Dev\...`），字符串 `in` 字典比较恒 False。须把路径键统一 `str(Path(p).resolve())`，调用处的 path 变量也 `.resolve()`。
- 影响：`scripts/repo_template/task.py`、`_id_scan.py`、`render_review_prompts.py` 及 `tests/repo_template/` 三个 test helper 已按此适配；后续从模板移植的 Python 脚本若调 git 子进程同样需要。
- 现状：有效
