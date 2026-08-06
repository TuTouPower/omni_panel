import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from '@/components/Toast';
import { cn } from '@/lib/utils';

interface CopyButtonProps {
  text: string;
  /** 复制成功后的 toast 文案 */
  toastMessage?: string;
  className?: string;
}

/**
 * CopyButton — 小型图标按钮，navigator.clipboard 复制 + Toast 反馈
 */
export default function CopyButton({ text, toastMessage = '已复制到剪贴板', className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard API 不可用（非安全上下文）时退化为 execCommand
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    toast(toastMessage);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="复制"
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded-chip border border-border-subtle',
        'bg-raised text-text-muted transition-colors duration-150',
        'hover:border-border-strong hover:text-text-primary',
        className,
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-lime" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
