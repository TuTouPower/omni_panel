import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown,
  CheckSquare,
  Code2,
  Eraser,
  ListTree,
  Maximize2,
  Minimize2,
  X,
} from 'lucide-react';
import type { Message, Session } from '@/lib/types';
import { AGENTS } from '@/lib/types';
import AgentBadge from '@/components/AgentBadge';
import CwdPath from '@/components/CwdPath';
import { useSelectionStore } from '@/lib/store';
import MessageBlock, { type ViewOptions } from './MessageBlock';
import { formatTokens, roleLabel, segmentSummary, timeToMinutes } from './format';
import { cn } from '@/lib/utils';

export interface PaneViewOptions extends ViewOptions {
  showTools: boolean;
}

interface SessionPaneProps {
  slotIndex: number;
  session: Session;
  view: PaneViewOptions;
  /** 键盘聚焦脉冲（值变化时触发一次 600ms lime 描边脉冲） */
  focusPulse: number;
  /** 聚焦模式：单面板铺满 */
  focusMode: boolean;
  onToggleFocusMode: () => void;
  onClose: () => void;
  onSelectMessage: (sessionId: string, messageId: string, shiftKey: boolean) => void;
  onHoverMessage: (sessionId: string, messageId: string | null) => void;
}

type StreamItem =
  | { type: 'msg'; message: Message }
  | { type: 'sep'; id: string; ts: string };

