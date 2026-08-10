import { Select as UiSelect } from "../ui/Select";

/**
 * 设置窗口下拉（t271：复用统一 ui/Select，保留 value/onChange/options API）。
 */
export function Select({
    value,
    onChange,
    options,
    ariaLabel,
}: {
    value: string;
    onChange: (v: string) => void;
    options: string[];
    ariaLabel?: string;
}) {
    return (
        <UiSelect
            aria-label={ariaLabel}
            value={value}
            onChange={(e) => {
                onChange(e.target.value);
            }}
        >
            {options.map((o) => (
                <option key={o} value={o}>
                    {o}
                </option>
            ))}
        </UiSelect>
    );
}
