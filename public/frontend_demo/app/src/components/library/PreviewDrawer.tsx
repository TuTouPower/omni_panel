import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, Plus, X } from 'lucide-react';
import type { Message, Session } from '@/lib/types';
import { AGENTS } from '@/lib/types';
import AgentBadge from '@/components/AgentBadge';
import { metaLine } from '@/components/library/sessionMeta';
import { cn } from '@/lib/utils';

interface PreviewDrawerProps {
  session: Session | null;
  selected: boolean;
  onClose: () => void;
  onOpenSingle: (session: Session) => void;
  onToggleSelect: (session: Session) => void;
}

/** 只读简化版 MessageBlock */
function PreviewMessage({ message, color }: { message: Message; color: string }) {
  if (message.kind === 'tool') {
    return (
      <div className="flex justify-center">
        <span className="truncate rounded-chip border border-border-subtle bg-panel px-2.5 py-1 font-mono text-[11px] text-text-muted">
          {message.content}
        </span>
      </div>
    );
  }
  if (message.kind === 'code' || message.kind === 'diff') {
    return (
      <pre className="max-h-40 overflow-auto rounded-btn border border-border-subtle bg-inset p-3 font-mono text-[12px] leading-relaxed text-text-secondary">
        {message.content}
      </pre>
    );
  }
  return (
    <div
      className={cn(
        'rounded-btn px-3 py-2 text-[13px] leading-relaxed text-text-secondary',
        message.role === 'user' && 'border-l-[3px] bg-raised text-text-primary',
      )}
      style={message.role === 'user' ? { borderLeftColor: color } : undefined}
    >
      <p className="line-clamp-4 whitespace-pre-wrap">{message.content}</p>
    </div>
  );
}

/**
 * PreviewDrawer — (library.md §6)
 * 右侧滑出 480px：AgentBadge + 标题 + 完整 meta + 前 5 条消息 + 双按钮。
 */
export default function PreviewDrawer({ session, selected, onClose, onOpenSingle, onToggleSelect }: PreviewDrawerProps) {
  useEffect(() => {
    if (!session) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session, onClose]);

  return (
    <AnimatePresence>
      {session && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-canvas/60 backdrop-blur-[2px]"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 350, damping: 35 }}
            className="fixed top-0 right-0 z-50 flex h-full w-[480px] max-w-full flex-col border-l border-border-subtle bg-panel"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border-subtle p-5">
              <div className="flex min-w-0 flex-col gap-2">
                <AgentBadge agentId={session.agentId} showModel />
                <h2 className="text-h3 leading-snug">{session.title}</h2>
                <p className="font-mono text-[12px] text-text-muted">{metaLine(session)}</p>
                <p className="truncate font-mono text-[11px] text-text-muted/70">{session.filePath}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭预览"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-btn border border-border-subtle bg-raised text-text-muted transition-colors hover:border-border-strong hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              <p className="font-mono text-[11px] text-text-muted">// 前 5 条消息</p>
              {session.messages.slice(0, 5).map((m) => (
                <PreviewMessage key={m.id} message={m} color={AGENTS[session.agentId].color} />
              ))}
              {session.messages.length > 5 && (
                <p className="text-center font-mono text-[11px] text-text-muted">
                  … 共 {session.messages.length} 条消息
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 border-t border-border-subtle p-4">
              <button
                type="button"
                onClick={() => onOpenSingle(session)}
                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-btn border border-border-strong text-[13px] font-medium text-text-primary transition-colors hover:border-lime hover:text-lime"
              >
                <ExternalLink className="h-4 w-4" />
                单独打开
              </button>
              <button
                type="button"
                onClick={() => onToggleSelect(session)}
                className={cn(
                  'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-btn text-[13px] font-bold transition-colors',
                  selected
                    ? 'border border-border-strong text-text-secondary hover:text-text-primary'
                    : 'bg-lime text-canvas hover:brightness-110',
                )}
              >
                {selected ? (
                  '取消选择'
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    加入选择
                  </>
                )}
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
