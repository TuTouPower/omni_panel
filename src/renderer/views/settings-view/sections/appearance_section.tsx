import type { AppConfiguration } from "../../../../shared/types/config";
import { BarSchemeField } from "../../../components/settings/BarSchemeField";
import { SetGroupLabel, SetRow } from "../../../components/settings/SetRow";
import { Segmented } from "../../../components/ui/Segmented";
import { BAR_STYLE_LABELS, bar_style_label_to_value } from "../lib";
import { apply_accent } from "../../../lib/theme";

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
            <SetGroupLabel>主题</SetGroupLabel>
            <SetRow title="配色方案">
                <Segmented
                    value={themeMode}
                    options={[
                        { value: "light", label: "浅色" },
                        { value: "dark", label: "深色" },
                        { value: "system", label: "跟随系统" },
                    ]}
                    onChange={(newTheme) => {
                        void save_config({
                            ...config,
                            theme: newTheme,
                        });
                        window.usageboard.theme.set(newTheme);
                    }}
                />
            </SetRow>
            <SetRow title="强调色" sub="用于选中状态、进度条与主要操作">
                <div className="flex items-center gap-2">
                    {ACCENTS.map((c) => {
                        const selected = accentColor === c;
                        return (
                            <button
                                key={c}
                                className={
                                    "h-6 w-6 rounded-full border-2 border-transparent transition-transform " +
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)] " +
                                    (selected ? "scale-110 border-[var(--color-on-surface)]" : "")
                                }
                                style={{ background: c }}
                                aria-label={`强调色 ${c}`}
                                aria-pressed={selected}
                                onClick={() => {
                                    void save_config({ ...config, accentColor: c });
                                    // t268: 写统一 --accent 变量（strong/container/ring
                                    // 由 color-mix 在 CSS 派生），即时生效。
                                    apply_accent(c);
                                }}
                                type="button"
                            />
                        );
                    })}
                </div>
            </SetRow>
            <SetGroupLabel>用量条</SetGroupLabel>
            <SetRow title="用量条样式" sub="细线型保持紧凑；粗胶囊型把数值放进进度条内。">
                <Segmented
                    aria-label="用量条样式"
                    value={usageBarStyle}
                    options={BAR_STYLE_LABELS.map((label) => ({
                        value: bar_style_label_to_value(label),
                        label,
                    }))}
                    onChange={(value) => {
                        void save_config({
                            ...config,
                            usageBarStyle: value,
                        });
                    }}
                />
            </SetRow>
            <div className="flex flex-col gap-3 border-b border-[var(--color-hairline)] py-3">
                <div>
                    <div className="text-body-md font-medium text-[var(--color-on-surface)]">
                        用量条颜色方案
                    </div>
                    <div className="mt-0.5 text-body-sm text-[var(--color-on-surface-muted)]">
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
