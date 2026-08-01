import type { CSSProperties } from "react";
import type { ProviderUsageGroup } from "../../lib/provider-usage";
import { createLogger } from "../../../shared/lib/logger";

/* ── constants ── */
export const MODULE = "PopupView";
export const log = createLogger("renderer:popup-view");
export const should_log_raw = import.meta.env.DEV;
export const token_panel_enabled = import.meta.env["VITE_ENABLE_TOKEN_PANEL"] === "1";

export const popup_mirror_style: CSSProperties = {
    position: "fixed",
    top: 0,
    left: -99999,
    width: "100%",
    height: "auto",
    maxHeight: "none",
    pointerEvents: "none",
    visibility: "hidden",
};

/* ── helpers ── */
export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function structural_signature(groups: readonly ProviderUsageGroup[]): string {
    return groups.map((g) => g.provider + ":" + g.accounts.map((a) => a.id).join(",")).join("|");
}

export function arrays_equal<T>(left: readonly T[] | undefined, right: readonly T[]): boolean {
    return left?.length === right.length && left.every((value, index) => value === right[index]);
}

export function account_orders_equal(
    left: Readonly<Record<string, readonly string[]>>,
    right: Readonly<Record<string, readonly string[]>>,
): boolean {
    const left_keys = Object.keys(left);
    const right_keys = Object.keys(right);
    if (left_keys.length !== right_keys.length) return false;
    return left_keys.every((key) => {
        const right_order = right[key];
        return right_order !== undefined && arrays_equal(left[key], right_order);
    });
}

/** Shallow equality for boolean dictionaries (collapsed/expanded state). */
export function record_bool_equal(
    left: Readonly<Record<string, boolean>>,
    right: Readonly<Record<string, boolean>>,
): boolean {
    const left_keys = Object.keys(left);
    const right_keys = Object.keys(right);
    if (left_keys.length !== right_keys.length) return false;
    return left_keys.every((key) => right[key] === left[key]);
}
