import type { AppConfiguration } from "../../../../shared/types/config";
import { BarSchemeField } from "../../../components/settings/BarSchemeField";
import { SetRow } from "../../../components/settings/SetRow";
import { BAR_STYLE_LABELS, bar_style_label_to_value } from "../lib";

const ACCENTS = ["#3d7afd", "#6f5cf6", "#0ea5a3", "#f5772f", "#e23744"];

export function AppearanceSection({
    config,
    save_config,
}: {
    config: AppConfiguration;
    save_config: (payload: AppConfiguration) => Promise<void>;
}) {
    const accentColor = config.accentColor ?? "#3d7afd";
    const themeMode = config.theme ?? "light";
    const usageBarColorScheme = config.usageBarColorScheme ?? "risk-current";
    const usageBarStyle = config.usageBarStyle ?? "thin";

    return (
        <>
            <div className="set-group-label">主题</div>
            <SetRow title="配色方案">
                <div className="set-seg">
                    {(
                        [
                            ["light", "浅色"],
                            ["dark", "深色"],
                            ["system", "跟随系统"],
                        ] as const
                    ).map(([k, lb]) => (
                        <button
                            key={k}
                            className={
                                (
                                    k === "system"
                                        ? themeMode ===
                                          (window.matchMedia("(prefers-color-scheme: dark)").matches
                                              ? "dark"
                                              : "light")
                                        : themeMode === k
                                )
                                    ? "on"
                                    : ""
                            }
                            onClick={() => {
                                const newTheme = k;
                                void save_config({
                                    ...config,
                                    theme: newTheme,
                                });
                                window.usageboard.theme.set(newTheme);
                            }}
                            type="button"
                        >
                            {lb}
                        </button>
                    ))}
                </div>
            </SetRow>
            <SetRow title="强调色" sub="用于选中状态、进度条与主要操作">
                <div className="accent-row">
                    {ACCENTS.map((c) => (
                        <button
                            key={c}
                            className={`accent-sw${accentColor === c ? " on" : ""}`}
                            style={{ background: c, color: c }}
                            onClick={() => {
                                void save_config({ ...config, accentColor: c });
                                // Apply accent CSS variable immediately
                                if (c === "#3d7afd") {
                                    document.documentElement.style.removeProperty("--blue");
                                } else {
                                    document.documentElement.style.setProperty("--blue", c);
                                }
                            }}
                            type="button"
                        />
                    ))}
                </div>
            </SetRow>
            <div className="set-group-label">用量条</div>
            <SetRow title="用量条样式" sub="细线型保持紧凑；粗胶囊型把数值放进进度条内。">
                <div className="set-seg" aria-label="用量条样式">
                    {BAR_STYLE_LABELS.map((label) => {
                        const value = bar_style_label_to_value(label);
                        return (
                            <button
                                key={label}
                                className={usageBarStyle === value ? "on" : ""}
                                onClick={() => {
                                    void save_config({
                                        ...config,
                                        usageBarStyle: value,
                                    });
                                }}
                                type="button"
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            </SetRow>
            <div className="set-row set-row-stack">
                <div className="sr-text">
                    <div className="sr-title">用量条颜色方案</div>
                    <div className="sr-sub">
                        控制所有用量条的取色方式。默认按当前用量显示风险色。
                    </div>
                </div>
                <BarSchemeField
                    value={usageBarColorScheme}
                    onChange={(value) => {
                        void save_config({
                            ...config,
                            usageBarColorScheme: value,
                        });
                    }}
                />
            </div>
        </>
    );
}
