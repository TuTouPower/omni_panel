import { memo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownMessageProps {
    readonly text: string;
    /** 测试用渲染计数回调。 */
    readonly onRender?: () => void;
}

/* t274: markdown 元素样式由全局 .markdown-content* 迁为 ReactMarkdown
   element renderer 的 utility class（可见行为对齐旧规则）。 */
const markdown_components: Components = {
    h1: ({ children }: { children?: ReactNode }) => (
        <h1 className="mb-1.5 mt-[10px] text-[16px] font-bold text-[var(--color-on-surface)]">
            {children}
        </h1>
    ),
    h2: ({ children }: { children?: ReactNode }) => (
        <h2 className="mb-1.5 mt-[10px] text-[15px] font-bold text-[var(--color-on-surface)]">
            {children}
        </h2>
    ),
    h3: ({ children }: { children?: ReactNode }) => (
        <h3 className="mb-1.5 mt-[10px] text-[14px] font-bold text-[var(--color-on-surface)]">
            {children}
        </h3>
    ),
    h4: ({ children }: { children?: ReactNode }) => (
        <h4 className="mb-1.5 mt-[10px] font-bold text-[var(--color-on-surface)]">{children}</h4>
    ),
    p: ({ children }: { children?: ReactNode }) => <p className="my-1">{children}</p>,
    ul: ({ children }: { children?: ReactNode }) => <ul className="my-1 pl-5">{children}</ul>,
    ol: ({ children }: { children?: ReactNode }) => <ol className="my-1 pl-5">{children}</ol>,
    table: ({ children }: { children?: ReactNode }) => (
        <table className="my-1.5 border-collapse text-[12.5px]">{children}</table>
    ),
    th: ({ children }: { children?: ReactNode }) => (
        <th className="border border-[var(--color-outline)] bg-[var(--color-surface-raised)] px-[9px] py-1 font-semibold">
            {children}
        </th>
    ),
    td: ({ children }: { children?: ReactNode }) => (
        <td className="border border-[var(--color-outline)] px-[9px] py-1">{children}</td>
    ),
    code: ({ children }: { children?: ReactNode }) => (
        <code className="rounded-[4px] bg-[var(--color-surface-raised)] px-[5px] py-px font-[var(--font-code-md)] text-[12px]">
            {children}
        </code>
    ),
    pre: ({ children }: { children?: ReactNode }) => (
        <pre className="my-1.5 overflow-x-auto rounded-lg border border-[var(--color-outline)] bg-[var(--color-field-bg)] p-[10px_12px] [&_code]:bg-transparent [&_code]:p-0">
            {children}
        </pre>
    ),
    blockquote: ({ children }: { children?: ReactNode }) => (
        <blockquote className="my-1.5 border-l-[3px] border-[var(--color-on-surface-variant)] px-3 py-0.5 text-[var(--color-on-surface-variant)]">
            {children}
        </blockquote>
    ),
    a: ({ href, children }: { href?: string | undefined; children?: ReactNode }) => (
        <a className="text-[var(--color-accent)] underline" href={href}>
            {children}
        </a>
    ),
};

/** 消息 Markdown 渲染：react-markdown + remark-gfm。 */
export const MarkdownMessage = memo(function MarkdownMessage({
    text,
    onRender,
}: MarkdownMessageProps) {
    onRender?.();
    if (!text.trim()) return null;
    return (
        <div className="text-[13px] leading-[1.65] text-[var(--color-on-surface)]">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdown_components}>
                {text}
            </ReactMarkdown>
        </div>
    );
});
