import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { toLocalInput } from "../../lib/token-stats/format";

interface RangePickerProps {
    start: number;
    end: number;
    active: boolean;
    onApply: (range: { start: number; end: number }) => void;
}

export function RangePicker({ start, end, active, onApply }: RangePickerProps) {
    const [open, setOpen] = useState(false);
    const [localStart, setLocalStart] = useState(toLocalInput(start));
    const [localEnd, setLocalEnd] = useState(toLocalInput(end));
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setLocalStart(toLocalInput(start));
        setLocalEnd(toLocalInput(end));
    }, [start, end]);

    useEffect(() => {
        if (!open) return undefined;
        const handler = (e: MouseEvent) => {
            if (!wrapRef.current?.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("click", handler);
        return () => {
            document.removeEventListener("click", handler);
        };
    }, [open]);

    const apply = () => {
        const s = new Date(localStart).getTime();
        const e = new Date(localEnd).getTime();
        if (!Number.isNaN(s) && !Number.isNaN(e) && s < e) {
            onApply({ start: s, end: e });
        }
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
                    setOpen((v) => !v);
                }}
            >
                📅 自定义
            </Button>
            {open && (
                <div
                    className="absolute right-0 z-20 mt-2 w-[280px] rounded-lg border border-[var(--color-outline)] bg-[var(--color-surface-card)] p-3 shadow-lg"
                    onClick={(e) => {
                        e.stopPropagation();
                    }}
                >
                    <div className="flex flex-col gap-1.5">
                        <label className="text-label-md text-[var(--color-on-surface-variant)]">
                            开始
                            <Input
                                type="datetime-local"
                                className="mt-1"
                                value={localStart}
                                onChange={(e) => {
                                    setLocalStart(e.target.value);
                                }}
                            />
                        </label>
                        <label className="text-label-md text-[var(--color-on-surface-variant)]">
                            结束
                            <Input
                                type="datetime-local"
                                className="mt-1"
                                value={localEnd}
                                onChange={(e) => {
                                    setLocalEnd(e.target.value);
                                }}
                            />
                        </label>
                        <Button
                            size="sm"
                            className="mt-1 self-end"
                            onClick={() => {
                                apply();
                                setOpen(false);
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
