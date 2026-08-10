# p018 pending.py / render_review_prompts.py 直写权威/派生文件未原子化（2026-08-01）

- 来源：t179 spec 非范围（t169 模板化重写后原子性丢失的同一根因，t179 只覆盖 task.py）
- 内容：`scripts/pending.py:328-329` 与 `scripts/render_review_prompts.py:297` 仍直接 `write_text` 写 `docs/pending.md` / `docs/archive/pending.md` / review prompt 文件，无 tmp+fsync+os.replace 原子写，中断会产生半写状态。`scripts/task.py` 的 `_atomic_write_text` 可复用。
- 处理：t185
