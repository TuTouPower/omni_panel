import { afterEach, describe, expect, it } from "vitest";
import {
    create_local_api_server,
    type ControlState,
    type LocalAPIServer,
} from "../../../src/main/core/local-api/server";
import type { ObservationStore } from "../../../src/main/core/observation/observation-store";

describe("LocalAPI control state", () => {
    let api: LocalAPIServer | undefined;

    afterEach(async () => {
        await api?.stop();
        api = undefined;
    });

    it("exposes pause/login state and delegates autostart to the host", async () => {
        let state: ControlState = {
            pause: { paused: true, reasons: ["user"] },
            autostart: { available: true, enabled: false },
        };
        api = create_local_api_server({} as ObservationStore, {
            port: 0,
            control_deps: {
                refresh_all: () => undefined,
                pause: () => undefined,
                resume: () => undefined,
                restart: () => undefined,
                quit: () => undefined,
                get_state: () => state,
                autostart: () => {
                    state = {
                        ...state,
                        autostart: { available: true, enabled: true },
                    };
                    return state.autostart;
                },
            },
        });
        await api.start();
        const base = `http://127.0.0.1:${String(api.get_port())}`;

        const status = await fetch(`${base}/v1/control/status`);
        expect(status.status).toBe(200);
        await expect(status.json()).resolves.toEqual(state);

        const autostart = await fetch(`${base}/v1/control/autostart`, { method: "POST" });
        expect(autostart.status).toBe(200);
        await expect(autostart.json()).resolves.toEqual({
            status: "ok",
            autostart: { available: true, enabled: true },
        });
    });

    it("returns an explicit unavailable result without an OS capability", async () => {
        api = create_local_api_server({} as ObservationStore, {
            port: 0,
            control_deps: {
                refresh_all: () => undefined,
                pause: () => undefined,
                resume: () => undefined,
                restart: () => undefined,
                quit: () => undefined,
                autostart: () => ({ available: false, enabled: false }),
                get_state: () => ({
                    pause: { paused: false, reasons: [] },
                    autostart: { available: false, enabled: false },
                }),
            },
        });
        await api.start();

        const response = await fetch(
            `http://127.0.0.1:${String(api.get_port())}/v1/control/autostart`,
            { method: "POST" },
        );
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            status: "ok",
            autostart: { available: false, enabled: false },
        });
    });
});