export default function SessionPane({
  slotIndex,
  session,
  view,
  focusPulse,
  focusMode,
  onToggleFocusMode,
  onClose,
  onSelectMessage,
  onHoverMessage,
}: SessionPaneProps) {
  const agent = AGENTS[session.agentId];
  const selectedIds = useSelectionStore((s) => s.selected[session.id]) ?? [];
  const selectRange = useSelectionStore((s) => s.selectRange);
  const clearSession = useSelectionStore((s) => s.clearSession);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const [onlyCode, setOnlyCode] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showBackToBottom, setShowBackToBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 打开会话时的骨架屏模拟
  useEffect(() => {
    setLoading(true);
    setOnlyCode(false);
    const t = setTimeout(() => setLoading(false), 700);
    return () => clearTimeout(t);
  }, [session.id]);

  const visibleMessages = useMemo(
    () =>
      session.messages.filter((m) => {
        if (!view.showTools && m.kind === 'tool') return false;
        if (onlyCode && m.kind !== 'code' && m.kind !== 'diff') return false;
        return true;
      }),
    [session.messages, view.showTools, onlyCode],
  );

  // 跨 10 分钟插入时间分隔线
  const streamItems = useMemo<StreamItem[]>(() => {
    const items: StreamItem[] = [];
    let prevTs: string | null = null;
    for (const m of visibleMessages) {
      if (
        view.showTimestamps &&
        prevTs &&
        timeToMinutes(m.timestamp) - timeToMinutes(prevTs) >= 10
      ) {
        items.push({ type: 'sep', id: `sep-${m.id}`, ts: m.timestamp });
      }
      items.push({ type: 'msg', message: m });
      prevTs = m.timestamp;
    }
    return items;
  }, [visibleMessages, view.showTimestamps]);

  const counts = useMemo(() => {
    let u = 0;
    let a = 0;
    let t = 0;
    for (const m of session.messages) {
      if (m.kind === 'tool') t += 1;
      else if (m.role === 'user') u += 1;
      else a += 1;
    }
    return { u, a, t };
  }, [session.messages]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowBackToBottom(el.scrollHeight - el.scrollTop - el.clientHeight > 400);
  }, []);

  const backToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  };

  const selectAllVisible = () => {
    const merged = new Set([...selectedIds, ...visibleMessages.map((m) => m.id)]);
    // 按原始消息顺序写入
    const ordered = session.messages.map((m) => m.id).filter((id) => merged.has(id));
    selectRange(session.id, ordered);
  };

  const jumpToMessage = (messageId: string) => {
    const el = scrollRef.current?.querySelector(`[data-message-id="${messageId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="relative flex h-full min-h-[280px] min-w-0 flex-col overflow-hidden rounded-[12px] border border-border-subtle bg-panel">
      {/* Agent 色 4px 顶条 */}
      <span className="h-1 w-full shrink-0" style={{ backgroundColor: agent.color }} />

      {/* 键盘聚焦脉冲：面板头 lime 描边闪烁 */}
      {focusPulse > 0 && (
        <motion.span
          key={focusPulse}
          className="pointer-events-none absolute inset-0 z-30 rounded-[12px] border border-lime"
          initial={{ opacity: 1 }}
          animate={{ opacity: [1, 0, 1, 0] }}
          transition={{ duration: 0.6, times: [0, 0.4, 0.6, 1] }}
        />
      )}

      {/* 面板头 48px */}
      <header className="group/panehead flex h-12 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
        <AgentBadge agentId={session.agentId} showModel />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-bold leading-tight text-text-primary">
              {session.title}
            </span>
            {selectedIds.length > 0 && (
              <span className="shrink-0 rounded-chip bg-lime-dim px-1.5 py-px font-mono text-[10px] font-medium text-lime">
                已选 {selectedIds.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 truncate font-mono text-[11px] leading-tight text-text-muted">
            <CwdPath cwd={session.cwd} max={22} />
            <span className="shrink-0">
              {session.turnCount} 轮 · {formatTokens(session.tokenCount)} tokens · {session.date}
            </span>
          </div>
        </div>

        {/* hover 浮现操作 */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/panehead:opacity-100">
          <PaneIconBtn title="大纲" onClick={() => setOutlineOpen((v) => !v)} active={outlineOpen}>
            <ListTree className="h-4 w-4" />
          </PaneIconBtn>
          <PaneIconBtn title="仅看代码" onClick={() => setOnlyCode((v) => !v)} active={onlyCode}>
            <Code2 className="h-4 w-4" />
          </PaneIconBtn>
          <PaneIconBtn title="全选可见" onClick={selectAllVisible}>
            <CheckSquare className="h-4 w-4" />
          </PaneIconBtn>
          <PaneIconBtn title="清空选择" onClick={() => clearSession(session.id)}>
            <Eraser className="h-4 w-4" />
          </PaneIconBtn>
          <PaneIconBtn title={focusMode ? '还原布局' : '聚焦此面板'} onClick={onToggleFocusMode} active={focusMode}>
            {focusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </PaneIconBtn>
          <PaneIconBtn title="关闭" onClick={onClose} danger>
            <X className="h-4 w-4" />
          </PaneIconBtn>
        </div>
      </header>

      {/* 消息流（独立滚动） */}
      <div ref={scrollRef} onScroll={handleScroll} className="relative min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <SkeletonStream />
        ) : streamItems.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-[12px] text-text-muted">
            当前过滤条件下没有消息
          </div>
        ) : (
          <div className={cn('px-3 py-3', view.compact ? 'space-y-1' : 'space-y-2')}>
            {streamItems.map((item, i) =>
              item.type === 'sep' ? (
                <div key={item.id} className="flex items-center gap-2 py-1">
                  <span className="h-px flex-1 bg-border-subtle" />
                  <span className="font-mono text-[10px] text-text-muted">{item.ts}</span>
                  <span className="h-px flex-1 bg-border-subtle" />
                </div>
              ) : (
                <motion.div
                  key={item.message.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.6), ease: [0.22, 1, 0.36, 1] }}
                >
                  <MessageBlock
                    agent={agent}
                    message={item.message}
                    selected={selectedSet.has(item.message.id)}
                    view={view}
                    onSelect={(mid, shift) => onSelectMessage(session.id, mid, shift)}
                    onHover={(mid) => onHoverMessage(session.id, mid)}
                  />
                </motion.div>
              ),
            )}
          </div>
        )}

        {/* 回到底部浮动按钮 */}
        <AnimatePresence>
          {showBackToBottom && !loading && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              onClick={backToBottom}
              className="sticky bottom-2 left-full mr-2 flex h-7 items-center gap-1 rounded-full border border-border-strong bg-raised px-2.5 font-mono text-[11px] text-text-secondary shadow-float transition-colors hover:text-text-primary"
            >
              回到底部
              <ArrowDown className="h-3 w-3" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* 大纲抽屉 */}
      <AnimatePresence>
        {outlineOpen && (
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 36 }}
            className="absolute inset-y-0 right-0 z-20 flex w-[240px] flex-col border-l border-border-subtle bg-raised shadow-float"
          >
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-border-subtle px-3">
              <span className="text-[12px] font-bold text-text-secondary">消息大纲</span>
              <button
                type="button"
                onClick={() => setOutlineOpen(false)}
                className="text-text-muted transition-colors hover:text-text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {session.messages.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => jumpToMessage(m.id)}
                  className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left transition-colors hover:bg-panel"
                >
                  <span
                    className={cn(
                      'shrink-0 rounded-[4px] px-1 font-mono text-[10px] font-bold',
                      m.role === 'user' ? 'bg-raised text-text-secondary' : 'bg-lime-dim text-lime',
                    )}
                  >
                    {roleLabel(session, m.id)}
                  </span>
                  <span className="truncate text-[12px] text-text-secondary">
                    {segmentSummary(m.content, 18)}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-text-muted">{m.timestamp}</span>
                </button>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* 面板脚 28px */}
      <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-border-subtle px-3 font-mono text-[11px] text-text-muted">
        <span>槽位 {slotIndex + 1}</span>
        <span>U{counts.u}</span>
        <span>A{counts.a}</span>
        <span>工具 {counts.t}</span>
        <span className={cn('ml-auto', selectedIds.length > 0 && 'text-lime')}>
          已选 {selectedIds.length}
        </span>
      </footer>
    </div>
  );
}

function PaneIconBtn({
  title,
  onClick,
  active,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-btn transition-colors duration-150',
        active
          ? 'bg-lime-dim text-lime'
          : danger
            ? 'text-text-muted hover:bg-raised hover:text-danger'
            : 'text-text-muted hover:bg-raised hover:text-text-primary',
      )}
    >
      {children}
    </button>
  );
}

/** 骨架屏：3 条灰条 shimmer 1.2s 循环 */
function SkeletonStream() {
  return (
    <div className="space-y-3 px-4 py-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <div
            className="h-3 animate-pulse rounded bg-raised"
            style={{ width: `${82 - i * 14}%`, animationDelay: `${i * 0.2}s`, animationDuration: '1.2s' }}
          />
          <div
            className="h-3 animate-pulse rounded bg-raised"
            style={{ width: `${64 - i * 10}%`, animationDelay: `${i * 0.2 + 0.1}s`, animationDuration: '1.2s' }}
          />
        </div>
      ))}
    </div>
  );
}
