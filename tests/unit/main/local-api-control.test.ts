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

    it("t481 exposes the host-owned dev panel scan state and actions", async () => {
        const calls: string[] = [];
        const state = {
            status: "idle" as const,
            scan_id: null,
            started_at: null,
            result: null,
            error: null,
        };
        api = create_local_api_server({} as ObservationStore, {
            port: 0,
            dev_panel_deps: {
                manager: {
                    start: (configuration) => {
                        calls.push(`scan:${configuration.commitCutoff}`);
                        return { scan_id: "scan-1", status: "running", reused: false };
                    },
                    get_status: () => state,
                    cancel: () => {
                        calls.push("cancel");
                    },
                },
                model_routing: {
                    get_config: vi.fn(),
                    get_channels: vi.fn(),
                    save: vi.fn(),
                    test: vi.fn(),
                    get_snapshot_info: vi.fn(),
                },
            },
        });
        await api.start();
        const base = `http://127.0.0.1:${String(api.get_port())}`;

        const status = await fetch(`${base}/v1/devPanel/status`);
        expect(status.status).toBe(200);
        await expect(status.json()).resolves.toEqual(state);

        const scan = await fetch(`${base}/v1/devPanel/scan`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                scanRoots: ["/tmp/repos"],
                commitCutoff: "2026-03-20",
                currentUserOnly: false,
            }),
        });
        expect(scan.status).toBe(200);
        await expect(scan.json()).resolves.toEqual({
            scan_id: "scan-1",
            status: "running",
            reused: false,
        });

        const cancel = await fetch(`${base}/v1/devPanel/cancel`, { method: "POST" });
        expect(cancel.status).toBe(200);
        expect(calls).toEqual(["scan:2026-03-20", "cancel"]);
    });

    it("t482 exposes model routing through the same host-owned Web API", async () => {
        const model_routing = {
            get_config: () =>
                Promise.resolve({
                    config_path: "/tmp/new_api.yaml",
                    settings_path: "/tmp/settings.json",
                    models: ["claude-sonnet"],
                    aliases: {},
                    expanded_slots: ["default_model"],
                    settings_present: true,
                }),
            get_channels: () => Promise.resolve({ fetched_at: "now", channels: [] }),
            save: () =>
                Promise.resolve({
                    success: true,
                    snapshot: { snapshot_id: "snapshot-1", created_at: "now", channel_count: 0 },
                    changes: [],
                }),
            test: () =>
                Promise.resolve({ success: true, model_name: "claude-sonnet", error: null }),
            get_snapshot_info: () =>
                Promise.resolve({ snapshot_id: "snapshot-1", created_at: "now", channel_count: 0 }),
        };
        api = create_local_api_server({} as ObservationStore, {
            port: 0,
            dev_panel_deps: {
                manager: {
                    start: () => ({ scan_id: "scan-1", status: "running", reused: false }),
                    get_status: () => ({
                        status: "idle",
                        scan_id: null,
                        started_at: null,
                        result: null,
                        error: null,
                    }),
                    cancel: () => undefined,
                },
                model_routing,
            },
        });
        await api.start();
        const base = `http://127.0.0.1:${String(api.get_port())}`;

        await expect(
            fetch(`${base}/v1/devPanel/modelRouting/config`).then((response) => response.json()),
        ).resolves.toMatchObject({
            models: ["claude-sonnet"],
        });
        await expect(
            fetch(`${base}/v1/devPanel/modelRouting/channels`).then((response) => response.json()),
        ).resolves.toEqual({
            fetched_at: "now",
            channels: [],
        });
        const save = await fetch(`${base}/v1/devPanel/modelRouting/save`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                selections: { default_model: "claude-sonnet" },
                confirmed: true,
            }),
        });
        expect(save.status).toBe(200);
        await expect(save.json()).resolves.toMatchObject({ success: true });
        const declined = await fetch(`${base}/v1/devPanel/modelRouting/save`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                selections: { default_model: "claude-sonnet" },
                confirmed: false,
            }),
        });
        expect(declined.status).toBe(400);
        const test = await fetch(`${base}/v1/devPanel/modelRouting/test`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ slot: "default_model", model: "claude-sonnet" }),
        });
        await expect(test.json()).resolves.toEqual({
            success: true,
            model_name: "claude-sonnet",
            error: null,
        });
        await expect(
            fetch(`${base}/v1/devPanel/modelRouting/snapshot`).then((response) => response.json()),
        ).resolves.toMatchObject({ snapshot_id: "snapshot-1" });
    });
});
