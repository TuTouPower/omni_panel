# 会话库搜索 skill（coding agent）

需求：提供可拷贝 skill + 使用指南，让用户的 coding agent 经 OmniPanel LocalAPI 搜索/读取会话库（t460）。不建 MCP。

## 交付

- Skill：`skills/session_library_search/SKILL.md`（发现 `cli.json`、列/筛、正文搜、读消息、只读约束）。
- 指南：`docs/guides/session_library_agent_search.md`（拷到 Claude Code / Cursor / Grok；不配 MCP）。

## 行为要点

- 仅 `127.0.0.1` + dataRoot `cli.json` 的 `port`；实例未运行不得编造结果。
- 列表：`GET /v1/sessions`（含 `title`/`directory`/`sources`/时间/排序/`limit`/`offset`）。
- 正文：`POST /v1/sessionHistory/searchContent`；`offset`/`limit` 为候选扫描分页。
- 读消息：`GET /v1/sessionHistory`，须 `id`+`source`+`env`。
- 禁止改源文件、禁止 subscribe/open。

## 验证

- `tests/unit/session_library_search_skill.test.ts` 断言 skill/指南正文覆盖上述约定。
