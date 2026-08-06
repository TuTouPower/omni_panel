import { Plus } from 'lucide-react';

interface EmptyPaneSlotProps {
  slotIndex: number;
  onPick: () => void;
}

/**
 * EmptyPaneSlot — (design.md §8.10)
 * 虚线描边面板 + empty-pane.svg 插图 + 添加会话按钮；hover 虚线变实线、背景微亮
 */
export default function EmptyPaneSlot({ slotIndex, onPick }: EmptyPaneSlotProps) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="group flex h-full min-h-[280px] min-w-0 flex-col items-center justify-center gap-3 rounded-[12px] border border-dashed border-border-strong bg-panel/40 p-6 transition-colors duration-150 hover:border-solid hover:border-border-strong hover:bg-panel"
    >
      <img
        src="/empty-pane.svg"
        alt=""
        className="h-auto w-40 opacity-70 transition-opacity duration-150 group-hover:opacity-100"
      />
      <span className="flex items-center gap-1.5 rounded-btn border border-lime/50 px-3 py-1.5 text-[13px] font-medium text-lime transition-colors duration-150 group-hover:border-lime group-hover:bg-lime-dim">
        <Plus className="h-3.5 w-3.5" />
        添加会话
      </span>
      <span className="font-mono text-[11px] text-text-muted">
        槽位 {slotIndex + 1} · 拖入会话文件或从库中选择
      </span>
    </button>
  );
}
