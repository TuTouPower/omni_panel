import type { UsageBarColorScheme } from "../../../shared/types/config";
import { BAR_COLOR_SCHEMES } from "../../views/settings-view/lib";

export function BarSchemeField({
    value,
    onChange,
}: {
    value: UsageBarColorScheme;
    onChange: (value: UsageBarColorScheme) => void;
}) {
    return (
        <div className="bsf-list">
            {BAR_COLOR_SCHEMES.map((scheme) => {
                const on = value === scheme.value;
                return (
                    <button
                        key={scheme.value}
                        className={`bsf-opt${on ? " on" : ""}`}
                        type="button"
                        onClick={() => {
                            onChange(scheme.value);
                        }}
                    >
                        <span className={`bsf-radio${on ? " on" : ""}`}>
                            <i />
                        </span>
                        <span className="bsf-text">
                            <span className="bsf-title-row">
                                <span className="bsf-title">{scheme.title}</span>
                                {scheme.badge && <span className="bsf-badge">{scheme.badge}</span>}
                            </span>
                            <span className="bsf-sub">{scheme.sub}</span>
                        </span>
                        <span className="bsf-swatch">
                            {scheme.swatch.map((color, idx) => (
                                <span
                                    key={`${scheme.value}-${String(idx)}`}
                                    className="bsf-dot"
                                    style={{ background: color }}
                                />
                            ))}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
