# p007 write_front_matter / rebuild_indexes 原子写恢复（2026-07-26 暂搁，2026-08-01 改写）

- 来源：t063/t068 遗留改写。t063（8eaf1892）曾为权威 task JSON 实现 tmp+fsync+os.replace 原子写（防掉电损坏）；t169 模板化重写后 `scripts/task.py` 全仓 `os.replace` 命中为 0，`write_front_matter`（task.py:387）直接 `write_text` 写**权威 front matter**，`rebuild_indexes`（task.py:835）直接写派生索引 JSON，原子性丢失。task.md front matter 是状态权威（CLAUDE.md 明文「只经 task.py 修改」），中断写损坏影响比旧 JSON 更重。原「mock os.replace 失败路径测试」目标代码已消失，故改写为恢复原子写。
- 内容：`write_front_matter` + `rebuild_indexes` 恢复 tmp+fsync+os.replace 原子写；在 `tests/repo_template/` 补失败路径/中断恢复测试（pytest 基建已就绪，197 用例；`test_task_save.py` 测了内容正确性未测原子性）。
- 处理：t179
