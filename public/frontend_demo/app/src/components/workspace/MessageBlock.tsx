import { memo, useMemo, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ChevronDown, Crosshair, FileCode2, Terminal, Wrench } from 'lucide-react';
import type { Agent, Message } from '@/lib/types';
import CopyButton from '@/components/CopyButton';
import { toast } from '@/components/Toast';
import { copyText } from './format';
import { cn } from '@/lib/utils';

export interface ViewOptions {
  showTimestamps: boolean;
  compact: boolean;
}

interface MessageBlockProps {
  agent: Agent;
  message: Message;
  selected: boolean;
  view: ViewOptions;
  /** shiftKey 随事件上报，供范围连选 */
  onSelect: (messageId: string, shiftKey: boolean) => void;
  onHover: (messageId: string | null) => void;
}

/** 对勾描边动画（200ms） */
function CheckMark() {
  return (
    <motion.svg viewBox="0 0 10 10" className="h-2.5 w-2.5">
      <motion.path
        d="M1.5 5.2 L4 7.5 L8.5 2.5"
        fill="none"
        stroke="var(--bg-canvas)"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      />
    </motion.svg>
  );
}

function MessageBlock({ agent, message, selected, view, onSelect, onHover }: MessageBlockProps) {
  const [flash, setFlash] = useState(false);

  const handleCheckbox = (e: ReactMouseEvent) => {
    e.stopPropagation();
    onSelect(message.id, e.shiftKey);
  };

  const handleLocate = (e: ReactMouseEvent) => {
    e.stopPropagation();
    setFlash(true);
    setTimeout(() => setFlash(false), 900);
  };

  const handleCopyAsCode = async (e: ReactMouseEvent) => {
    e.stopPropagation();
    const ok = await copyText(`\`\`\`${message.language ?? ''}\n${message.content}\n\`\`\``);
    toast(ok ? '已复制为代码块' : '复制失败');
  };

  return (
    <div
      id={`msg-${message.id}`}
      data-message-id={message.id}
      onMouseEnter={() => onHover(message.id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        'group/msg relative flex rounded-[8px] transition-colors duration-150',
        selected ? 'bg-lime-dim' : 'hover:bg-raised/40',
        flash && 'ring-1 ring-lime',
      )}
    >
      {/* 1px lime 左条（选中态） */}
      {selected && <span className="absolute left-0 top-1 bottom-1 w-px bg-lime rounded-full" />}
      {/* 24px 选择列：hover 浮现 checkbox */}
      <div className="w-6 shrink-0 pt-2 flex justify-center">
        <button
          type="button"
          aria-label={selected ? '取消选中' : '选中此消息'}
          onClick={handleCheckbox}
          className={cn(
            'flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border transition-all duration-150',
            selected
              ? 'border-lime bg-lime opacity-100'
              : 'border-border-strong bg-panel opacity-0 group-hover/msg:opacity-100 hover:border-lime',
          )}
        >
          {selected && <CheckMark />}
        </button>
      </div>

      <div className={cn('min-w-0 flex-1', view.compact ? 'py-1 pr-2' : 'py-1.5 pr-2')}>
        {/* hover 快捷操作 */}
        <div className="absolute right-2 top-1.5 z-10 hidden items-center gap-1 group-hover/msg:flex">
          <CopyButton text={message.content} toastMessage="已复制此条消息" />
          <button
            type="button"
            title="复制为代码"
            onClick={handleCopyAsCode}
            className="inline-flex h-6 w-6 items-center justify-center rounded-chip border border-border-subtle bg-raised text-text-muted transition-colors hover:border-border-strong hover:text-text-primary"
          >
            <FileCode2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="定位到原文"
            onClick={handleLocate}
            className="inline-flex h-6 w-6 items-center justify-center rounded-chip border border-border-subtle bg-raised text-text-muted transition-colors hover:border-border-strong hover:text-text-primary"
          >
            <Crosshair className="h-3.5 w-3.5" />
          </button>
        </div>

        {message.kind === 'tool' ? (
          <ToolChip message={message} />
        ) : message.kind === 'code' ? (
          <CodeBlock message={message} />
        ) : message.kind === 'diff' ? (
          <DiffBlock message={message} />
        ) : message.role === 'user' ? (
          <div
            className="relative overflow-hidden rounded-[8px] bg-raised px-3 py-2"
          >
            <span
              className="absolute left-0 top-0 h-full w-[3px]"
              style={{ backgroundColor: agent.color }}
            />
            <p className="pl-1.5 text-[14px] leading-relaxed text-text-primary whitespace-pre-wrap">
              {message.content}
            </p>
          </div>
        ) : (
          <AssistantMarkdown content={message.content} />
        )}

        {view.showTimestamps && (
          <div className="mt-0.5 pl-1 font-mono text-[10px] text-text-muted/70">
            {message.timestamp} · {message.tokenEst}t
          </div>
        )}
      </div>
    </div>
  );
}

