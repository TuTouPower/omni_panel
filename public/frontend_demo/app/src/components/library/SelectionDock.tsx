import { motion } from 'framer-motion';
import { ArrowRight, X } from 'lucide-react';
import type { Session } from '@/lib/types';
import { AGENTS } from '@/lib/types';
import { cn } from '@/lib/utils';

interface SelectionDockProps {
  /** 按选择顺序排列的会话 */
  sessions: Session[];
  launching: boolean;
  onRemove: (sessionId: string) => void;
  onClear: () => void;
  onOpen: () => void;
}

/**
 * SelectionDock — (library.md §5)
 * sticky bottom 64px：8 个槽位微缩图 + mono 计数 + 清空 + 并排打开主按钮。
 */
export default function SelectionDock({ sessions, launching, onRemove, onClear, onOpen }: SelectionDockProps) {
  const count = sessions.length;

  return (
    <div
      className={cn(
        'sticky bottom-0 z-20 flex h-16 items-center gap-4 border-t border-border-subtle px-6 backdrop-blur-md transition-colors duration-200',
        count === 0 ? 'bg-canvas/60' : 'bg-canvas/90',
      )}
    >
      {count === 0 ? (
        <p className="text-[13px] text-text-muted">勾选卡片以并排打开（至多 8 个）</p>
      ) : (
        <div className="flex items-center gap-2">
          {Array.from({ length: 8 }, (_, i) => {
            const session = sessions[i];
            if (!session) {
              return (
                <span
                  key={`empty-${i}`}
                  className="h-10 w-12 rounded-chip border border-dashed border-border-strong"
                />
              );
            }
            const agent = AGENTS[session.agentId];
            return (
              <motion.span
                key={session.id}
                layout
                initial={{ scale: 0.6, opacity: 0 }}
                animate={
                  launching
                    ? { y: -48, opacity: 0, scale: 0.8, transition: { delay: i * 0.08, duration: 0.35 } }
                    : { scale: 1, opacity: 1, y: 0 }
                }
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 26 }}
                className="group/slot relative h-10 w-12 overflow-hidden rounded-chip border border-border-subtle bg-raised"
                title={session.title}
              >
                <span className="block h-1 w-full" style={{ backgroundColor: agent.color }} />
                <span className="flex h-[calc(100%-4px)] items-center justify-center font-display text-[15px] font-bold text-text-secondary">
                  {session.title.charAt(0)}
                </span>
                <button
                  type="button"
                  aria-label={`移除 ${session.title}`}
                  onClick={() => onRemove(session.id)}
                  className="absolute -top-px -right-px hidden h-4 w-4 items-center justify-center rounded-bl-chip bg-danger text-canvas group-hover/slot:flex"
                >
                  <X className="h-2.5 w-2.5" strokeWidth={3} />
                </button>
              </motion.span>
            );
          })}
        </div>
      )}

      <div className="ml-auto flex items-center gap-3">
        <span className="font-mono text-[12px] text-text-muted">
          <span className={count > 0 ? 'text-lime' : ''}>{count}</span>/8
        </span>
        <button
          type="button"
          onClick={onClear}
          disabled={count === 0}
          className="text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary disabled:pointer-events-none disabled:text-text-muted"
        >
          清空
        </button>
        <motion.button
          type="button"
          onClick={onOpen}
          disabled={count === 0 || launching}
          whileTap={{ scale: 0.97 }}
          className={cn(
            'flex h-9 items-center gap-1.5 rounded-btn px-4 text-[13px] font-bold transition-colors duration-150',
            count === 0
              ? 'cursor-not-allowed bg-raised text-text-muted'
              : 'bg-lime text-canvas hover:brightness-110',
          )}
        >
          并排打开{count > 0 ? ` (${count})` : ''}
          <ArrowRight className="h-4 w-4" />
        </motion.button>
      </div>
    </div>
  );
}
