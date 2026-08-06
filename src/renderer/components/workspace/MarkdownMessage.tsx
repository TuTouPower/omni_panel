import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownMessageProps {
    readonly text: string;
}

/** t225 消息 Markdown 渲染：react-markdown + remark-gfm。
 *  不配 rehype-raw，原始 HTML 不解析（安全约束：会话内容不可信）。 */
export function MarkdownMessage({ text }: MarkdownMessageProps) {
    if (!text.trim()) return null;
    return (
        <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
    );
}
