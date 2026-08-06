import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownMessageProps {
    readonly text: string;
    /** 测试用渲染计数回调。 */
    readonly onRender?: () => void;
}

/** t225 消息 Markdown 渲染：react-markdown + remark-gfm。
 *  不配 rehype-raw，原始 HTML 不解析（安全约束：会话内容不可信）。
 *  memo 化避免同列其它消息重渲染时重复解析 markdown。 */
export const MarkdownMessage = memo(function MarkdownMessage({
    text,
    onRender,
}: MarkdownMessageProps) {
    onRender?.();
    if (!text.trim()) return null;
    return (
        <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
    );
});
