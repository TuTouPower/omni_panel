import { useState } from "react";
import { Input } from "../ui/Input";
import { Icon } from "../Icon";

/** 目录末级名，如 "~/dev/paygate" → "paygate"（对齐 demo dirName）。 */
export function dir_name(path: string): string {
    const segs = path.split("/").filter(Boolean);
    return segs[segs.length - 1] ?? path;
}

interface DirectoryChipsFilterProps {
    readonly directories: readonly string[];
    readonly on_change: (dirs: string[]) => void;
}

/**
 * 会话库「添加目录」筛选（对齐 demo WorkdirFilter）：文件夹图标输入框，
 * 回车添加（支持逗号/空白分隔批量），已加目录以 chips 展示（末级名 + X 移除）。
 * 值为精确匹配列表，后端走 directories[]（OR）。
 */
export function DirectoryChipsFilter({ directories, on_change }: DirectoryChipsFilterProps) {
    const [input, set_input] = useState("");

    const add = (raw: string): void => {
        const parts = raw
            .split(/[,，\s]+/)
            .map((x) => x.trim())
            .filter(Boolean);
        if (parts.length === 0) return;
        const next = [...directories];
        for (const v of parts) {
            if (!next.includes(v)) next.push(v);
        }
        on_change(next);
        set_input("");
    };

    return (
        <div className="flex flex-col gap-2" data-testid="directory-filter">
            <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-on-surface-muted)]">
                    <Icon name="folder" size={14} strokeWidth={1.8} />
                </span>
                <Input
                    aria-label="添加目录"
                    className="pl-8"
                    placeholder="输入工作目录，回车添加…"
                    value={input}
                    onChange={(e) => {
                        set_input(e.target.value);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && input.trim()) {
                            e.preventDefault();
                            add(input);
                        }
                    }}
                />
            </div>
            {directories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {directories.map((d) => (
                        <span
                            key={d}
                            className="inline-flex max-w-full items-center gap-1 rounded-xs bg-[var(--color-surface-raised)] py-1 pl-2 pr-1 text-[length:var(--text-label-md)] text-[var(--color-on-surface-variant)]"
                            title={d}
                            data-testid="directory-chip"
                        >
                            <span className="truncate">{dir_name(d)}</span>
                            <button
                                type="button"
                                aria-label={`移除目录 ${d}`}
                                className="grid h-4 w-4 shrink-0 place-items-center rounded-sm text-[var(--color-on-surface-muted)] hover:text-[var(--color-error)]"
                                onClick={() => {
                                    on_change(directories.filter((x) => x !== d));
                                }}
                            >
                                <Icon name="close" size={10} />
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
