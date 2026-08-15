import { readFile } from "node:fs/promises";
import { ctx_status } from "./_ctx_status";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import type { Manifest } from "../../../src/shared/schemas/manifest";

// t377 AC-001: manifest 从磁盘读真实定义，不手工复制（防与 connectors/ 漂移）。
const manifest = JSON.parse(
    await readFile(join("connectors", "codex", "manifest.json"), "utf8"),
) as Manifest;

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
        status: ctx_status,
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
                status: "unknown",
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

    it("skips oversized session files (t364 AC-001)", async () => {
        const script = await readFile(join("connectors", "codex", "connector.ts"), "utf8");
        const valid_session = make_jsonl([
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
        const oversized = "x".repeat(5 * 1024 * 1024 + 1); // > MAX_FILE_CHARS
        const result = await run_connector(
            manifest,
            script,
            create_ctx({
                "~/.codex/sessions/huge.jsonl": `${oversized}\n${valid_session}`,
                "~/.codex/sessions/normal.jsonl": valid_session,
            }),
        );

        expect(result.error).toBeNull();
        // 超大文件跳过解析：观测 used 精确来自 normal.jsonl（500），若 huge.jsonl
        // 未被过滤则两文件并入 500+500=1000，此断言失败（t364 AC-001 真验证跳过）。
        expect(result.observations[0]?.used).toBe(500);
    });

    it("skips non-jsonl files in session dirs (t364 AC-002)", async () => {
        const script = await readFile(join("connectors", "codex", "connector.ts"), "utf8");
        const txt_session = make_jsonl([
            {
                type: "turn_context",
                payload: { model: "txt-model" },
                timestamp: "2026-06-14T12:00:00Z",
            },
            {
                type: "response.completed",
                payload: {
                    type: "token_count",
                    info: { total_token_usage: { total_tokens: 900 } },
                },
                timestamp: "2026-06-14T12:10:00Z",
            },
        ]);
        const valid_session = make_jsonl([
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
                "~/.codex/sessions/notes.txt": txt_session,
                "~/.codex/sessions/rollout.jsonl": valid_session,
            }),
        );

        expect(result.error).toBeNull();
        // 非 .jsonl 文件不被读取：txt-model 观测不存在，仅 gpt-5 产出（t364 AC-002）。
        expect(result.observations.some((o) => o.raw_label === "txt-model")).toBe(false);
        expect(result.observations.some((o) => o.raw_label === "gpt-5")).toBe(true);
    });

    it("buckets same model by day across year boundary (t377 AC-001)", async () => {
        const script = await readFile(join("connectors", "codex", "connector.ts"), "utf8");
        const dec31 = make_jsonl([
            {
                type: "turn_context",
                payload: { model: "gpt-5" },
                timestamp: "2026-12-31T23:00:00Z",
            },
            {
                type: "response.completed",
                payload: {
                    type: "token_count",
                    info: { total_token_usage: { total_tokens: 1000 } },
                },
                timestamp: "2026-12-31T23:10:00Z",
            },
        ]);
        const jan1 = make_jsonl([
            {
                type: "turn_context",
                payload: { model: "gpt-5" },
                timestamp: "2027-01-01T00:00:00Z",
            },
            {
                type: "response.completed",
                payload: {
                    type: "token_count",
                    info: { total_token_usage: { total_tokens: 2000 } },
                },
                timestamp: "2027-01-01T00:10:00Z",
            },
        ]);

        const result = await run_connector(
            manifest,
            script,
            create_ctx({
                "~/.codex/sessions/year-1.jsonl": dec31,
                "~/.codex/sessions/year-2.jsonl": jan1,
            }),
        );

        expect(result.error).toBeNull();
        // day_key 跨年正确 → 12-31 与 01-01 分不同桶，各一个 gpt-5 观测；
        // 若 day_key 月/年算错合并为同日，只剩 1 个（used 相加），此断言必挂。
        const gpt5 = result.observations.filter((o) => o.raw_label === "gpt-5");
        expect(gpt5).toHaveLength(2);
        expect(gpt5.map((o) => o.used).sort()).toEqual([1000, 2000]);

        // t393 AC-004: obs 的 day 派生字段精确断言（不复制实现）——捕月偏位与
        // 缺零填充回归：仅桶数量断言对「12-31/01-01 用错月份」与「01-01 未补零
        // （会成 2027-1-1）」不敏感，此处直接锁 day 派生输出。
        expect(gpt5.map((o) => o.day).sort()).toEqual(["2026-12-31", "2027-01-01"]);
    });
});
