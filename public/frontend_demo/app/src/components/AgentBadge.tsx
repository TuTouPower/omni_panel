import type { AgentId } from '@/lib/types';
import { AGENTS } from '@/lib/types';
import { cn } from '@/lib/utils';

interface AgentBadgeProps {
  agentId: AgentId;
  /** 显示模型名（12px mono, muted） */
  showModel?: boolean;
  /** 紧凑版：仅圆点 + 缩写 */
  compact?: boolean;
  className?: string;
}

/**
 * AgentBadge — (design.md §8.4)
 * 圆点 8px（Agent 色）+ Agent 名 + 可选模型名；紧凑版仅圆点 + 缩写
 */
export default function AgentBadge({ agentId, showModel = false, compact = false, className }: AgentBadgeProps) {
  const agent = AGENTS[agentId];
  if (compact) {
    return (
      <span className={cn('inline-flex items-center gap-1.5', className)} title={agent.name}>
        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: agent.color }} />
        <span className="font-mono text-[11px] font-medium text-text-secondary">{agent.abbr}</span>
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: agent.color }} />
      <span className="text-[13px] font-medium text-text-secondary">{agent.name}</span>
      {showModel && <span className="font-mono text-[12px] text-text-muted">{agent.model}</span>}
    </span>
  );
}
