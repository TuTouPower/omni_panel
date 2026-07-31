# 发现总账

已被验证的技术发现与踩坑记录，跨 task 复用。

- spike 结论收尾时抽一条到这里；spike 报告全文留在 `docs/archive/spikes/`。
- 日常发现（工具行为、平台差异、依赖坑、性能特征、被证伪的假设）随时追加。
- 只记**已验证**的事实与证据来源；推测和待确认的写进对应 task 的 spec 上下文区：只有用户或外部环境能核实的标 `UNVERIFIED-BLOCKING`，agent 可实验核实的标 `UNVERIFIED-SPIKE`。
- 编号 `dNNN`，递增不复用。发现失效时不删除条目，改写「现状」并注明失效日期与原因。
- 本文件只追加与就地修订，不迁 archive——发现是长期资产，不存在「闭环」。

结构：`## dNNN 简述（YYYY-MM-DD）`，下接 `- 来源` / `- 结论` / `- 证据` / `- 影响` / `- 现状`。新条目现状写「有效」；失效时改为「YYYY-MM-DD 失效：原因」。

`- 来源` 写 `sNNN` spike、`tNNN` task、或「日常」。

## d001 Windows 下 git subprocess 编码与 worktree 路径分隔符（2026-07-31）

- 来源：t169
- 结论：从 Linux 模板移植的 Python 脚本在 Windows 跑 git 子进程需两处适配，否则中文输出炸、worktree 路径比较恒 False。
- 证据：
    - `subprocess.run(..., text=True)` 在 Windows 默认用 locale 编码（GBK）解码 git 输出，含中文 commit message / 文件名时抛 `UnicodeDecodeError`，stdout 变 None。须显式 `encoding="utf-8", errors="replace"`。
    - `git worktree list --porcelain` 在 Windows 输出正斜杠（`D:/Dev/...`），`str(Path.resolve())` 是反斜杠（`D:\Dev\...`），字符串 `in` 字典比较恒 False。须把路径键统一 `str(Path(p).resolve())`，调用处的 path 变量也 `.resolve()`。
- 影响：`scripts/task.py`、`_id_scan.py`、`render_review_prompts.py` 及 `tests/repo_template/` 三个 test helper 已按此适配；后续从模板移植的 Python 脚本若调 git 子进程同样需要。
- 现状：有效

## d002 SQLite strftime epoch ms 的 UTC+8 weekday/hour 聚合（2026-07-31）

- 来源：s003
- 结论：SQLite `strftime('%w'/'%H', timestamp/1000, 'unixepoch', '+8 hours')` 对 epoch ms 的 weekday（0=周日）/hour 提取与 UTC+8 语义一致，可作热力图等按本地时区聚合的后端 GROUP BY 依据。
- 证据：s003 脚本 9 边界用例（跨日、周日 23:59→周一 00:00、月界、年界）全部与 Python `zoneinfo("Asia/Shanghai")` 期望一致；`COUNT(*)`/`COUNT(DISTINCT session_id)`/`SUM(tokens)` 逐例正确。
- 影响：`token-stats-store` 可新增按 weekday×hour 的聚合查询（方案 A），30d 全表 60 万行聚合约 592ms（内存）、返回 ≤168 格；7d 约 148ms。
- 现状：有效
