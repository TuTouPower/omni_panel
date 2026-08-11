/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/dot-notation, @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-unnecessary-type-assertion */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// --- Mock readers ---

const mock_scan_jsonls = vi.fn();
const mock_scan_kimi = vi.fn();
const mock_read_costs = vi.fn();
const mock_read_opencode = vi.fn();
const mock_scan_grok = vi.fn();

vi.mock("../../../../../src/main/core/token-stats/claude-reader", () => ({
    read_costs_jsonl: (...args: unknown[]) => mock_read_costs(...args),
    scan_session_jsonls: (...args: unknown[]) => mock_scan_jsonls(...args),
    create_session_scan_state: () => ({ mtimes: new Map(), files: new Map() }),
}));
vi.mock("../../../../../src/main/core/token-stats/opencode-reader", () => ({
    read_opencode_sessions: (...args: unknown[]) => mock_read_opencode(...args),
}));
vi.mock("../../../../../src/main/core/token-stats/kimi-reader", () => ({
    scan_kimi_wire_jsonls: (...args: unknown[]) => mock_scan_kimi(...args),
    create_kimi_scan_state: () => ({ mtimes: new Map(), files: new Map() }),
}));
vi.mock("../../../../../src/main/core/token-stats/grok-reader", () => ({
    scan_grok_updates: (...args: unknown[]) => mock_scan_grok(...args),
    create_grok_scan_state: () => ({ mtimes: new Map(), files: new Map() }),
}));

const mock_post_message = vi.fn();
(process as unknown as Record<string, unknown>)["parentPort"] = {
    postMessage: mock_post_message,
    on: vi.fn(),
};

import {
    collect,
    configure,
    reset_config,
    save_state,
    load_state,
    serialize_state,
    set_collector_host,
    jsonl_states,
    kimi_states,
    grok_states,
    costs_state,
    opencode_max_updated,
} from "../../../../../src/main/core/token-stats/collector";
import type { TokenStatsConfig } from "../../../../../src/shared/types/token-stats";

function make_config(state_path: string): TokenStatsConfig {
    return {
        win_home: "C:\\Users\\Test",
        wsl_enabled: false,
        wsl_distro: "Ubuntu-22.04",
        wsl_user: "testuser",
        poll_interval_ms: 600000,
        state_path,
    };
}

let tmp_file: string;

function make_facts(records: unknown[]): any {
    return {
        model: "claude-x",
        title: "t",
        directory: "d",
        min_ts: 1,
        max_ts: 2,
        session_id: "s1",
        calls: 1,
        sums: { input_tokens: 10, output_tokens: 5, cache_read_tokens: 1, cache_write_tokens: 1 },
        daily: new Map([
            ["2026-07-10|claude-x", { date: "2026-07-10", model: "claude-x", calls: 1 }],
        ]),
        records,
    } as any;
}

