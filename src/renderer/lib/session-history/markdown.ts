/**
 * 会话历史窗口纯函数模块（t211）。
 *
 * - agent 显示名映射
 * - 时间格式化（分钟 / 完整）
 * - 复制 Markdown 生成器（决策 9：按会话分节、`---` 隔离、角色粗体、时间升序）
 *
 * 全部纯函数，便于组件与单测复用。复制 ≠ 显示：从原始消息文本重新生成，
 * 不取 DOM。
 */

const AGENT_FRIENDLY: Record<string, string> = {
    claude_code: "Claude",
    opencode: "OpenCode",
    kimi_code: "Kimi",
    grok: "Grok",
};

/** source → 展示名（栏头 / Markdown 角色）。未知 source 原样返回。 */
export function agent_friendly(source: string): string {
    return AGENT_FRIENDLY[source] ?? source;
}

/** source → 会话节标题里的 slug（claude_code → claude-code），与明细表 agent 一致。 */
export function agent_slug(source: string): string {
    return source.replace(/_/g, "-");
}

/** ms epoch → YYYY-MM-DD（会话节日期）。 */
export function format_date(ts: number): string {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${String(y)}-${m}-${day}`;
}

/** ms epoch → HH:MM（消息时间戳，显示到分钟）。 */
export function format_time_short(ts: number): string {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
}

/** ms epoch → YYYY-MM-DD HH:MM:SS（悬停完整时间）。 */
export function format_time_full(ts: number): string {
    const d = new Date(ts);
    const date = format_date(ts);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${date} ${hh}:${mm}:${ss}`;
}

/** 复制输出的一条消息（role 限定 user/assistant）。 */
export interface CopyMessage {
    readonly role: "user" | "assistant";
    readonly text: string;
    readonly timestamp: number | null;
}

/** 复制输出的一个会话节。 */
export interface CopySection {
    readonly title: string;
    readonly source: string;
    readonly date: string;
    readonly messages: readonly CopyMessage[];
}

function role_label(section: CopySection, role: "user" | "assistant"): string {
    if (role === "user") return "用户";
    return agent_friendly(section.source);
}

/** 单条消息 → Markdown 块：`**角色**\n\n文本`。 */
function render_message(section: CopySection, m: CopyMessage): string {
    const body = m.text.endsWith("\n") ? m.text : m.text + "\n";
    return `**${role_label(section, m.role)}**\n\n${body}`;
}

/**
 * 生成复制 Markdown（决策 9 / Q9）。
 *
 * - 按给定节顺序输出（= 栏打开顺序）；节间 `---` 隔离。
 * - 节内消息按时间升序（timestamp null 排后，保持输入相对序）。
 * - 标题为 null 时回退 source slug + session 占位。
 */
export function build_copy_markdown(sections: readonly CopySection[]): string {
    const blocks: string[] = [];
    for (const section of sections) {
        const sorted = [...section.messages].sort((a, b) => {
            const ta = a.timestamp ?? Number.POSITIVE_INFINITY;
            const tb = b.timestamp ?? Number.POSITIVE_INFINITY;
            return ta - tb;
        });
        const title = section.title || `${agent_slug(section.source)} · ${section.date}`;
        const header = `## 会话：${title}（${agent_slug(section.source)} · ${section.date}）`;
        const body = sorted.map((m) => render_message(section, m)).join("\n");
        blocks.push([header, body].join("\n\n"));
    }
    return blocks.join("\n\n---\n\n");
}
