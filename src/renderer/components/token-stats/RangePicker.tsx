import { useEffect, useRef, useState } from "react";
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
        <div className="calwrap" ref={wrapRef}>
            <button
                type="button"
                className={`calbtn ${active ? "on" : ""}`}
                title="自定义时间范围"
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen((v) => !v);
                }}
            >
                📅 自定义
            </button>
            {open && (
                <div
                    className="calpop"
                    onClick={(e) => {
                        e.stopPropagation();
                    }}
                >
                    <div className="calrow">
                        <span>开始</span>
                        <input
                            type="datetime-local"
                            className="dt"
                            value={localStart}
                            onChange={(e) => {
                                setLocalStart(e.target.value);
                            }}
                        />
                    </div>
                    <div className="calrow">
                        <span>结束</span>
                        <input
                            type="datetime-local"
                            className="dt"
                            value={localEnd}
                            onChange={(e) => {
                                setLocalEnd(e.target.value);
                            }}
                        />
                    </div>
                    <button
                        type="button"
                        className="calapply"
                        onClick={() => {
                            apply();
                            setOpen(false);
                        }}
                    >
                        应用
                    </button>
                </div>
            )}
        </div>
    );
}
