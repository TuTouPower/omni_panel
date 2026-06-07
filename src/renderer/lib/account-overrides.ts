import type { AccountOverrides } from "../../shared/types/config";
import type { UsageProvider } from "../../shared/schemas/plugin-output";

export function add_account_override(
    overrides: AccountOverrides | undefined,
    kind: "hidden" | "disabled",
    provider: string,
    accountId: string,
): AccountOverrides {
    const current = overrides ?? {};
    const list = Array.from(
        new Set([...(current[kind]?.[provider as UsageProvider] ?? []), accountId]),
    );
    return {
        ...current,
        [kind]: { ...(current[kind] ?? {}), [provider]: list },
    };
}

export function remove_account_override(
    overrides: AccountOverrides,
    kind: "hidden" | "disabled",
    provider: string,
    accountId: string,
): AccountOverrides {
    const current_list = overrides[kind]?.[provider as UsageProvider];
    if (!current_list) return overrides;
    const next_list = current_list.filter((id) => id !== accountId);
    const rest = { ...(overrides[kind] ?? {}) };
    if (next_list.length === 0) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete rest[provider];
    } else {
        rest[provider] = next_list;
    }
    if (Object.keys(rest).length > 0) {
        return { ...overrides, [kind]: rest };
    }
    return Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== kind));
}
