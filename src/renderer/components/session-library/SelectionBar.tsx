import { Icon } from "../Icon";
import { cn } from "../../lib/utils";

interface SelectionBarProps {
    readonly count: number;
    readonly total_filtered: number;
    readonly on_select_all: () => void;
    readonly on_clear: () => void;
    readonly on_compare: () => void;
}

/**
 * 会话库浮动选择条（对齐 demo SelectionBar）：
 * 已选 n 条 / 全选结果 (N) / 清空 / 同屏查看 →
 */
export function SelectionBar({
    count,
    total_filtered,
    on_select_all,
    on_clear,
    on_compare,
}: SelectionBarProps) {
    if (count === 0) return null;
    return (
        <div
            className="fixed bottom-5 left-1/2 z-[var(--z-sticky)] -translate-x-1/2"
            data-testid="selection-bar"
        >
            <div
                className={cn(
                    "glass-menu flex items-center gap-1 rounded-[10px]",
                    "border border-[var(--color-outline)] px-1.5 py-1.5",
                )}
            >
                <span className="px-2 text-[length:var(--text-label-md)] tabular-nums text-[var(--color-primary)]">
                    已选 {count} 条
                </span>
                <button
                    type="button"
                    className="cursor-pointer rounded-[8px] px-2.5 py-1.5 text-[length:var(--text-label-md)] text-[var(--color-on-surface-variant)] transition-feedback hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-on-surface)]"
                    onClick={on_select_all}
                >
                    全选结果 ({total_filtered})
                </button>
                <button
                    type="button"
                    className="cursor-pointer rounded-[8px] px-2.5 py-1.5 text-[length:var(--text-label-md)] text-[var(--color-on-surface-variant)] transition-feedback hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-error)]"
                    onClick={on_clear}
                >
                    清空
                </button>
                <button
                    type="button"
                    className="ml-1 flex cursor-pointer items-center gap-1.5 rounded-[8px] bg-[var(--color-primary)] px-3 py-1.5 text-[length:var(--text-label-md)] font-semibold text-[var(--color-on-primary)] transition-feedback hover:bg-[var(--color-primary-strong)]"
                    onClick={on_compare}
                >
                    <Icon name="columns2" size={13} />
                    同屏查看 →
                </button>
            </div>
        </div>
    );
}
