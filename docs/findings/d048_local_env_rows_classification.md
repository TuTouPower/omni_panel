# d048 存量 env=local 行按 directory 形态可确定性分类为 win/linux/mac

- 来源：s032 spike / t437 task
- 结论：token-stats 五张表的存量 `env='local'` 行可按 directory 形态确定分类：盘符形（`X:\`/`X:/`）→ win；`/Users/` 前缀 → mac；其余 POSIX 非空 → linux；directory 为 NULL（claude costs 来源会话）或 daily 孤儿行 → 迁移时宿主 platform 默认（win32→win / darwin→mac / 其他→linux）。buckets 是 daily 全量派生表可整体重建；hour_rollup 清空置 unready 走现成异步回填。
- 证据：s032 对本机 observations.sqlite（user_version=7，local 行 sessions 2435 / records 559835）全量统计：records local 行 directory 盘符形 212639、POSIX 形 347196、UNC 0、/Users/ 0、NULL 0；sessions NULL directory 444 行全部 claude_code；daily 无孤儿。
- 影响：t437 迁移 v8 的分类规则与 decisions.md「env 四值表」；后续任何 env 重命名迁移可复用此判定函数。
- 现状：有效
