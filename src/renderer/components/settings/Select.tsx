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
        <select
            aria-label={ariaLabel}
            className="set-select"
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
        </select>
    );
}
