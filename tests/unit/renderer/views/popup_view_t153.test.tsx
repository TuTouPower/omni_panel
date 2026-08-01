import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PopupView } from "../../../../src/renderer/views/PopupView";
import type { AppConfiguration } from "../../../../src/shared/types/config";

vi.mock("../../../../src/renderer/lib/theme", () => ({
    useTheme: () => undefined,
}));

import {
    base_popup_config,
    config_get,
    config_save,
    install_popup_usageboard,
    on_config_change,
    plugin_list,
} from "./popup_view_test_utils";

describe("PopupView t153", () => {
    beforeEach(() => {
        install_popup_usageboard();
    });

    it("does not save config on mount when persisted UI state already exists (t153)", async () => {
        config_get.mockResolvedValue({
            config: {
                ...base_popup_config,
                providerOrder: ["claude", "deepseek"],
                collapsedAccounts: {},
                expandedProviders: { deepseek: true },
            },
            hasSecrets: {},
        });

        render(<PopupView />);

        await waitFor(() => {
            expect(screen.getByRole("button", { name: /总览/ })).toBeInTheDocument();
        });
        // Flush the save queue: any persist effect that fired would have
        // chained config.get → config.save by now.
        await act(async () => {
            await Promise.resolve();
        });

        expect(config_save).not.toHaveBeenCalled();
    });

    it("ignores config broadcasts that change nothing relevant (t153)", async () => {
        let broadcast: ((config: AppConfiguration) => void) | undefined;
        on_config_change.mockImplementation((callback: (config: AppConfiguration) => void) => {
            broadcast = callback;
            return vi.fn();
        });

        render(<PopupView />);

        await waitFor(() => {
            expect(screen.getByRole("button", { name: /总览/ })).toBeInTheDocument();
        });
        const list_calls = plugin_list.mock.calls.length;

        // IPC broadcasts arrive deserialized — a fresh object every time.
        const echo = JSON.parse(JSON.stringify(base_popup_config)) as AppConfiguration;
        act(() => {
            broadcast?.(echo);
        });
        await act(async () => {
            await Promise.resolve();
        });

        expect(plugin_list.mock.calls.length).toBe(list_calls);
        expect(config_save).not.toHaveBeenCalled();
    });

    it("reloads plugins when a broadcast changes plugin structure (t153)", async () => {
        let broadcast: ((config: AppConfiguration) => void) | undefined;
        on_config_change.mockImplementation((callback: (config: AppConfiguration) => void) => {
            broadcast = callback;
            return vi.fn();
        });

        render(<PopupView />);

        await waitFor(() => {
            expect(screen.getByRole("button", { name: /总览/ })).toBeInTheDocument();
        });
        const list_calls = plugin_list.mock.calls.length;

        act(() => {
            broadcast?.({
                ...base_popup_config,
                plugins: [
                    {
                        instanceId: "p1",
                        stateId: "p1",
                        name: "deepseek",
                        enabled: true,
                        executablePath: "connectors/deepseek/connector.ts",
                        refreshIntervalSeconds: 300,
                        parameterValues: {},
                        endpointOverrides: {},
                    },
                ],
            });
        });

        await waitFor(() => {
            expect(plugin_list.mock.calls.length).toBeGreaterThan(list_calls);
        });
    });
});
