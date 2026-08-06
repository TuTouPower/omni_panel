import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import type { AgentId } from '@/lib/types';
import { AGENT_LIST } from '@/lib/types';
import { mockSessions } from '@/data/mockSessions';
import AgentBadge from '@/components/AgentBadge';
import CwdPath from '@/components/CwdPath';
import { formatTokens, segmentSummary } from './format';
import { cn } from '@/lib/utils';

interface SessionPickerModalProps {
  /** 目标槽位 */
  slotIndex: number | null;
  /** 已占用的会话 id（用于标记「已打开」） */
  openSessionIds: Set<string>;
  onAssign: (slotIndex: number, sessionId: string) => void;
  onClose: () => void;
}

type AgentFilter = 'all' | AgentId;

/**
 * SessionPickerModal — (design.md §8.9)
 * 720px Modal：搜索 + Agent 筛选页签（带计数）+ 会话行列表，点击即占用槽位
 */
export default function SessionPickerModal({
  slotIndex,
  openSessionIds,
  onAssign,
  onClose,
}: SessionPickerModalProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AgentFilter>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (slotIndex !== null) {
      setQuery('');
      setFilter('all');
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [slotIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (slotIndex !== null) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slotIndex, onClose]);

  const counts = useMemo(() => {
    const map = new Map<AgentFilter, number>();
    map.set('all', mockSessions.length);
    for (const a of AGENT_LIST) {
      map.set(a.id, mockSessions.filter((s) => s.agentId === a.id).length);
    }
    return map;
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mockSessions.filter((s) => {
      if (filter !== 'all' && s.agentId !== filter) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        s.filePath.toLowerCase().includes(q) ||
        s.messages.some((m) => m.content.toLowerCase().includes(q))
      );
    });
  }, [query, filter]);

  return (
    <AnimatePresence>
      {slotIndex !== null && (
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
            aria-label="选择会话"
            className="flex max-h-[70vh] w-[720px] max-w-full flex-col overflow-hidden rounded-[12px] border border-border-strong bg-raised shadow-float"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 搜索 */}
            <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-text-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索会话标题、路径或内容…"
                className="min-w-0 flex-1 bg-transparent text-[14px] text-text-primary outline-none placeholder:text-text-muted"
              />
              <span className="shrink-0 font-mono text-[11px] text-text-muted">槽位 {slotIndex + 1}</span>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Agent 筛选页签 */}
            <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border-subtle px-3 py-2">
              <FilterTab
                label="全部"
                active={filter === 'all'}
                count={counts.get('all') ?? 0}
                onClick={() => setFilter('all')}
              />
              {AGENT_LIST.map((a) => (
                <FilterTab
                  key={a.id}
                  label={a.name}
                  dot={a.color}
                  active={filter === a.id}
                  count={counts.get(a.id) ?? 0}
                  onClick={() => setFilter(a.id)}
                />
              ))}
            </div>

            {/* 会话行列表 */}
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-[13px] text-text-muted">
                  没有匹配的会话
                </div>
              ) : (
                filtered.map((s, i) => {
                  const firstUser = s.messages.find((m) => m.role === 'user');
                  const isOpen = openSessionIds.has(s.id);
                  return (
                    <motion.button
                      key={s.id}
                      type="button"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: Math.min(i * 0.03, 0.3) }}
                      onClick={() => onAssign(slotIndex, s.id)}
                      className="flex w-full items-center gap-3 rounded-[8px] px-3 py-2.5 text-left transition-colors duration-150 hover:bg-panel"
                    >
                      <AgentBadge agentId={s.agentId} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[14px] font-medium text-text-primary">{s.title}</span>
                          {isOpen && (
                            <span className="shrink-0 rounded-chip bg-lime-dim px-1.5 py-px font-mono text-[10px] text-lime">
                              已打开
                            </span>
                          )}
                        </div>
                        <div className="truncate text-[12px] text-text-muted">
                          {firstUser ? segmentSummary(firstUser.content, 40) : s.filePath}
                        </div>
                      </div>
                      <div className="shrink-0 text-right font-mono text-[11px] leading-relaxed text-text-muted">
                        <div>
                          {s.turnCount} 轮 · {formatTokens(s.tokenCount)}
                        </div>
                        <div>{s.date}</div>
                        <div className="flex justify-end">
                          <CwdPath cwd={s.cwd} max={20} />
                        </div>
                      </div>
                    </motion.button>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function FilterTab({
  label,
  dot,
  active,
  count,
  onClick,
}: {
  label: string;
  dot?: string;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-chip px-2.5 py-1 text-[12px] transition-colors duration-150',
        active ? 'bg-panel text-text-primary' : 'text-text-muted hover:text-text-secondary',
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />}
      {label}
      <span className="font-mono text-[10px] text-text-muted">{count}</span>
    </button>
  );
}
