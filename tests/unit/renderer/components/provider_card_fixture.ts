import { vi } from "vitest";
import type {
    ProviderUsageGroup,
    ProviderUsagePeriod,
} from "../../../../src/renderer/lib/provider-usage";

export function hex_to_rgb(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
}

export function makeGroup(overrides: Partial<ProviderUsageGroup> = {}): ProviderUsageGroup {
    return {
        provider: "deepseek",
        label: "DeepSeek",
        accountCount: 1,
        status: "normal",
        updatedAt: "2026-06-02T10:00:00Z",
        observedAt: 1748858400000,
        source: "poll",
        stale: false,
        periods: [
            {
                id: "w1",
                provider: "deepseek",
                source: "poll",
                sourceInstanceId: "ds-1",
                connectorInstanceId: "ds-1",
                connectorDisplayName: "DeepSeek",
                accountId: "acc1",
                accountLabel: "Account 1",
                raw_label: "",
                name: "Tokens",
                used: 5000,
                limit: 10000,
                displayStyle: "ratio",
                resetAt: null,
                status: "normal",
                updatedAt: "2026-06-02T10:00:00Z",
                observedAt: 1748858400000,
                stale: false,
            },
        ],
        accounts: [
            {
                id: "acc1",
                sourceInstanceId: "ds-1",
                accountId: "acc1",
                accountLabel: "Account 1",
                status: "normal",
                updatedAt: "2026-06-02T10:00:00Z",
                observedAt: 1748858400000,
                stale: false,
                periods: [
                    {
                        id: "w1",
                        provider: "deepseek",
                        source: "poll",
                        sourceInstanceId: "ds-1",
                        connectorInstanceId: "ds-1",
                        connectorDisplayName: "DeepSeek",
                        accountId: "acc1",
                        accountLabel: "Account 1",
                        raw_label: "",
                        name: "Tokens",
                        used: 5000,
                        limit: 10000,
                        displayStyle: "ratio",
                        resetAt: null,
                        status: "normal",
                        updatedAt: "2026-06-02T10:00:00Z",
                        observedAt: 1748858400000,
                        stale: false,
                    },
                ],
            },
        ],
        ...overrides,
    };
}

export function makePeriod(overrides: Partial<ProviderUsagePeriod> = {}): ProviderUsagePeriod {
    return {
        id: "w-overview",
        provider: "deepseek",
        source: "poll",
        sourceInstanceId: "ds-overview",
        connectorInstanceId: "ds-overview",
        connectorDisplayName: "DeepSeek",
        accountId: "acc-overview",
        accountLabel: "Account Overview",
        raw_label: "",
        name: "5小时",
        used: 0,
        limit: 0,
        displayStyle: "ratio",
        resetAt: null,
        status: "normal",
        updatedAt: "2026-06-02T10:00:00Z",
        observedAt: 1748858400000,
        stale: false,
        ...overrides,
    };
}

export function setupWindowUsageboard(): void {
    window.usageboard = {
        platform: "win32",
        plugin: {
            list: vi.fn(),
            getState: vi.fn(),
            refresh: vi.fn(),
            refreshAll: vi.fn(),
        },
        config: {
            get: vi.fn().mockResolvedValue({ config: {}, hasSecrets: {} }),
            save: vi.fn().mockResolvedValue(undefined),
            getSecrets: vi.fn().mockResolvedValue({}),
            saveSecrets: vi.fn(),
            duplicate: vi.fn(),
            export: vi.fn(),
            import: vi.fn(),
        },
        event: {
            onStateChange: vi.fn(() => vi.fn()),
            onThemeChange: vi.fn(),
            onSettingsNavigate: vi.fn(() => vi.fn()),
            onConfigChange: vi.fn(() => vi.fn()),
        },
        popup: { report_content_height: vi.fn() },
        main_panel: { hide: vi.fn(), get_mode: vi.fn().mockResolvedValue("popup") },
        settings: { open: vi.fn(), minimize: vi.fn(), maximize: vi.fn(), close: vi.fn() },
        log: vi.fn(),
    } as unknown as typeof window.usageboard;
}
