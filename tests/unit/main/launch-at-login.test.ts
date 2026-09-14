import { describe, expect, it, vi } from "vitest";
import {
    apply_launch_at_login,
    read_launch_at_login,
    type LoginItemApi,
} from "../../../src/main/core/launch-at-login";

function create_api(initial: boolean): LoginItemApi & { enabled: boolean } {
    const api = {
        enabled: initial,
        getLoginItemSettings: vi.fn(() => ({ openAtLogin: api.enabled })),
        setLoginItemSettings: vi.fn(({ openAtLogin }: { openAtLogin: boolean }) => {
            api.enabled = openAtLogin;
        }),
    };
    return api;
}

describe("launch-at-login single source", () => {
    it("reads and applies both enabled and disabled config states", () => {
        const api = create_api(false);

        expect(read_launch_at_login(api, "win32")).toEqual({
            available: true,
            enabled: false,
        });
        expect(apply_launch_at_login(api, true, "win32")).toEqual({
            available: true,
            enabled: true,
        });
        expect(apply_launch_at_login(api, false, "win32")).toEqual({
            available: true,
            enabled: false,
        });
        const calls = (api.setLoginItemSettings as unknown as { mock: { calls: unknown[][] } }).mock
            .calls;
        expect(calls[0]).toEqual([{ openAtLogin: true }]);
        expect(calls[1]).toEqual([{ openAtLogin: false }]);
    });

    it("reports Linux capability as unavailable without touching the OS API", () => {
        const api = create_api(true);

        expect(read_launch_at_login(api, "linux")).toEqual({
            available: false,
            enabled: false,
        });
        expect(apply_launch_at_login(api, false, "linux")).toEqual({
            available: false,
            enabled: false,
        });
        expect(
            (api.setLoginItemSettings as unknown as { mock: { calls: unknown[][] } }).mock.calls,
        ).toHaveLength(0);
    });
});
