# 会话续接命令模板

## 摘要

点击 session ID 复制的续接命令可由配置按 source 自定义。本 spec 覆盖数据/逻辑层：`config.resumeCommandTemplates` 与 `resume_command` 模板替换。设置 UI 见 t402，调用点接线见 t403。

## 配置字段

- `AppConfiguration.resumeCommandTemplates?: Readonly<Partial<Record<string, string>>>`
- 键：会话 source（如 `kimi_code` / `claude_code` / `grok` / `opencode`）
- 值：命令模板字符串，占位符仅 `{session_id}`（其它占位符不支持）
- `appConfigurationSchema` 含 `resumeCommandTemplates: z.record(z.string()).optional()`，parse 不 strip
- 缺省（无字段）= 旧配置兼容；条目空串 = 视同未自定义

## 逻辑

`resume_command(source, session_id, templates?)`（`src/renderer/lib/session-resume.ts`）：

1. `templates[source]` 为非空字符串 → `replaceAll("{session_id}", session_id)` 后返回
2. 否则回退内置默认：
   - `claude_code` → `claude --resume ${session_id}`
   - `kimi_code` → `kimi -r ${session_id}`
   - `grok` → `grok --resume ${session_id}`
   - `opencode` → `opencode -s ${session_id}`
3. 无内置且无自定义 → `null`

第三参可选，现有两参调用行为不变。

## 验证

- 单测：`tests/unit/renderer/lib/session_resume.test.ts`（AC-001~004）
- schema：`tests/unit/config/config-schema.test.ts`（AC-005~006）

## 来源

- t401（2026-08-16）