describe("collector scan-state persistence", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        reset_config();
        // Simulate a Windows host so the wsl (grok) source stays reachable (t308).
        set_collector_host("windows");
        tmp_file = path.join(
            os.tmpdir(),
            `t114-state-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
        );
        try {
            fs.unlinkSync(tmp_file);
        } catch {
            // ignore
        }
        mock_read_costs.mockReturnValue({ sessions: [], records: [], new_offset: 0, new_size: 0 });
        mock_scan_jsonls.mockReturnValue({
            sessions: [],
            daily: [],
            records: [],
            new_state: { mtimes: new Map(), files: new Map() },
        });
        mock_scan_kimi.mockReturnValue({
            sessions: [],
            daily: [],
            records: [],
            new_state: { mtimes: new Map(), files: new Map() },
        });
        mock_read_opencode.mockReturnValue({ sessions: [], daily: [], records: [] });
        mock_scan_grok.mockReturnValue({
            sessions: [],
            daily: [],
            records: [],
            new_state: { mtimes: new Map(), files: new Map() },
        });
    });

    afterEach(() => {
        try {
            fs.unlinkSync(tmp_file);
        } catch {
            // ignore
        }
    });

    it("serialize_state drops records and flattens daily", () => {
        jsonl_states.set("claude_jsonl_local", {
            mtimes: new Map([["proj/f1.jsonl", 1785000286795.3518]]),
            files: new Map([
                ["proj/f1.jsonl", { session_id: "s1", facts: make_facts([{ id: "r1" }]) }],
            ]),
        } as any);

        const serialized = serialize_state();
        const entry = (serialized as any).jsonl_states["claude_jsonl_local"].files["proj/f1.jsonl"];
        expect(entry.facts.records).toBeUndefined();
        expect(entry.facts.daily).toEqual({
            "2026-07-10|claude-x": { date: "2026-07-10", model: "claude-x", calls: 1 },
        });
        expect(entry.facts.model).toBe("claude-x");
        expect(entry.session_id).toBe("s1");
    });

    it("serialize_state keeps float mtime for strict equality round-trip", () => {
        const float_mtime = 1785000286795.3518;
        jsonl_states.set("claude_jsonl_local", {
            mtimes: new Map([["proj/f1.jsonl", float_mtime]]),
            files: new Map([["proj/f1.jsonl", { session_id: "s1", facts: make_facts([]) }]]),
        } as any);
        const serialized = serialize_state();
        const mtimes = (serialized as any).jsonl_states["claude_jsonl_local"].mtimes[
            "proj/f1.jsonl"
        ];
        expect(mtimes).toBe(float_mtime);
    });

    it("save then load round-trips full scan state", async () => {
        jsonl_states.set("claude_jsonl_local", {
            mtimes: new Map([["proj/f1.jsonl", 1785000286795.3518]]),
            files: new Map([
                ["proj/f1.jsonl", { session_id: "s1", facts: make_facts([{ id: "r1" }]) }],
            ]),
        } as any);
        kimi_states.set("kimi_local", {
            mtimes: new Map([["k.jsonl", 1700000000000]]),
            files: new Map([["k.jsonl", { session_id: "ks1", facts: make_facts([]) }]]),
        } as any);
        grok_states.set("grok_wsl", {
            mtimes: new Map([["enc/sid/updates.jsonl", 1785000286795.25]]),
            files: new Map([
                ["enc/sid/updates.jsonl", { session_id: "sid", facts: make_facts([]) }],
            ]),
        } as any);
        costs_state.set("claude_costs_local", { offset: 42, size: 100 });
        opencode_max_updated.set("opencode_local", 1700000000000);

        await save_state(tmp_file);
        expect(fs.existsSync(tmp_file)).toBe(true);

        reset_config();
        expect(jsonl_states.size).toBe(0);
        expect(kimi_states.size).toBe(0);
        expect(grok_states.size).toBe(0);
        expect(costs_state.size).toBe(0);
        expect(opencode_max_updated.size).toBe(0);

        await load_state(tmp_file);

        const claude_state = jsonl_states.get("claude_jsonl_local");
        expect(claude_state?.mtimes.get("proj/f1.jsonl")).toBe(1785000286795.3518);
        const claude_file = claude_state?.files.get("proj/f1.jsonl");
        expect(claude_file?.session_id).toBe("s1");
        expect(claude_file?.facts.records).toEqual([]);
        expect(claude_file?.facts.daily instanceof Map).toBe(true);
        expect(claude_file?.facts.daily.get("2026-07-10|claude-x")).toEqual({
            date: "2026-07-10",
            model: "claude-x",
            calls: 1,
        });

        expect(kimi_states.get("kimi_local")?.files.get("k.jsonl")?.session_id).toBe("ks1");
        // grok scan state round-trips with its float mtime intact (t197 AC4)
        const grok_state = grok_states.get("grok_wsl");
        expect(grok_state?.mtimes.get("enc/sid/updates.jsonl")).toBe(1785000286795.25);
        expect(grok_state?.files.get("enc/sid/updates.jsonl")?.session_id).toBe("sid");
        expect(costs_state.get("claude_costs_local")).toEqual({ offset: 42, size: 100 });
        expect(opencode_max_updated.get("opencode_local")).toBe(1700000000000);
    });

    it("load_state tolerates a corrupt file and leaves all state empty", async () => {
        // Pre-populate to prove load_state clears on corrupt input.
        costs_state.set("claude_costs_local", { offset: 1, size: 1 });
        jsonl_states.set("claude_jsonl_local", { mtimes: new Map(), files: new Map() } as any);
        grok_states.set("grok_wsl", { mtimes: new Map(), files: new Map() } as any);
        fs.writeFileSync(tmp_file, "{ this is not valid json");
        await load_state(tmp_file);
        expect(jsonl_states.size).toBe(0);
        expect(kimi_states.size).toBe(0);
        expect(grok_states.size).toBe(0);
        expect(costs_state.size).toBe(0);
        expect(opencode_max_updated.size).toBe(0);
    });

    it("load_state tolerates a missing file and leaves state empty", async () => {
        const missing = path.join(os.tmpdir(), `t114-missing-${Date.now()}.json`);
        await expect(load_state(missing)).resolves.toBeUndefined();
        expect(jsonl_states.size).toBe(0);
        expect(kimi_states.size).toBe(0);
        expect(grok_states.size).toBe(0);
        expect(costs_state.size).toBe(0);
        expect(opencode_max_updated.size).toBe(0);
    });

    it("save_state with empty path is a no-op (does not overwrite existing file)", async () => {
        // Pre-create the target file; save_state('') must not touch it.
        fs.writeFileSync(tmp_file, "pre-existing");
        await save_state("");
        expect(fs.readFileSync(tmp_file, "utf8")).toBe("pre-existing");
    });

    it("restored state is passed to reader on next collect (incremental resume)", async () => {
        // First collect: reader returns a new_state with a known mtime.
        const float_mtime = 1785000286795.3518;
        mock_scan_jsonls.mockReturnValue({
            sessions: [],
            daily: [],
            records: [],
            new_state: {
                mtimes: new Map([["proj/f1.jsonl", float_mtime]]),
                files: new Map([["proj/f1.jsonl", { session_id: "s1", facts: make_facts([]) }]]),
            },
        });
        configure(make_config("")); // no persistence path
        collect();
        expect(jsonl_states.get("claude_jsonl_local")?.mtimes.get("proj/f1.jsonl")).toBe(
            float_mtime,
        );

        // Persist, wipe, reload — simulating a restart.
        await save_state(tmp_file);
        reset_config();
        await load_state(tmp_file);

        // Second collect: reader must receive the restored state (mtime carried).
        mock_scan_jsonls.mockImplementation((_path: unknown, _env: unknown, state: any) => {
            // Reader sees the restored mtime -> would skip unchanged files.
            expect(state.mtimes.get("proj/f1.jsonl")).toBe(float_mtime);
            return {
                sessions: [],
                daily: [],
                records: [],
                new_state: state,
            };
        });
        configure(make_config(""));
        collect();
        // If the assertion inside the mock fired, the test would have failed.
        expect(mock_scan_jsonls).toHaveBeenCalled();
    });

    it("restored grok state is passed to the grok reader on next collect (t197 AC4)", async () => {
        // Need wsl_enabled so the grok source runs.
        const wsl_cfg = { ...make_config(""), wsl_enabled: true, wsl_user: "karon" };
        const float_mtime = 1785093854257.125;

        mock_scan_grok.mockReturnValue({
            sessions: [],
            daily: [],
            records: [],
            new_state: {
                mtimes: new Map([["enc/sid/updates.jsonl", float_mtime]]),
                files: new Map([
                    ["enc/sid/updates.jsonl", { session_id: "sid", facts: make_facts([]) }],
                ]),
            },
        });
        configure(wsl_cfg);
        expect(grok_states.get("grok_wsl")?.mtimes.get("enc/sid/updates.jsonl")).toBe(float_mtime);

        await save_state(tmp_file);
        reset_config();
        await load_state(tmp_file);

        mock_scan_grok.mockImplementation((_path: unknown, _env: unknown, state: any) => {
            expect(state.mtimes.get("enc/sid/updates.jsonl")).toBe(float_mtime);
            return { sessions: [], daily: [], records: [], new_state: state };
        });
        configure(wsl_cfg);
        expect(mock_scan_grok).toHaveBeenCalled();
    });
});
