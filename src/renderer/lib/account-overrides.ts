import type { AccountLabels, AccountOverrides } from "../../shared/types/config";
import type { UsageProvider } from "../../shared/schemas/plugin-output";

export type AccountOverrideKind = "hidden";

export function add_account_override(
    overrides: AccountOverrides | undefined,
    kind: AccountOverrideKind,
    provider: string,
    accountId: string,
): AccountOverrides {
    const provider_key = provider as UsageProvider;
    const current = overrides ?? {};
    const list = Array.from(new Set([...(current[kind]?.[provider_key] ?? []), accountId]));
    return {
        ...current,
        [kind]: { ...(current[kind] ?? {}), [provider_key]: list },
    };
}

export function remove_account_override(
    overrides: AccountOverrides,
    kind: AccountOverrideKind,
    provider: string,
    accountId: string,
): AccountOverrides {
    const provider_key = provider as UsageProvider;
    const current_list = overrides[kind]?.[provider_key];
    if (!current_list) return overrides;
    const next_list = current_list.filter((id) => id !== accountId);
    const rest = { ...(overrides[kind] ?? {}) };
    if (next_list.length === 0) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete rest[provider_key];
    } else {
        rest[provider_key] = next_list;
    }
    if (Object.keys(rest).length > 0) {
        return { ...overrides, [kind]: rest };
    }
    return Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== kind));
}

export function set_account_label(
    labels: AccountLabels | undefined,
    provider: string,
    accountId: string,
    label: string,
): AccountLabels {
    const provider_key = provider as UsageProvider;
    const current = labels ?? {};
    const current_map = current[provider_key] ?? {};
    return { ...current, [provider_key]: { ...current_map, [accountId]: label } };
}

export function remove_account_label(
    labels: AccountLabels,
    provider: string,
    accountId: string,
): AccountLabels {
    const provider_key = provider as UsageProvider;
    const current_map = labels[provider_key];
    if (!current_map || !(accountId in current_map)) return labels;
    const rest = { ...current_map };
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete rest[accountId];
    if (Object.keys(rest).length > 0) {
        return { ...labels, [provider_key]: rest };
    }
    return Object.fromEntries(Object.entries(labels).filter(([key]) => key !== provider_key));
}

export function add_watched_metric(
    overrides: AccountOverrides | undefined,
    provider: string,
    accountKey: string,
    raw_label: string,
): AccountOverrides {
    const provider_key = provider as UsageProvider;
    const current = overrides ?? {};
    const watched = current.upcomingResetWatched ?? {};
    const provider_map = watched[provider_key] ?? {};
    const list = Array.from(new Set([...(provider_map[accountKey] ?? []), raw_label]));
    return {
        ...current,
        upcomingResetWatched: {
            ...watched,
            [provider_key]: { ...provider_map, [accountKey]: list },
        },
    };
}

export function remove_watched_metric(
    overrides: AccountOverrides,
    provider: string,
    accountKey: string,
    raw_label: string,
): AccountOverrides {
    const provider_key = provider as UsageProvider;
    const watched = overrides.upcomingResetWatched;
    if (!watched) return overrides;
    const provider_map = watched[provider_key];
    if (!provider_map) return overrides;
    const current_list = provider_map[accountKey];
    if (!current_list) return overrides;
    const next_list = current_list.filter((label) => label !== raw_label);
    const next_provider_map = { ...provider_map };
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    if (next_list.length === 0) delete next_provider_map[accountKey];
    else next_provider_map[accountKey] = next_list;
    const next_watched = { ...watched };
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    if (Object.keys(next_provider_map).length === 0) delete next_watched[provider_key];
    else next_watched[provider_key] = next_provider_map;
    if (Object.keys(next_watched).length === 0) {
        return Object.fromEntries(
            Object.entries(overrides).filter(([key]) => key !== "upcomingResetWatched"),
        );
    }
    return { ...overrides, upcomingResetWatched: next_watched };
}
