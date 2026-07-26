targets: 审阅当前所有代码快照（不看 diff），含 docs 活跃文档
modules: main_core=src/main/; renderer=src/renderer/; shared=src/shared/+src/preload/+src/web/+src/generated/; docs_active=docs/blueprint/+docs/guides/+docs/specs/+docs/templates/+docs/tasks/+docs/bugs.md+docs/handoff.md+docs/specs_index.md
routes: review_main_core_claude_current, review_renderer_claude_current, review_shared_claude_current, review_docs_active_claude_current
expected_reports: review_main_core_claude_current.md review_renderer_claude_current.md review_shared_claude_current.md review_docs_active_claude_current.md
timeout_sec: 900
cwd: D:/Dev/Code/omni_usage
