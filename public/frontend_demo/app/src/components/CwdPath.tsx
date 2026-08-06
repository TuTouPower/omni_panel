import { FolderGit2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** 路径中间截断：~/proj…end/app */
export function truncateMiddle(path: string, max = 26): string {
  if (path.length <= max) return path;
  const keep = max - 1; // 省略号占 1 位
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return `${path.slice(0, head)}…${path.slice(path.length - tail)}`;
}

interface CwdPathProps {
  cwd: string;
  /** 中间截断阈值（字符数） */
  max?: number;
  className?: string;
}

/**
 * CwdPath — 会话工作目录展示（mono + muted + FolderGit2 图标，
 * 超长中间截断，title 悬浮完整路径）
 */
export default function CwdPath({ cwd, max, className }: CwdPathProps) {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1 font-mono text-[10px] leading-tight text-text-muted',
        className,
      )}
      title={cwd}
    >
      <FolderGit2 className="h-3 w-3 shrink-0" />
      <span className="truncate">{truncateMiddle(cwd, max)}</span>
    </span>
  );
}
