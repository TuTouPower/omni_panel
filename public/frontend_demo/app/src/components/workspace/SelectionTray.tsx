import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, ChevronUp, Copy, GripVertical, Layers, Trash2, X } from 'lucide-react';
import type { Segment } from '@/lib/types';
import { AGENTS } from '@/lib/types';
import { getSessionById } from '@/data/mockSessions';
import { useSelectionStore } from '@/lib/store';
import AgentBadge from '@/components/AgentBadge';
import { toast } from '@/components/Toast';
import {
  buildCopyText,
  copyText,
  COPY_FORMATS,
  formatTokens,
  segmentLabel,
  segmentSummary,
  type CopyFormat,
} from './format';
import { cn } from '@/lib/utils';

/** 由 selected 状态计算片段列表（按会话内原始顺序） */
function useSegments(): Segment[] {
  const selected = useSelectionStore((s) => s.selected);
  return useMemo(() => {
    const segments: Segment[] = [];
    for (const [sessionId, messageIds] of Object.entries(selected)) {
      const session = getSessionById(sessionId);
      if (!session) continue;
      const idSet = new Set(messageIds);
      for (const message of session.messages) {
        if (idSet.has(message.id)) {
          segments.push({
            id: `${sessionId}:${message.id}`,
            sessionId,
            sessionTitle: session.title,
            agentId: session.agentId,
            message,
          });
        }
      }
    }
    return segments;
  }, [selected]);
}

/**
 * SelectionTray — 底部跨会话摘选托盘（workspace.md §5）
 * 默认 112px，可拖拽上沿扩至 40vh；空态收起为 40px 细条
 */
