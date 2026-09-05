import { useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { toLocalInput } from "../../lib/token-stats/format";

interface RangePickerProps {
    start: number;
    end: number;
    active: boolean;
    onApply: (range: { start: number; end: number }) => void;
    /** t312: 受控面板开关（时间范围下拉「自定义」触发）；缺省用内部状态。 */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** t451: 点击外部关闭时忽略的区域（如时间范围下拉与其同处一区，
     * 下拉选择手势的尾随 click 不得关掉刚打开的面板）。 */
    zoneRef?: RefObject<HTMLDivElement | null>;
}

export function RangePicker({
    start,
    end,
    active,
    onApply,
    open: openProp,
    onOpenChange,
    zoneRef,
}: RangePickerProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const open = openProp ?? internalOpen;
    const [localStart, setLocalStart] = useState(toLocalInput(start));
    const [localEnd, setLocalEnd] = useState(toLocalInput(end));
    // t451 AC-005: 非法区间行内报错（面板不关闭）。
    const [error, setError] = useState<string | null>(null);
    const wrapRef = useRef<HTMLDivElement>(null);

    const toggleOpen = () => {
        if (openProp === undefined) {
            setInternalOpen((v) => !v);
        } else {
            onOpenChange?.(!open);
        }
    };

    const closeOpen = () => {
        if (openProp === undefined) {
            setInternalOpen(false);
        } else {
            onOpenChange?.(false);
        }
    };

    // t451 AC-006: 面板打开期间不同步外部区间，保护编辑中的输入不被
    // 后台刷新（preset_range_revision 改写 currentRange）重置；关闭时
    // 回到同步（effect 随 open 变化重跑）。
    useEffect(() => {
        if (open) return;
        setLocalStart(toLocalInput(start));
        setLocalEnd(toLocalInput(end));
    }, [start, end, open]);

    // t451 AC-005: 打开面板时清掉上轮残留报错。
    useEffect(() => {
        if (open) setError(null);
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            // t451 AC-001: 同区的下拉选择手势不算「点击外部」。
            if (zoneRef?.current?.contains(target)) return;
            if (!wrapRef.current?.contains(target)) {
                if (openProp === undefined) {
                    setInternalOpen(false);
                } else {
                    onOpenChange?.(false);
                }
            }
        };
        document.addEventListener("click", handler);
        return () => {
            document.removeEventListener("click", handler);
        };
    }, [open, openProp, onOpenChange, zoneRef]);

    const apply = () => {
        const s = new Date(localStart).getTime();
        const e = new Date(localEnd).getTime();
        // t451 AC-005: 非法区间只报错，不回调、不关闭。
        if (Number.isNaN(s) || Number.isNaN(e)) {
            setError("请输入有效的开始与结束时间");
            return;
        }
        if (s >= e) {
            setError("结束时间必须晚于开始时间");
            return;
        }
        setError(null);
        onApply({ start: s, end: e });
        closeOpen();
    };

    return (
        <div className="relative" ref={wrapRef}>
            <Button
                variant="secondary"
                size="sm"
                className={
                    active
                        ? "border-[var(--color-accent)] bg-[var(--color-primary-container)]"
                        : undefined
                }
                title="自定义时间范围"
                onClick={(e) => {
                    e.stopPropagation();
                    toggleOpen();
                }}
            >
                📅 自定义
            </Button>
            {open && (
                <div
                    // t451 AC-008: 裸 z-menu 在 Tailwind v4 下无规则，换任意值写法。
                    className="absolute right-0 z-[var(--z-menu)] mt-2 w-[280px] rounded-lg border border-[var(--color-outline)] bg-[var(--color-surface-card)] p-3 shadow-menu"
                    onClick={(e) => {
                        e.stopPropagation();
                    }}
                >
                    <div className="flex flex-col gap-2">
                        <label className="text-[length:var(--text-label-md)] text-[var(--color-on-surface-variant)]">
                            开始
                            <Input
                                type="datetime-local"
                                className="mt-1"
                                value={localStart}
                                onChange={(e) => {
                                    setLocalStart(e.target.value);
                                    setError(null);
                                }}
                            />
                        </label>
                        <label className="text-[length:var(--text-label-md)] text-[var(--color-on-surface-variant)]">
                            结束
                            <Input
                                type="datetime-local"
                                className="mt-1"
                                value={localEnd}
                                onChange={(e) => {
                                    setLocalEnd(e.target.value);
                                    setError(null);
                                }}
                            />
                        </label>
                        {error && (
                            <p
                                role="alert"
                                className="m-0 text-[length:var(--text-label-md)] text-[var(--color-error)]"
                            >
                                {error}
                            </p>
                        )}
                        <Button
                            size="sm"
                            className="mt-1 self-end"
                            onClick={() => {
                                apply();
                            }}
                        >
                            应用
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
