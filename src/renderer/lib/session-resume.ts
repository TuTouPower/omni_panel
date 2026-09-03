/**
 * t324 会话来源 → 续接命令；未知来源返回 null（点击 session id 无效果）。
 * t326 提取为工作台/会话库共享。
 * t401 可选第三参：source → 命令模板，`{session_id}` 全量替换；缺省/空串回退内置默认。
 * t402 设置 UI 占位符与内置默认同源。
 */

/** 内置默认续接模板（含 `{session_id}`）；设置页占位与回退共用。 */
export const DEFAULT_RESUME_COMMAND_TEMPLATES = {
    claude_code: "claude --resume {session_id}",
    kimi_code: "kimi -r {session_id}",
    grok: "grok --resume {session_id}",
    opencode: "opencode -s {session_id}",
    codex: "codex resume {session_id}",
} as const;

export type ResumeCommandSource = keyof typeof DEFAULT_RESUME_COMMAND_TEMPLATES;

export const RESUME_COMMAND_SOURCES = Object.keys(
    DEFAULT_RESUME_COMMAND_TEMPLATES,
) as ResumeCommandSource[];

export function resume_command(
    source: string,
    session_id: string,
    templates?: Readonly<Partial<Record<string, string>>>,
): string | null {
    const custom = templates?.[source];
    if (typeof custom === "string" && custom.length > 0) {
        return custom.replaceAll("{session_id}", session_id);
    }
    // t432: source 运行时可能不在默认表（t324 未知来源返回 null）；用 Record
    // 索引保留 string|undefined，避免 `as ResumeCommandSource` 断言把类型收窄
    // 到恒非空而触发 no-unnecessary-condition（t402 引入）。
    const builtin = (DEFAULT_RESUME_COMMAND_TEMPLATES as Record<string, string | undefined>)[
        source
    ];
    if (!builtin) return null;
    return builtin.replaceAll("{session_id}", session_id);
}
