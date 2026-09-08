# 用 coding agent 搜索 OmniPanel 会话库

OmniPanel 把各家 coding agent 的会话索引到 LocalAPI。仓库提供一份**可拷贝 skill**，教 agent 用 HTTP 列/筛会话、搜正文、读消息。不需要 MCP，也不改各家 `mcp.json`。

## 前置

1. OmniPanel 已运行（桌面托盘 / GUI，或 `omni-panel serve`）。
2. 实例发现文件存在：`<dataRoot>/cli.json`（GUI 与 serve 启动后都会写；见 [cli-mode.md](./cli-mode.md)）。
3. Agent 只访问 `http://127.0.0.1:<port>`。

dataRoot 常见位置：

|平台|路径|
|---|---|
|Linux|`~/.config/OmniPanel`|
|macOS|`~/Library/Application Support/OmniPanel`|
|Windows|`%APPDATA%\OmniPanel`|

## 拷贝 skill（不配 MCP）

Skill 源文件：仓库根目录 `skills/session_library_search/SKILL.md`。

### Claude Code

把整个目录拷到项目或用户 skills 目录，例如：

```bash
mkdir -p .agents/skills
cp -R skills/session_library_search .agents/skills/
```

或拷到 Claude 用户 skills 路径（以本机 Claude Code 文档为准）。重启 / 新开会话后，description 命中时会加载该 skill。不需要添加 MCP server。

### Cursor

将 `SKILL.md` 内容放入 Cursor 的 project rules / skills 约定目录（常见为项目内 `.cursor/rules` 或 Cursor 文档所述 skills 路径），保证 agent 能读到「何时搜会话库、如何调 LocalAPI」的说明。不要为会话库搜索配置 MCP。

### Grok

将 `skills/session_library_search/` 拷到 Grok 可用的 skills 目录（例如用户 skills 树或项目 `.agents/skills/`），保持 `SKILL.md` front matter 的 `name` / `description`。不要求写入 MCP 配置。

## 用法提示

- 先按 `title` / `directory` / `sources` / 时间筛，再 `POST /v1/sessionHistory/searchContent`。
- 正文搜索的 `offset`/`limit` 是**候选扫描分页**；跟 `progress` 直到 `done`。
- 读消息必须带 `id` + `source` + `env`。
- 实例未运行时让 agent 如实报错，禁止编造会话。

完整 HTTP 约定以 skill 正文为准：[`skills/session_library_search/SKILL.md`](../../skills/session_library_search/SKILL.md)。
