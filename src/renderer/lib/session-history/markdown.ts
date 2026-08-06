/**
 * 会话历史窗口纯函数模块（t211/t226）。
 *
 * - agent 显示名映射
 * - 时间格式化（分钟）
 *
 * 复制格式由 t226 摘选托盘 copy-format（format_entries，按选择顺序分组）取代，
 * 本模块只保留展示相关纯函数。
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
