import type { AppConfiguration } from "../../../shared/types/config";
import type { MainPanelPlatform, MainPanelShellMode } from "./main-panel-types";

export function resolve_main_panel_mode(
    config: AppConfiguration,
    platform: MainPanelPlatform,
): MainPanelShellMode {
    const mode = config.mainPanelMode ?? "system";
    if (mode === "popup") {
        return "popup";
    }
    if (mode === "floating") {
        return "floating";
    }
    return platform === "darwin" ? "popup" : "floating";
}

export function resolve_floating_height_mode(config: AppConfiguration): "fixed" | "followContent" {
    return config.floatingHeightMode ?? "fixed";
}
