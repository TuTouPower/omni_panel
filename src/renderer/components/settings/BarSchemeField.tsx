import type { UsageBarColorScheme } from "../../../shared/types/config";
import { BAR_COLOR_SCHEMES } from "../../views/settings-view/lib";
import { Button } from "../ui/Button";

export function BarSchemeField({
    value,
    onChange,
}: {
    value: UsageBarColorScheme;
    onChange: (value: UsageBarColorScheme) => void;
}) {
    return (
        <div className="flex flex-col gap-2">
            {BAR_COLOR_SCHEMES.map((scheme) => {
                const on = value === scheme.value;
                return (
                    <Button
                        key={scheme.value}
                        variant="secondary"
                        className={
                            "h-auto w-full justify-start gap-3 p-3 text-left " +
                            (on
                                ? "border-[var(--color-accent)] bg-[var(--color-primary-container)]"
                                : "")
                        }
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                            onChange(scheme.value);
                        }}
                    >
                        <span
                            className={
                                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border " +
                                (on
                                    ? "border-[var(--color-accent)]"
                                    : "border-[var(--color-on-surface-muted)]")
                            }
                        >
                            {on && (
                                <span className="h-2 w-2 rounded-full bg-[var(--color-accent)]" />
                            )}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                                <span className="text-body-md font-semibold">{scheme.title}</span>
                                {scheme.badge && (
                                    <span className="rounded bg-[var(--color-primary-container)] px-2 py-0.5 text-label-md text-[var(--color-accent)]">
                                        {scheme.badge}
                                    </span>
                                )}
                            </span>
                            <span className="mt-0.5 block text-body-sm text-[var(--color-on-surface-variant)]">
                                {scheme.sub}
                            </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                            {scheme.swatch.map((color, idx) => (
                                <span
                                    key={`${scheme.value}-${String(idx)}`}
                                    className="h-3 w-3 rounded-full"
                                    style={{ background: color }}
                                />
                            ))}
                        </span>
                    </Button>
                );
            })}
        </div>
    );
}
