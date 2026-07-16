import { useState, useEffect } from "react";
import type { UsageProvider } from "../../shared/schemas/plugin-output";
import type {
    AccountLabels,
    AccountOverrides,
    UsageBarColorScheme,
    UsageBarStyle,
} from "../../shared/types/config";

export interface PopupUiConfig {
    main_panel_mode: "popup" | "floating";
    usage_bar_color_scheme: UsageBarColorScheme;
    usage_bar_style: UsageBarStyle;
    convergent_time_minutes: number | undefined;
    account_overrides: AccountOverrides | undefined;
    account_labels: AccountLabels | undefined;
    account_label_maps: Readonly<Record<string, Readonly<Record<string, string>>>> | undefined;
    provider_label_maps:
        | Readonly<Partial<Record<UsageProvider, Readonly<Record<string, string>>>>>
        | undefined;
    ui_desensitize_remarks: boolean;
    provider_force_percent: Readonly<Partial<Record<UsageProvider, boolean>>> | undefined;
    token_panel_collapsed: boolean;
    set_main_panel_mode: (mode: "popup" | "floating") => void;
    set_usage_bar_color_scheme: (scheme: UsageBarColorScheme) => void;
    set_usage_bar_style: (style: UsageBarStyle) => void;
    set_convergent_time_minutes: (minutes: number | undefined) => void;
    set_account_overrides: (overrides: AccountOverrides | undefined) => void;
    set_account_labels: (labels: AccountLabels | undefined) => void;
    set_account_label_maps: (
        maps: Readonly<Record<string, Readonly<Record<string, string>>>> | undefined,
    ) => void;
    set_provider_label_maps: (
        maps:
            | Readonly<Partial<Record<UsageProvider, Readonly<Record<string, string>>>>>
            | undefined,
    ) => void;
    set_ui_desensitize_remarks: (value: boolean) => void;
    set_provider_force_percent: (
        value: Readonly<Partial<Record<UsageProvider, boolean>>> | undefined,
    ) => void;
    set_token_panel_collapsed: (value: boolean | ((prev: boolean) => boolean)) => void;
}

export function usePopupUiConfig(): PopupUiConfig {
    const [main_panel_mode, set_main_panel_mode] = useState<"popup" | "floating">("popup");
    const [usage_bar_color_scheme, set_usage_bar_color_scheme] =
        useState<UsageBarColorScheme>("risk-current");
    const [usage_bar_style, set_usage_bar_style] = useState<UsageBarStyle>("thin");
    const [convergent_time_minutes, set_convergent_time_minutes] = useState<number | undefined>(
        undefined,
    );
    const [account_overrides, set_account_overrides] = useState<AccountOverrides | undefined>(
        undefined,
    );
    const [account_labels, set_account_labels] = useState<AccountLabels | undefined>(undefined);
    const [account_label_maps, set_account_label_maps] = useState<
        Readonly<Record<string, Readonly<Record<string, string>>>> | undefined
    >(undefined);
    const [provider_label_maps, set_provider_label_maps] = useState<
        Readonly<Partial<Record<UsageProvider, Readonly<Record<string, string>>>>> | undefined
    >(undefined);
    const [ui_desensitize_remarks, set_ui_desensitize_remarks] = useState(false);
    const [provider_force_percent, set_provider_force_percent] = useState<
        Readonly<Partial<Record<UsageProvider, boolean>>> | undefined
    >(undefined);
    const [token_panel_collapsed, set_token_panel_collapsed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        window.usageboard.main_panel
            .get_mode()
            .then((mode) => {
                if (!cancelled) set_main_panel_mode(mode);
            })
            .catch((err: unknown) => {
                window.usageboard.log({
                    level: "error",
                    module: "PopupView",
                    message: `config persistence failed: ${err instanceof Error ? err.message : String(err)}`,
                });
                if (!cancelled) set_main_panel_mode("popup");
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return {
        main_panel_mode,
        usage_bar_color_scheme,
        usage_bar_style,
        convergent_time_minutes,
        account_overrides,
        account_labels,
        account_label_maps,
        provider_label_maps,
        ui_desensitize_remarks,
        provider_force_percent,
        token_panel_collapsed,
        set_main_panel_mode,
        set_usage_bar_color_scheme,
        set_usage_bar_style,
        set_convergent_time_minutes,
        set_account_overrides,
        set_account_labels,
        set_account_label_maps,
        set_provider_label_maps,
        set_ui_desensitize_remarks,
        set_provider_force_percent,
        set_token_panel_collapsed,
    };
}
