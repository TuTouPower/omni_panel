/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync, existsSync } from "node:fs";
import { read_opencode_sessions } from "../../../../../src/main/core/token-stats/opencode-reader";

function create_test_db(db_path: string): InstanceType<typeof Database> {
    const db = new Database(db_path);
    db.exec(`
        CREATE TABLE IF NOT EXISTS session (
            id TEXT PRIMARY KEY,
            model TEXT,
            tokens_input INTEGER,
            tokens_output INTEGER,
            tokens_reasoning INTEGER,
            tokens_cache_read INTEGER,
            tokens_cache_write INTEGER,
            title TEXT,
            directory TEXT,
            time_created INTEGER,
            time_updated INTEGER
        );
        CREATE TABLE IF NOT EXISTS message (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            time_created INTEGER,
            time_updated INTEGER,
            data TEXT
        );
    `);
    return db;
}

function insert_message(
    db: InstanceType<typeof Database>,
    id: string,
    session_id: string,
    role: string,
    data_extras: Record<string, unknown> = {},
) {
    db.prepare(
        `INSERT INTO message (id, session_id, time_created, time_updated, data)
         VALUES (?, ?, 0, 0, ?)`,
    ).run(id, session_id, JSON.stringify({ role, ...data_extras }));
}

function insert_session(
    db: InstanceType<typeof Database>,
    overrides: Partial<{
        id: string;
        model: string;
        tokens_input: number;
        tokens_output: number;
        tokens_reasoning: number;
        tokens_cache_read: number;
        tokens_cache_write: number;
        title: string;
        directory: string;
        time_created: number;
        time_updated: number;
    }> = {},
) {
    const defaults = {
        id: "sess-001",
        model: JSON.stringify({ id: "claude-sonnet-4-20250514" }),
        tokens_input: 1000,
        tokens_output: 500,
        tokens_reasoning: 0,
        tokens_cache_read: 100,
        tokens_cache_write: 50,
        title: "Fix auth bug",
        directory: "/home/user/project",
        time_created: 1752758400000,
        time_updated: 1752762000000,
    };
    const v = { ...defaults, ...overrides };
    db.prepare(
        `INSERT INTO session (id, model, tokens_input, tokens_output, tokens_reasoning,
         tokens_cache_read, tokens_cache_write, title, directory, time_created, time_updated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
        v.id,
        v.model,
        v.tokens_input,
        v.tokens_output,
        v.tokens_reasoning,
        v.tokens_cache_read,
        v.tokens_cache_write,
        v.title,
        v.directory,
        v.time_created,
        v.time_updated,
    );
}

describe("read_opencode_sessions", () => {
    let db_path: string;

    beforeEach(() => {
        db_path = join(tmpdir(), `opencode-test-${String(Date.now())}-${String(Math.random())}.db`);
    });

    afterEach(() => {
        if (existsSync(db_path)) unlinkSync(db_path);
    });

    it("reads sessions with valid tokens", () => {
        const db = create_test_db(db_path);
        insert_session(db);
        insert_message(db, "m1", "sess-001", "assistant");
        insert_message(db, "m2", "sess-001", "assistant");
        insert_message(db, "m3", "sess-001", "user");
        insert_session(db, {
            id: "sess-002",
            tokens_input: 2000,
            tokens_output: 800,
            time_updated: 1752763000000,
        });
        db.close();

        const { sessions } = read_opencode_sessions(db_path, "win", 0);
        expect(sessions).toHaveLength(2);
        expect(sessions[0]!.id).toBe("sess-001");
        expect(sessions[0]!.source).toBe("opencode");
        expect(sessions[0]!.env).toBe("win");
        expect(sessions[0]!.model).toBe("claude-sonnet-4-20250514");
        expect(sessions[0]!.input_tokens).toBe(1000);
        expect(sessions[0]!.output_tokens).toBe(500);
        expect(sessions[0]!.cache_read_tokens).toBe(100);
        expect(sessions[0]!.cache_write_tokens).toBe(50);
        expect(sessions[0]!.calls).toBe(2); // assistant messages only
        expect(sessions[1]!.calls).toBe(0);
        expect(sessions[0]!.title).toBe("Fix auth bug");
        expect(sessions[0]!.directory).toBe("/home/user/project");
        expect(sessions[0]!.started_at).toBe(1752758400000);
        expect(sessions[0]!.ended_at).toBe(1752762000000);
    });

    it("derives daily usage rows from assistant message tokens", () => {
        const db = create_test_db(db_path);
        insert_session(db);
        insert_message(db, "m1", "sess-001", "assistant", {
            tokens: { input: 100, output: 10, cache: { read: 5, write: 2 } },
            time: { created: 1752758400000 }, // 2025-07-17T16:00:00Z
            modelID: "claude-sonnet-4-20250514",
        });
        insert_message(db, "m2", "sess-001", "assistant", {
            tokens: { input: 200, output: 20, cache: { read: 0, write: 0 } },
            time: { created: 1752758400000 + 3600000 },
            modelID: "claude-sonnet-4-20250514",
        });
        // user message with tokens must not contribute
        insert_message(db, "m3", "sess-001", "user", {
            tokens: { input: 999, output: 999 },
            time: { created: 1752758400000 },
            modelID: "claude-sonnet-4-20250514",
        });
        db.close();

        const { sessions, daily, records } = read_opencode_sessions(db_path, "win", 0);
        expect(sessions[0]!.calls).toBe(2);
        expect(daily).toHaveLength(1);
        expect(daily[0]).toMatchObject({
            id: "sess-001",
            source: "opencode",
            env: "win",
            model: "claude-sonnet-4-20250514",
            input_tokens: 300,
            output_tokens: 30,
            cache_read_tokens: 5,
            cache_write_tokens: 2,
            calls: 2,
        });

        expect(records).toHaveLength(2);
        const r0 = records[0]!;
        expect(r0.agent).toBe("opencode");
        expect(r0.session_id).toBe("sess-001");
        expect(r0.message_id).toBe("m1");
        expect(r0.model).toBe("claude-sonnet-4-20250514");
        expect(r0.timestamp).toBe(1752758400000);
        expect(r0.input_tokens).toBe(100);
        expect(r0.cache_read_tokens).toBe(5);
        expect(r0.cache_write_tokens).toBe(2);
    });

    it("skips assistant messages without token fields for daily but keeps calls", () => {
        const db = create_test_db(db_path);
        insert_session(db);
        db.prepare(
            `INSERT INTO message (id, session_id, time_created, time_updated, data)
             VALUES ('m1', 'sess-001', 0, 0, '{"role":"assistant"}')`,
        ).run();
        db.close();

        const { sessions, daily } = read_opencode_sessions(db_path, "win", 0);
        expect(sessions[0]!.calls).toBe(1);
        expect(daily).toHaveLength(0);
    });

    it("calls is null when the message table is missing", () => {
        const db = new Database(db_path);
        db.exec(`
            CREATE TABLE session (
                id TEXT PRIMARY KEY,
                model TEXT,
                tokens_input INTEGER,
                tokens_output INTEGER,
                tokens_reasoning INTEGER,
                tokens_cache_read INTEGER,
                tokens_cache_write INTEGER,
                title TEXT,
                directory TEXT,
                time_created INTEGER,
                time_updated INTEGER
            )
        `);
        db.prepare(
            `INSERT INTO session VALUES ('s1', '{"id":"m"}', 100, 50, 0, 0, 0, 't', 'd', 1, 2)`,
        ).run();
        db.close();

        const { sessions } = read_opencode_sessions(db_path, "win", 0);
        expect(sessions).toHaveLength(1);
        expect(sessions[0]!.calls).toBeNull();
    });

    it("filters by max_updated (incremental)", () => {
        const db = create_test_db(db_path);
        insert_session(db, { id: "old", time_updated: 1000 });
        insert_session(db, { id: "new", time_updated: 5000 });
        db.close();

        const { sessions } = read_opencode_sessions(db_path, "win", 3000);
        expect(sessions).toHaveLength(1);
        expect(sessions[0]!.id).toBe("new");
    });

    it("skips sessions with tokens_input = 0", () => {
        const db = create_test_db(db_path);
        insert_session(db, { id: "valid", tokens_input: 100 });
        insert_session(db, { id: "zero", tokens_input: 0 });
        db.close();

        const { sessions } = read_opencode_sessions(db_path, "wsl", 0);
        expect(sessions).toHaveLength(1);
        expect(sessions[0]!.id).toBe("valid");
    });

    it("extracts model from JSON field", () => {
        const db = create_test_db(db_path);
        insert_session(db, {
            id: "sonnet",
            model: JSON.stringify({ id: "claude-sonnet-4-20250514" }),
        });
        insert_session(db, {
            id: "opus",
            model: JSON.stringify({ id: "claude-opus-4-20250901" }),
        });
        db.close();

        const { sessions } = read_opencode_sessions(db_path, "win", 0);
        expect(sessions).toHaveLength(2);
        const by_id = Object.fromEntries(sessions.map((s) => [s.id, s.model]));
        expect(by_id["sonnet"]).toBe("claude-sonnet-4-20250514");
        expect(by_id["opus"]).toBe("claude-opus-4-20250901");
    });

    it("handles missing model JSON gracefully", () => {
        const db = create_test_db(db_path);
        // null model
        insert_session(db, { id: "null-model", model: null as unknown as string });
        // empty model JSON (no id field)
        insert_session(db, { id: "empty-model", model: "{}" });
        // malformed JSON
        insert_session(db, { id: "bad-json", model: "not-json{" });
        // valid session to ensure it still works
        insert_session(db, {
            id: "valid",
            model: JSON.stringify({ id: "claude-sonnet-4-20250514" }),
        });
        db.close();

        const { sessions } = read_opencode_sessions(db_path, "win", 0);
        // only the valid one should pass; null-model/empty/bad-json are filtered
        expect(sessions).toHaveLength(1);
        expect(sessions[0]!.id).toBe("valid");
    });

    it("returns empty array for missing database", () => {
        const { sessions } = read_opencode_sessions("/nonexistent/path/db.sqlite", "win", 0);
        expect(sessions).toEqual([]);
    });

    it("defaults cache tokens to 0 when null", () => {
        const db = create_test_db(db_path);
        insert_session(db, {
            id: "no-cache",
            tokens_cache_read: null as unknown as number,
            tokens_cache_write: null as unknown as number,
        });
        db.close();

        const { sessions } = read_opencode_sessions(db_path, "win", 0);
        expect(sessions).toHaveLength(1);
        expect(sessions[0]!.cache_read_tokens).toBe(0);
        expect(sessions[0]!.cache_write_tokens).toBe(0);
    });
});
