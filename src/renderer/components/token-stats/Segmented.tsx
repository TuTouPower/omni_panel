export interface SegmentedOption<T extends string> {
    value: T;
    label: string;
    disabled?: boolean;
}

interface SegmentedProps<T extends string> {
    options: SegmentedOption<T>[];
    value: T | "" | null;
    onChange: (value: T) => void;
    size?: "sm" | "default";
}

export function Segmented<T extends string>({
    options,
    value,
    onChange,
    size = "default",
}: SegmentedProps<T>) {
    return (
        <div className={`seg ${size === "sm" ? "sm" : ""}`}>
            {options.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    disabled={opt.disabled}
                    className={value === opt.value ? "on" : ""}
                    onClick={() => {
                        onChange(opt.value);
                    }}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}
