import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownMessageProps {
    readonly text: string;
    /** 测试用渲染计数回调。 */
    readonly onRender?: () => void;
}

/** 消息 Markdown 渲染：react-markdown + remark-gfm。 */
export const MarkdownMessage = memo(function MarkdownMessage({
    text,
    onRender,
}: MarkdownMessageProps) {
    onRender?.();
    if (!text.trim()) return null;
    return (
        <div className="markdown-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
    );
});
