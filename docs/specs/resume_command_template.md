# 会话续接命令模板

## 摘要

点击 session ID 复制的续接命令可由配置按 source 自定义。数据/逻辑层：`config.resumeCommandTemplates` 与 `resume_command` 模板替换（t401）。设置面板「常规」可编辑四来源模板（t402）。调用点接线见 t403。

## 配置字段

- `AppConfiguration.resumeCommandTemplates?: Readonly<Partial<Record<string, string>>>`
- 键：会话 source（如 `kimi_code` / `claude_code` / `grok` / `opencode`）
- 值：命令模板字符串，占位符仅 `{session_id}`（其它占位符不支持）
- `appConfigurationSchema` 含 `resumeCommandTemplates: z.record(z.string()).optional()`，parse 不 strip
- 缺省（无字段）= 旧配置兼容；条目空串 = 视同未自定义

## 逻辑

`resume_command(source, session_id, templates?)`（`src/renderer/lib/session-resume.ts`）：

1. `templates[source]` 为非空字符串 → `replaceAll("{session_id}", session_id)` 后返回
2. 否则回退内置默认（与 `DEFAULT_RESUME_COMMAND_TEMPLATES` 同源）：
    - `claude_code` → `claude --resume {session_id}`
    - `kimi_code` → `kimi -r {session_id}`
    - `grok` → `grok --resume {session_id}`
    - `opencode` → `opencode -s {session_id}`
3. 无内置且无自定义 → `null`

第三参可选，现有两参调用行为不变。

## 设置 UI（t402）

- 路径：设置 → 常规 →「会话续接命令」分组
- 四源各一文本输入：`claude_code` / `kimi_code` / `grok` / `opencode`
- 占位符 = 对应内置默认模板（含 `{session_id}`）
- 非空 trim 后写入 `config.resumeCommandTemplates[source]` 并 `save_config`
- 清空（空白）删除该来源键；无剩余键时省略整字段
- 已有自定义值重新打开时回显；不强制校验模板是否含 `{session_id}`

## 验证

- 单测：`tests/unit/renderer/lib/session_resume.test.ts`（t401 AC-001~004）
- schema：`tests/unit/config/config-schema.test.ts`（t401 AC-005~006）
- 设置 UI：`tests/unit/renderer/views/settings_view_general.test.tsx`（t402 AC-001~004）

## 来源

- t401（2026-08-16）
- t402（2026-08-16）
