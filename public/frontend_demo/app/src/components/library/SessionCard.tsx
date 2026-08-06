import { motion } from 'framer-motion';
import { Check, ExternalLink, Eye } from 'lucide-react';
import type { Session } from '@/lib/types';
import { AGENTS } from '@/lib/types';
import AgentBadge from '@/components/AgentBadge';
import CwdPath from '@/components/CwdPath';
import { firstUserMessage, metaLine, sessionTags } from '@/components/library/sessionMeta';
import { cn } from '@/lib/utils';

interface SessionCardProps {
  session: Session;
  selected: boolean;
  /** 选择顺序（1-based），未选中为 0 */
  order: number;
  disabled: boolean;
  onToggle: () => void;
  onOpenSingle: () => void;
  onPreview: () => void;
}

/**
 * SessionCard — (library.md §4)
 * bg-panel + 1px 描边 + 圆角 12px + 顶部 4px Agent 色条；hover 上移 3px。
 */
export default function SessionCard({
  session,
  selected,
  order,
  disabled,
  onToggle,
  onOpenSingle,
  onPreview,
}: SessionCardProps) {
  const agent = AGENTS[session.agentId];
  const tags = sessionTags(session);
  const summary = firstUserMessage(session);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
      onClick={onToggle}
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-panel border bg-panel transition-colors duration-150',
        selected ? 'border-lime bg-lime/[0.05]' : 'border-border-subtle hover:border-border-strong',
        disabled && !selected && 'opacity-60',
      )}
    >
      {/* 顶部 4px Agent 色条 */}
      <span
        className="h-1 w-full shrink-0 transition-[filter] duration-150 group-hover:brightness-125"
        style={{ backgroundColor: agent.color }}
      />

      <div className="flex flex-1 flex-col gap-2.5 p-4 pb-3">
        {/* 顶行：AgentBadge + 勾选框 */}
        <div className="flex items-start justify-between gap-2">
          <AgentBadge agentId={session.agentId} showModel className="min-w-0 flex-wrap" />
          <button
            type="button"
            aria-label={selected ? '取消选择' : '选择'}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className={cn(
              'relative flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border transition-all duration-150',
              selected
                ? 'border-lime bg-lime opacity-100'
                : 'border-border-strong bg-raised opacity-0 hover:border-lime group-hover:opacity-100',
            )}
          >
            {selected && <Check className="h-3 w-3 text-canvas" strokeWidth={3.5} />}
            {selected && order > 0 && (
              <span className="absolute -top-2 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-lime px-0.5 font-mono text-[9px] font-bold text-canvas ring-2 ring-panel">
                {order}
              </span>
            )}
          </button>
        </div>

        {/* 标题 + 摘要 */}
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-text-primary">{session.title}</h3>
        <p className="line-clamp-2 text-[13px] leading-relaxed text-text-secondary">{summary}</p>

        {/* 标签行 */}
        {(tags.hasError || tags.hasCode || tags.isLong) && (
          <div className="flex flex-wrap gap-1.5">
            {tags.hasError && (
              <span className="rounded-chip border border-danger/50 px-1.5 py-px text-[11px] font-medium text-danger">
                含错误
              </span>
            )}
            {tags.hasCode && (
              <span className="rounded-chip border border-border-strong px-1.5 py-px text-[11px] font-medium text-text-secondary">
                含代码
              </span>
            )}
            {tags.isLong && (
              <span className="rounded-chip border border-border-strong px-1.5 py-px text-[11px] font-medium text-text-secondary">
                长会话
              </span>
            )}
          </div>
        )}

        {/* 底行 mono meta */}
        <p className="mt-auto font-mono text-[12px] text-text-muted">{metaLine(session)}</p>
        <div className="flex items-center gap-2.5">
          <CwdPath cwd={session.cwd} max={22} className="text-[11px] text-text-muted/80" />
          <p className="min-w-0 truncate font-mono text-[11px] text-text-muted/70">{session.filePath}</p>
        </div>
      </div>

      {/* hover 操作行 */}
      <div className="flex items-center gap-1 border-t border-border-subtle px-3 py-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenSingle();
          }}
          className="flex h-7 items-center gap-1 rounded-chip px-2 text-[12px] font-medium text-text-secondary transition-colors hover:bg-raised hover:text-text-primary"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          单独打开
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPreview();
          }}
          className="flex h-7 items-center gap-1 rounded-chip px-2 text-[12px] font-medium text-text-secondary transition-colors hover:bg-raised hover:text-text-primary"
        >
          <Eye className="h-3.5 w-3.5" />
          预览
        </button>
        {disabled && !selected && <span className="ml-auto font-mono text-[11px] text-text-muted">最多 8 个</span>}
      </div>
    </motion.article>
  );
}
