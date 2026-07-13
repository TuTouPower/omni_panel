import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import type { Manifest } from "../../../src/shared/schemas/manifest";

const manifest: Manifest = {
    id: "codex",
    provider: "codex",
    capabilities: ["local"],
    parameters: [],
    endpoints: {},
    local: {
        paths: ["~/.codex/sessions", "~/.codex/archived_sessions"],
    },
    script: "connector.ts",
};

function make_jsonl(events: unknown[]): string {
    return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

function create_ctx(files: Record<string, string>): ConnectorContext {
    const listed_dirs = new Set<string>();
    return {
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        http: {
            get_json: () => Promise.resolve({}),
            post_json: () => Promise.resolve({}),
            get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
        },
        files: {
            list(dir_pattern: string) {
                listed_dirs.add(dir_pattern);
                const base = dir_pattern.endsWith("/") ? dir_pattern : dir_pattern + "/";
                return Promise.resolve(
                    Object.keys(files)
                        .filter((p) => p.startsWith(base) || p === dir_pattern)
                        .filter((p) => p !== dir_pattern),
                );
            },
            read(path: string) {
                const content = files[path];
                if (content === undefined) return Promise.reject(new Error(`ENOENT: ${path}`));
                return Promise.resolve(content);
            },
        },
        params: {},
        report_failed_account: () => undefined,
    };
}

describe("codex connector", () => {
    it("aggregates token deltas by model and day across sessions", async () => {
        const script = await readFile(join("connectors", "codex", "connector.ts"), "utf8");
        const file1 = make_jsonl([
            {
                type: "turn_context",
                payload: { model: "gpt-5" },
                timestamp: "2026-06-14T10:00:00Z",
            },
            {
                type: "response.completed",
                payload: {
                    type: "token_count",
                    info: { total_token_usage: { total_tokens: 1000 } },
                },
                timestamp: "2026-06-14T10:05:00Z",
            },
            {
                type: "response.completed",
                payload: {
                    type: "token_count",
                    info: { total_token_usage: { total_tokens: 2500 } },
                },
                timestamp: "2026-06-14T11:00:00Z",
            },
        ]);
        const file2 = make_jsonl([
            {
                type: "turn_context",
                payload: { model: "gpt-5" },
                timestamp: "2026-06-14T12:00:00Z",
            },
            {
                type: "response.completed",
                payload: {
                    type: "token_count",
                    info: { total_token_usage: { total_tokens: 500 } },
                },
                timestamp: "2026-06-14T12:10:00Z",
            },
        ]);

        const result = await run_connector(
            manifest,
            script,
            create_ctx({
                "~/.codex/sessions/rollout-1.jsonl": file1,
                "~/.codex/sessions/rollout-2.jsonl": file2,
            }),
        );

        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(1);
        const obs = result.observations[0];
        expect(obs).toEqual(
            expect.objectContaining({
                provider: "codex",
                account_id: "codex",
                metric_id: "codex:gpt-5",
                raw_label: "gpt-5",
                normalized_label: "gpt-5",
                window: "day",
                used: 3000,
                limit: null,
                display_style: "ratio",
                status: "normal",
                source: "local",
            }),
        );
    });

    it("returns empty when sessions directory is empty", async () => {
        const script = await readFile(join("connectors", "codex", "connector.ts"), "utf8");
        const result = await run_connector(manifest, script, create_ctx({}));

        expect(result.error).toBeNull();
        expect(result.observations).toEqual([]);
    });

    it("skips malformed JSON lines and continues", async () => {
        const script = await readFile(join("connectors", "codex", "connector.ts"), "utf8");
        const content =
            JSON.stringify({
                type: "turn_context",
                payload: { model: "gpt-5" },
                timestamp: "2026-06-14T10:00:00Z",
            }) +
            "\n{bad json\n" +
            JSON.stringify({
                type: "response.completed",
                payload: {
                    type: "token_count",
                    info: { total_token_usage: { total_tokens: 300 } },
                },
                timestamp: "2026-06-14T10:05:00Z",
            }) +
            "\n";

        const result = await run_connector(
            manifest,
            script,
            create_ctx({ "~/.codex/sessions/rollout-x.jsonl": content }),
        );

        expect(result.error).toBeNull();
        expect(result.observations[0]?.used).toBe(300);
    });
});
