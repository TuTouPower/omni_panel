import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Kbd — 快捷键键帽 (design.md §8.7)
 * bg-raised + border-strong 1px + 底部 2px 内阴影，11px JetBrains Mono，圆角 5px
 */
export default function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5',
        'rounded-[5px] bg-raised border border-border-strong',
        'font-mono text-[11px] leading-none text-text-secondary',
        'shadow-[inset_0_-2px_0_rgba(0,0,0,0.35)]',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
