# p114 lint 存量失败：repo_template JS 文件未被 tsconfig 收录

- 来源：t283 顺手发现（存量）
- 内容：`pnpm lint` 全量报 3 个 Parsing error：`scripts/repo_template/repo_task/view_static/board.js`、`chain_plan.js`、`tests/repo_template/test_chain_plan_cases.js`「not found by the project service」。repo_template sync（5229b98e）引入 JS 文件未纳入 tsconfig include/allowDefaultProject，lint 门禁因此全量失败（主仓同样复现）。需收编或加 allowDefaultProject 白名单。
- 处理：t299
