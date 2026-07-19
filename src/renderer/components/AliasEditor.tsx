import { useCallback } from "react";

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
        <div className="alias-editor">
            <div className="set-group-label">{label}</div>
            {entries.map((entry, i) => (
                <div key={i} className="alias-row">
                    <input
                        className="alias-name"
                        value={entry.alias}
                        placeholder="别名"
                        onChange={(e) => {
                            set_alias(i, e.target.value);
                        }}
                    />
                    <input
                        className="alias-values"
                        value={entry.values.join(", ")}
                        placeholder={`${itemLabel}，逗号分隔`}
                        onChange={(e) => {
                            set_values(i, e.target.value);
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => {
                            remove(i);
                        }}
                    >
                        删除
                    </button>
                </div>
            ))}
            <button type="button" onClick={add}>
                添加
            </button>
        </div>
    );
}