export default function SelectionTray() {
  const segments = useSegments();
  const toggleMessage = useSelectionStore((s) => s.toggleMessage);
  const clearAll = useSelectionStore((s) => s.clearAll);

  const [height, setHeight] = useState(112);
  const [collapsed, setCollapsed] = useState(false);
  const [format, setFormat] = useState<CopyFormat>('markdown');
  const [formatOpen, setFormatOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const totalTokens = useMemo(
    () => segments.reduce((sum, s) => sum + s.message.tokenEst, 0),
    [segments],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Segment[]>();
    for (const s of segments) {
      const list = map.get(s.sessionId) ?? [];
      list.push(s);
      map.set(s.sessionId, list);
    }
    return [...map.entries()];
  }, [segments]);

  // 空态时自动收起为细条；有内容时恢复默认高度
  useEffect(() => {
    if (segments.length === 0) setCollapsed(true);
    else setCollapsed(false);
  }, [segments.length]);

  // 拖拽上沿调整高度
  const onHandlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: height };
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const max = window.innerHeight * 0.4;
      const next = Math.min(max, Math.max(72, d.startH + (d.startY - ev.clientY)));
      setHeight(next);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [height]);

  const handleCopy = useCallback(
    async (fmt: CopyFormat = format) => {
      if (segments.length === 0) return;
      const ok = await copyText(buildCopyText(segments, fmt));
      if (ok) {
        setCopied(true);
        const fmtLabel = COPY_FORMATS.find((f) => f.id === fmt)?.label ?? fmt;
        toast(
          `已复制 ${segments.length} 个片段 · ${fmtLabel}`,
          `${formatTokens(totalTokens)} tokens`,
        );
        setTimeout(() => setCopied(false), 1500);
      } else {
        toast('复制失败', '浏览器拒绝了剪贴板访问');
      }
    },
    [segments, format, totalTokens],
  );

  // ⌘⇧C 直接复制托盘（默认 Markdown）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleCopy('markdown');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleCopy]);

  const isEmpty = segments.length === 0;

  return (
    <motion.div
      animate={{ height: collapsed ? 40 : height }}
      transition={{ type: 'spring', stiffness: 300, damping: 32 }}
      className="relative z-10 flex shrink-0 flex-col overflow-hidden border-t border-border-subtle bg-panel"
    >
      {/* 拖拽上沿 */}
      {!collapsed && (
        <div
          onPointerDown={onHandlePointerDown}
          className="absolute inset-x-0 top-0 z-20 h-1.5 cursor-ns-resize"
          title="拖拽调整托盘高度"
        />
      )}

      {isEmpty ? (
        /* 空态细条 */
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex h-10 w-full items-center gap-2 px-4 text-[12px] text-text-muted transition-colors hover:text-text-secondary"
        >
          <Layers className="h-3.5 w-3.5" />
          摘选托盘 · 空
          <span className="font-mono text-[10px]">hover 消息左侧勾选片段，Shift+点击范围连选</span>
          {collapsed ? (
            <ChevronUp className="ml-auto h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="ml-auto h-3.5 w-3.5" />
          )}
        </button>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* 左：分组片段区 */}
          <div className="min-w-0 flex-1 overflow-y-auto px-3 py-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {grouped.map(([sessionId, list]) => {
                const agent = AGENTS[list[0].agentId];
                return (
                  <div key={sessionId} className="flex flex-wrap items-center gap-1.5">
                    <span
                      className="mr-0.5 flex items-center gap-1.5 border-r border-border-subtle pr-2"
                      title={list[0].sessionTitle}
                    >
                      <AgentBadge agentId={agent.id} compact />
                    </span>
                    <AnimatePresence mode="popLayout">
                      {list.map((seg) => (
                        <SegmentChip
                          key={seg.id}
                          segment={seg}
                          onRemove={() => toggleMessage(seg.sessionId, seg.message.id)}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 右：操作列 200px */}
          <div className="flex w-[200px] shrink-0 flex-col justify-center gap-1.5 border-l border-border-subtle px-3 py-2">
            <div className="font-mono text-[11px] text-text-muted">
              {segments.length} 片段 ·{' '}
              <span className="text-lime">{formatTokens(totalTokens)}</span> tokens
            </div>
            <div className="relative flex gap-1.5">
              <button
                type="button"
                onClick={() => handleCopy()}
                className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-btn bg-lime text-[13px] font-bold text-canvas transition-colors duration-150 hover:bg-lime/90"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? '已复制' : '复制'}
              </button>
              <button
                type="button"
                title="选择复制格式"
                onClick={() => setFormatOpen((v) => !v)}
                className="flex h-8 w-7 items-center justify-center rounded-btn border border-border-subtle bg-raised text-text-secondary transition-colors hover:border-border-strong"
              >
                <ChevronUp className={cn('h-3.5 w-3.5 transition-transform', formatOpen && 'rotate-180')} />
              </button>
              <AnimatePresence>
                {formatOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-9 right-0 z-30 w-36 overflow-hidden rounded-btn border border-border-strong bg-raised py-1 shadow-float"
                  >
                    {COPY_FORMATS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          setFormat(f.id);
                          setFormatOpen(false);
                        }}
                        className={cn(
                          'flex w-full items-center justify-between px-3 py-1.5 text-[12px] transition-colors hover:bg-panel',
                          format === f.id ? 'text-lime' : 'text-text-secondary',
                        )}
                      >
                        {f.label}
                        {format === f.id && <Check className="h-3 w-3" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button
              type="button"
              onClick={clearAll}
              className="flex h-6 items-center justify-center gap-1 text-[12px] text-text-muted transition-colors duration-150 hover:text-danger"
            >
              <Trash2 className="h-3 w-3" />
              清空
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

/** SegmentChip — (design.md §8.6) 片段芯片，飞入动画 */
function SegmentChip({ segment, onRemove }: { segment: Segment; onRemove: () => void }) {
  const agent = AGENTS[segment.agentId];
  return (
    <motion.span
      layout
      initial={{ opacity: 0, y: 24, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      whileHover={{ y: -2 }}
      className="group/chip flex cursor-grab items-center gap-1.5 rounded-chip border border-border-subtle bg-raised py-1 pl-1 pr-1.5"
      title={segment.sessionTitle}
    >
      <GripVertical className="h-3 w-3 text-text-muted/50" />
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: agent.color }} />
      <span className="font-mono text-[10px] font-bold text-text-secondary">
        {agent.abbr}
        <span className="text-lime">·{segmentLabel(segment)}</span>
      </span>
      <span className="max-w-[140px] truncate text-[11px] text-text-muted">
        {segmentSummary(segment.message.content)}
      </span>
      <span className="font-mono text-[10px] text-text-muted/70">{segment.message.tokenEst}t</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-danger/20 hover:text-danger"
        title="移除此片段"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </motion.span>
  );
}
