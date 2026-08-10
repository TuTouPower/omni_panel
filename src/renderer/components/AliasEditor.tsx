import { useCallback } from "react";
import { SetGroupLabel } from "./settings/SetRow";

export interface AliasEntry {
    alias: string;
    values: string[];
}

interface AliasEditorProps {
    label: string;
    itemLabel: string;
    entries: readonly { alias: string; values: readonly string[] }[];
    onChange: (next: AliasEntry[]) => void;
}

function to_mutable(
    entries: readonly { alias: string; values: readonly string[] }[],
): AliasEntry[] {
    return entries.map((en) => ({ alias: en.alias, values: [...en.values] }));
}

const alias_input_class =
    "h-8 rounded-md border border-[var(--color-outline)] bg-[var(--color-field-bg)] " +
    "px-2 text-[12.5px] text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-muted)] " +
    "focus-visible:outline-none focus-visible:border-[var(--color-accent)] focus-visible:ring-2 " +
    "focus-visible:ring-[var(--color-accent-ring)]";

/** Editor for a list of {alias, values[]} — used for dir aliases and model aliases. */
export function AliasEditor({ label, itemLabel, entries, onChange }: AliasEditorProps) {
    const emit = useCallback(
        (next: AliasEntry[]) => {
            onChange(next);
        },
        [onChange],
    );

    const set_alias = (i: number, alias: string) => {
        emit(to_mutable(entries).map((en, j) => (j === i ? { ...en, alias } : en)));
    };
    const set_values = (i: number, raw: string) => {
        const values = raw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        emit(to_mutable(entries).map((en, j) => (j === i ? { ...en, values } : en)));
    };
    const remove = (i: number) => {
        emit(to_mutable(entries).filter((_, j) => j !== i));
    };
    const add = () => {
        emit([...to_mutable(entries), { alias: "", values: [] }]);
    };

    return (
        <div className="mt-4 flex flex-col gap-2">
            <SetGroupLabel>{label}</SetGroupLabel>
            {entries.map((entry, i) => (
                <div key={i} className="flex items-center gap-2">
                    <input
                        className={alias_input_class + " w-28 shrink-0"}
                        value={entry.alias}
                        placeholder="别名"
                        onChange={(e) => {
                            set_alias(i, e.target.value);
                        }}
                    />
                    <input
                        className={alias_input_class + " min-w-0 flex-1"}
                        value={entry.values.join(", ")}
                        placeholder={`${itemLabel}，逗号分隔`}
                        onChange={(e) => {
                            set_values(i, e.target.value);
                        }}
                    />
                    <button
                        type="button"
                        className="shrink-0 cursor-pointer rounded-md border border-[var(--color-outline)] bg-[var(--color-field-bg)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--color-on-surface-variant)] transition-feedback hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-on-surface)]"
                        onClick={() => {
                            remove(i);
                        }}
                    >
                        删除
                    </button>
                </div>
            ))}
            <button
                type="button"
                className="self-start cursor-pointer rounded-md border border-[var(--color-outline)] bg-[var(--color-field-bg)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--color-on-surface-variant)] transition-feedback hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-on-surface)]"
                onClick={add}
            >
                添加
            </button>
        </div>
    );
}
