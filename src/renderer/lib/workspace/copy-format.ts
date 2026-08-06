import {
    agent_friendly,
    agent_slug,
    format_date,
    format_time_short,
} from "../session-history/markdown";
import type { SelectedItem } from "./selection-store";

/** t226 托盘复制格式：Markdown / 纯文本 / 按会话分组。 */

export type CopyFormat = "markdown" | "plain" | "grouped";

/** 文本 token 估算（粗略：按字符数）。 */
export function estimate_tokens(text: string): number {
    return text.length;
}

function loc_key(loc: SelectedItem["loc"]): string {
    return `${loc.source}|${loc.env}|${loc.session_id}`;
}

interface SessionGroup {
    readonly key: string;
    readonly loc: SelectedItem["loc"];
    readonly title: string;
    readonly items: SelectedItem[];
}

function group_by_session(items: readonly SelectedItem[]): SessionGroup[] {
    const groups = new Map<string, SessionGroup>();
    for (const item of items) {
        const k = loc_key(item.loc);
        const g = groups.get(k);
        if (g) {
            g.items.push(item);
        } else {
            groups.set(k, { key: k, loc: item.loc, title: item.session_title, items: [item] });
        }
    }
    return [...groups.values()];
}

function role_label(item: SelectedItem): string {
    return item.message.role === "user" ? "用户" : agent_friendly(item.loc.source);
}

function header(item: SelectedItem): string {
    const ts = item.message.timestamp;
    const time = ts !== null ? ` ${format_time_short(ts)}` : "";
    return `${role_label(item)}${time}`;
}

function render_markdown(group: SessionGroup): string {
    const date = format_date(group.items[0]?.message.timestamp ?? 0);
    const title = group.title || `${agent_slug(group.loc.source)} · ${date}`;
    const header_line = `## 会话：${title}（${agent_slug(group.loc.source)} · ${date}）`;
    const body = group.items
        .map((item) => {
            const body_text = item.message.text.endsWith("\n")
                ? item.message.text
                : item.message.text + "\n";
            return `**${header(item)}**\n\n${body_text}`;
        })
        .join("\n");
    return `${header_line}\n\n${body}`;
}

function render_plain(group: SessionGroup): string {
    return group.items.map((item) => `${header(item)}\n${item.message.text}`).join("\n");
}

function render_grouped(group: SessionGroup): string {
    const date = format_date(group.items[0]?.message.timestamp ?? 0);
    const title = group.title || `${agent_slug(group.loc.source)} · ${date}`;
    const body = group.items
        .map(
            (item) =>
                `[${role_label(item)}${item.message.timestamp !== null ? ` ${format_time_short(item.message.timestamp)}` : ""}]\n${item.message.text}`,
        )
        .join("\n");
    return `# ${title}\n\n${body}`;
}

/** 按格式生成复制文本；空列表返回空字符串。 */
export function format_entries(items: readonly SelectedItem[], format: CopyFormat): string {
    if (items.length === 0) return "";
    const groups = group_by_session(items);
    const render =
        format === "markdown"
            ? render_markdown
            : format === "plain"
              ? render_plain
              : render_grouped;
    const blocks = groups.map(render);
    return format === "markdown" ? blocks.join("\n\n---\n\n") : blocks.join("\n\n");
}
