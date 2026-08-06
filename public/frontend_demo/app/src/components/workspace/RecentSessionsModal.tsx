import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, History, X } from 'lucide-react';
import { mockSessions } from '@/data/mockSessions';
import { SLOT_COUNT } from '@/lib/store';
import AgentBadge from '@/components/AgentBadge';
import CwdPath from '@/components/CwdPath';
import { relativeDate } from '@/components/library/sessionMeta';
import { toast } from '@/components/Toast';
import { cn } from '@/lib/utils';

const QUICK_PICKS = [2, 4, 8] as const;

interface RecentSessionsModalProps {
  open: boolean;
  onClose: () => void;
  /** 确认打开：按选择顺序的会话 id 列表（调用方负责替换槽位） */
  onOpen: (sessionIds: string[]) => void;
}

/**
 * RecentSessionsModal — 「最近会话」弹层
 * 全部会话按日期倒序，行可多选（上限 8），快捷选择 最近 2/4/8 个，
 * 底部显示 已选 N/8 + lime「打开」按钮。
 */
export default function RecentSessionsModal({ open, onClose, onOpen }: RecentSessionsModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  /** 日期倒序 */
  const sorted = useMemo(
    () => [...mockSessions].sort((a, b) => b.date.localeCompare(a.date)),
    [],
  );

  // 打开时重置选择
  useEffect(() => {
    if (open) setSelectedIds([]);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= SLOT_COUNT) {
        toast(`最多同时打开 ${SLOT_COUNT} 个会话`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const quickPick = (n: number) => {
    setSelectedIds(sorted.slice(0, n).map((s) => s.id));
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-start justify-center bg-canvas/70 px-4 pt-[12vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-label="最近会话"
            className="flex max-h-[70vh] w-[640px] max-w-full flex-col overflow-hidden rounded-[12px] border border-border-strong bg-raised shadow-float"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-4 py-3">
              <History className="h-4 w-4 shrink-0 text-text-muted" />
              <span className="text-[14px] font-bold text-text-primary">最近会话</span>
              <span className="font-mono text-[11px] text-text-muted">按日期倒序 · 可多选</span>
              <button
                type="button"
                onClick={onClose}
                className="ml-auto shrink-0 text-text-muted transition-colors hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 快捷选择 */}
            <div className="flex shrink-0 items-center gap-1.5 border-b border-border-subtle px-3 py-2">
              <span className="px-1 text-[12px] text-text-muted">快速选择</span>
              {QUICK_PICKS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => quickPick(n)}
                  className={cn(
                    'flex h-6 items-center rounded-chip border px-2 text-[12px] transition-colors duration-150',
                    selectedIds.length === n &&
                      selectedIds.every((id, i) => id === sorted[i]?.id)
                      ? 'border-lime/60 bg-lime-dim text-lime'
                      : 'border-border-subtle text-text-secondary hover:border-border-strong',
                  )}
                >
                  最近 {n} 个
                </button>
              ))}
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="ml-auto text-[12px] text-text-muted transition-colors hover:text-danger"
                >
                  清除选择
                </button>
              )}
            </div>

            {/* 会话行列表 */}
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {sorted.map((s, i) => {
                const selected = selectedIds.includes(s.id);
                const order = selectedIds.indexOf(s.id) + 1;
                return (
                  <motion.button
                    key={s.id}
                    type="button"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: Math.min(i * 0.02, 0.2) }}
                    onClick={() => toggle(s.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-[8px] px-3 py-2.5 text-left transition-colors duration-150',
                      selected ? 'bg-lime/[0.06] hover:bg-lime/[0.08]' : 'hover:bg-panel',
                    )}
                  >
                    <span
                      className={cn(
                        'relative flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-150',
                        selected ? 'border-lime bg-lime' : 'border-border-strong bg-panel',
                      )}
                    >
                      {selected && <Check className="h-3 w-3 text-canvas" strokeWidth={3.5} />}
                      {selected && (
                        <span className="absolute -top-2 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-lime px-0.5 font-mono text-[9px] font-bold text-canvas ring-2 ring-raised">
                          {order}
                        </span>
                      )}
                    </span>
                    <AgentBadge agentId={s.agentId} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium text-text-primary">
                        {s.title}
                      </div>
                      <CwdPath cwd={s.cwd} max={30} />
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-text-muted">
                      {relativeDate(s.date)}
                    </span>
                  </motion.button>
                );
              })}
            </div>

            {/* 底部：计数 + 打开 */}
            <div className="flex shrink-0 items-center gap-3 border-t border-border-subtle px-4 py-3">
              <span className="font-mono text-[12px] text-text-muted">
                已选 <span className={selectedIds.length > 0 ? 'text-lime' : ''}>{selectedIds.length}</span>/{SLOT_COUNT}
              </span>
              <span className="text-[11px] text-text-muted/70">打开后将替换当前工作台槽位</span>
              <button
                type="button"
                disabled={selectedIds.length === 0}
                onClick={() => onOpen(selectedIds)}
                className={cn(
                  'ml-auto flex h-8 items-center gap-1.5 rounded-btn px-4 text-[13px] font-bold transition-colors duration-150',
                  selectedIds.length === 0
                    ? 'cursor-not-allowed bg-panel text-text-muted'
                    : 'bg-lime text-canvas hover:brightness-110',
                )}
              >
                打开{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
