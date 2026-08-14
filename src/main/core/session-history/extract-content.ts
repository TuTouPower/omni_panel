/** t360: 从消息 content（string 或 text 块数组）提取纯文本，供各 extractor 共享。 */
export function pick_text_from_content(content: unknown): string | null {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        const texts: string[] = [];
        for (const block of content) {
            if (typeof block !== "object" || block === null) continue;
            const b = block as Record<string, unknown>;
            if (b["type"] === "text" && typeof b["text"] === "string") {
                texts.push(b["text"]);
            }
        }
        return texts.length > 0 ? texts.join("\n") : null;
    }
    return null;
}
