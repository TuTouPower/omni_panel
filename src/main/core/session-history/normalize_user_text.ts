/**
 * t436: 将 coding agent 写入 role=user 的框架信封归一为可展示的用户话。
 * 供会话历史四端提取器与 Claude/Kimi token-stats 标题共用。
 */

export type NormalizeUserResult = { readonly keep: true; readonly text: string } | { readonly keep: false };

/** p203 抽样登记的信封标签（不含 user_query / command-*，那两类有专用展开）。 */
const STRIP_ENVELOPE_TAGS = [
    "system-reminder",
    "user_info",
    "git_status",
    "rules",
    "user_rules",
    "user_rule",
    "always_applied_workspace_rules",
    "always_applied_workspace_rule",
    "skill_information",
    "skills_referenced",
    "attached_files",
    "file_contents",
    "local-command-caveat",
    "local-command-stdout",
    "command-message",
] as const;

const USER_QUERY_RE = /<user_query(?:\s[^>]*)?>([\s\S]*?)<\/user_query>/gi;
const COMMAND_NAME_RE = /<command-name(?:\s[^>]*)?>([\s\S]*?)<\/command-name>/i;
const COMMAND_ARGS_RE = /<command-args(?:\s[^>]*)?>([\s\S]*?)<\/command-args>/i;
const INTERRUPTED_LITERAL = "[Request interrupted by user]";

function strip_envelope_blocks(text: string): string {
    let result = text;
    let previous = "";
    while (result !== previous) {
        previous = result;
        for (const tag of STRIP_ENVELOPE_TAGS) {
            const re = new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tag}>`, "gi");
            result = result.replace(re, "");
        }
    }
    return result;
}

/** 解析 user_query：区分「无标签」与「有标签但 inner 全空」。 */
function extract_user_query_inners(
    text: string,
): { readonly present: false } | { readonly present: true; readonly text: string | null } {
    const parts: string[] = [];
    let present = false;
    USER_QUERY_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = USER_QUERY_RE.exec(text)) !== null) {
        present = true;
        const inner = (match[1] ?? "").trim();
        if (inner !== "") parts.push(inner);
    }
    if (!present) return { present: false };
    return { present: true, text: parts.length > 0 ? parts.join("\n") : null };
}

function unwrap_slash_command(text: string): string | null {
    const name_match = COMMAND_NAME_RE.exec(text);
    if (name_match === null) return null;
    const raw_name = (name_match[1] ?? "").trim();
    if (raw_name === "") return null;
    const name = raw_name.replace(/^\/+/, "");
    const args_match = COMMAND_ARGS_RE.exec(text);
    const args = args_match !== null ? (args_match[1] ?? "").trim() : "";
    return args === "" ? `/${name}` : `/${name} ${args}`;
}

/**
 * 归一 user 展示文本。
 * - is_meta：整条丢弃（Claude skill dump / caveat）
 * - 含 user_query：只要各段 inner
 * - 含 command-name：展开为 `/name` + 可选 args
 * - 其余：剥已知信封；空或 interrupted 字面量丢弃
 */
export function normalize_user_display_text(
    text: string,
    options?: { readonly is_meta?: boolean },
): NormalizeUserResult {
    if (options?.is_meta === true) {
        return { keep: false };
    }

    const query = extract_user_query_inners(text);
    if (query.present) {
        // 有标签但 inner 全空 → 丢弃，禁止 fallthrough 把 <user_query> 泄漏进展示。
        if (query.text === null) return { keep: false };
        return { keep: true, text: query.text };
    }

    const slash = unwrap_slash_command(text);
    if (slash !== null) {
        return { keep: true, text: slash };
    }

    let leftover = strip_envelope_blocks(text).trim();
    if (leftover === INTERRUPTED_LITERAL) {
        return { keep: false };
    }
    leftover = leftover.split(INTERRUPTED_LITERAL).join("").trim();
    if (leftover === "") {
        return { keep: false };
    }
    return { keep: true, text: leftover };
}