/** assistant Markdown 正文（无底色） */
function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="px-1 text-[14px] leading-relaxed text-text-primary/90">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-bold text-text-primary">{children}</strong>,
          ul: ({ children }) => <ul className="my-1.5 list-disc pl-5 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="my-1.5 list-decimal pl-5 space-y-0.5">{children}</ol>,
          h1: ({ children }) => <h4 className="mt-2 mb-1 text-[15px] font-bold">{children}</h4>,
          h2: ({ children }) => <h4 className="mt-2 mb-1 text-[15px] font-bold">{children}</h4>,
          h3: ({ children }) => <h5 className="mt-2 mb-1 text-[14px] font-bold">{children}</h5>,
          h4: ({ children }) => <h5 className="mt-2 mb-1 text-[14px] font-bold">{children}</h5>,
          a: ({ children, href }) => (
            <a href={href} className="text-lime underline decoration-lime/40" target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          code: ({ children, className }) => {
            const isBlock = /language-/.test(className ?? '');
            if (isBlock) {
              return <code className="font-mono text-[12.5px]">{children}</code>;
            }
            return (
              <code className="rounded-[4px] border border-border-subtle bg-inset px-1 py-px font-mono text-[12px] text-lime/90">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-[8px] border border-border-subtle bg-inset p-3 text-code">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-1.5 border-l-2 border-border-strong pl-3 text-text-secondary">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/** 可折叠工具调用芯片 */
function ToolChip({ message }: { message: Message }) {
  const [open, setOpen] = useState(false);
  const failed = useMemo(() => {
    const m = message.content.match(/exit\s+(\d+)/);
    return m ? m[1] !== '0' : /failed|error/i.test(message.content);
  }, [message.content]);

  return (
    <div className="overflow-hidden rounded-[6px] border border-border-subtle bg-inset">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-mono text-[12px] text-text-secondary transition-colors hover:bg-raised/60"
      >
        {failed ? (
          <Terminal className="h-3.5 w-3.5 shrink-0 text-danger" />
        ) : message.toolName === 'Bash' ? (
          <Terminal className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        ) : (
          <Wrench className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        )}
        <span className={cn('truncate', failed && 'text-danger/90')}>{message.content}</span>
        <ChevronDown
          className={cn('ml-auto h-3.5 w-3.5 shrink-0 text-text-muted transition-transform duration-150', open && 'rotate-180')}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="max-h-60 overflow-y-auto border-t border-border-subtle px-3 py-2 font-mono text-[12px] leading-relaxed text-text-secondary whitespace-pre-wrap">
              {`$ ${message.toolName ?? 'Tool'}\n${message.content}\n\n# ${message.timestamp} · ${message.tokenEst} tokens · 演示数据未包含完整原始输出`}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** 语法高亮代码块（oneDark 深色在两种主题下保持一致） */
function CodeBlock({ message }: { message: Message }) {
  return (
    <div className="overflow-hidden rounded-[8px] border border-border-subtle bg-[#282c34]">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#21252b] px-3 py-1">
        <span className="font-mono text-[11px] uppercase tracking-wider text-[#7f8c9e]">
          {message.language ?? 'text'}
        </span>
        <CopyButton text={message.content} toastMessage="已复制代码" />
      </div>
      <SyntaxHighlighter
        language={message.language ?? 'text'}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '10px 12px',
          background: 'transparent',
          fontSize: '0.8125rem',
          lineHeight: 1.65,
        }}
        codeTagProps={{ style: { fontFamily: "'JetBrains Mono', monospace" } }}
      >
        {message.content}
      </SyntaxHighlighter>
    </div>
  );
}

/** diff 块：文件路径头 + 增删行着色 */
function DiffBlock({ message }: { message: Message }) {
  const { filePath, lines } = useMemo(() => {
    const raw = message.content.split('\n');
    let path = '';
    const body: string[] = [];
    for (const line of raw) {
      if (line.startsWith('+++ ')) {
        path = line.slice(4).replace(/^b\//, '');
        continue;
      }
      if (line.startsWith('--- ')) continue;
      body.push(line);
    }
    return { filePath: path, lines: body };
  }, [message.content]);

  return (
    <div className="overflow-hidden rounded-[8px] border border-border-subtle bg-inset">
      <div className="flex items-center justify-between border-b border-border-subtle bg-panel/60 px-3 py-1">
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-text-secondary">
          <FileCode2 className="h-3 w-3 text-text-muted" />
          {filePath || 'diff'}
        </span>
        <CopyButton text={message.content} toastMessage="已复制 diff" />
      </div>
      <div className="overflow-x-auto py-1 font-mono text-[12px] leading-relaxed">
        {lines.map((line, i) => {
          const isAdd = line.startsWith('+');
          const isDel = line.startsWith('-');
          const isHunk = line.startsWith('@@');
          return (
            <div
              key={i}
              className={cn(
                'flex px-3 whitespace-pre',
                isAdd && 'bg-diff-add/[0.12] text-diff-add',
                isDel && 'bg-diff-del/[0.12] text-diff-del',
                isHunk && 'text-text-muted',
                !isAdd && !isDel && !isHunk && 'text-text-secondary',
              )}
            >
              <span className={cn('mr-2 inline-block w-3 shrink-0 select-none', !isAdd && !isDel && 'opacity-0')}>
                {isAdd ? '+' : isDel ? '-' : '·'}
              </span>
              <span>{isAdd || isDel ? line.slice(1) : line}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(MessageBlock);
