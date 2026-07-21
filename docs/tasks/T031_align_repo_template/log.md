# Task log

只记录有追溯价值的进展、踩坑、中途决策、偏离 plan 原因和关键验证结果；不写命令流水账。

## 记录

- 分支基于 `task_t016_migrate_seed_fake_specs`（用户本地真实主线，含到 T030），非 main（main 落后至 T018）。中途修正基点。
- 用户指定单 task 单 commit，不按惯例拆分。
- 用户决策：tid 改小写 t001（29 归档目录 + 索引全改名）；归档目录文件结构原样保留（仅改目录名），不合并 log/adoption/task_report。
- spec/plan 写完待用户审批执行。未动 src/tests/scripts。
