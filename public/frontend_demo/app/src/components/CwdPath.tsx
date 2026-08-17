import { FolderGit2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** 取路径最后一段（basename）；根路径/空串回退原值（t430 AC-007）。 */
export function pathBasename(path: string): string {
  if (!path) return path;
  const cleaned = path.replace(/[\\/]+$/, '');
  if (!cleaned) return path;
  const parts = cleaned.split(/[\\/]/);
  const last = parts[parts.length - 1];
  return last ?? path;
}

interface CwdPathProps {
  cwd: string;
  className?: string;
}

/**
 * CwdPath — 会话工作目录展示（mono + muted + FolderGit2 图标，
 * t430：只显示 basename（最后一段），title 悬浮完整路径）
 */
export default function CwdPath({ cwd, className }: CwdPathProps) {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1 font-mono text-[10px] leading-tight text-text-muted',
        className,
      )}
      title={cwd}
    >
      <FolderGit2 className="h-3 w-3 shrink-0" />
      <span className="truncate">{pathBasename(cwd)}</span>
    </span>
  );
}
