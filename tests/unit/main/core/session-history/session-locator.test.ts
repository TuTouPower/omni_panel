import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import {
    resolve_session_file,
    type LocatorPaths,
} from "../../../../../src/main/core/session-history/session-locator";

/**
 * session-locator 单测：临时目录建假结构，验证 (source, env, session_id) 命中/未命中。
 * 全程只读扫描；不解析正文，只靠文件名/目录名/首行 sessionId 匹配。
 */

describe("session-locator (t210)", () => {
    let tmp_root: string;
    let paths: LocatorPaths;

    beforeEach(() => {
        tmp_root = mkdtempSync(join(tmpdir(), "t210-loc-"));
        paths = {
            win_home: tmp_root,
            wsl_distro: "Ubuntu-22.04",
            wsl_user: "testuser",
        };
    });

    afterEach(() => {
        rmSync(tmp_root, { recursive: true, force: true });
    });

    describe("claude_code", () => {
        it("按文件名命中主 transcript", () => {
            const proj_dir = join(tmp_root, ".claude", "projects", "proj_a");
            mkdirSync(proj_dir, { recursive: true });
            const file = join(proj_dir, "sess_abc.jsonl");
            writeFileSync(
                file,
                JSON.stringify({ type: "user", message: { content: "hi" } }) + "\n",
            );

            const result = resolve_session_file("claude_code", "win", "sess_abc", paths);
            expect(result).not.toBeNull();
            expect(result?.extractor_kind).toBe("claude_code");
            expect(result?.file_path).toBe(file);
        });

        it("按首行 sessionId 字段命中（文件名不含 session_id）", () => {
            const proj_dir = join(tmp_root, ".claude", "projects", "proj_b");
            mkdirSync(proj_dir, { recursive: true });
            const file = join(proj_dir, "other_name.jsonl");
            writeFileSync(
                file,
                JSON.stringify({
                    type: "user",
                    sessionId: "uuid_xyz",
                    message: { content: "hi" },
                }) + "\n",
            );

            const result = resolve_session_file("claude_code", "win", "uuid_xyz", paths);
            expect(result).not.toBeNull();
            expect(result?.file_path).toBe(file);
        });

        it("未找到返回 null", () => {
            const proj_dir = join(tmp_root, ".claude", "projects", "empty");
            mkdirSync(proj_dir, { recursive: true });
            const result = resolve_session_file("claude_code", "win", "missing", paths);
            expect(result).toBeNull();
        });
    });

    describe("kimi_code", () => {
        it("按目录名命中 wire.jsonl", () => {
            const sess_dir = join(
                tmp_root,
                ".kimi-code",
                "sessions",
                "wd1",
                "session_k1",
                "agents",
                "main",
            );
            mkdirSync(sess_dir, { recursive: true });
            const file = join(sess_dir, "wire.jsonl");
            writeFileSync(file, "{}\n");

            const result = resolve_session_file("kimi_code", "win", "session_k1", paths);
            expect(result).not.toBeNull();
            expect(result?.extractor_kind).toBe("kimi");
            expect(result?.file_path).toBe(file);
        });

        it("未找到返回 null", () => {
            const result = resolve_session_file("kimi_code", "win", "no_such", paths);
            expect(result).toBeNull();
        });
    });

    describe("grok (WSL only)", () => {
        it("wsl_user 未配置时返回 null（不抛错）", () => {
            // grok 路径固定走 wsl_home；测试环境无法创建 UNC 路径，
            // 只验证 wsl_user 缺失时优雅返回 null。
            const result = resolve_session_file("grok", "wsl", "grok_sid", {
                win_home: tmp_root,
                wsl_distro: "Ubuntu-22.04",
                wsl_user: "",
            });
            expect(result).toBeNull();
        });
    });

    describe("opencode", () => {
        it("db 存在时返回固定路径", () => {
            const db_dir = join(tmp_root, ".local", "share", "opencode");
            mkdirSync(db_dir, { recursive: true });
            const db = join(db_dir, "opencode.db");
            writeFileSync(db, "SQLite format 3");

            const result = resolve_session_file("opencode", "win", "any_sid", paths);
            expect(result).not.toBeNull();
            expect(result?.extractor_kind).toBe("opencode");
            expect(result?.file_path).toBe(db);
        });

        it("db 不存在返回 null", () => {
            const result = resolve_session_file("opencode", "win", "any_sid", paths);
            expect(result).toBeNull();
        });

        it("wsl_user 显式配置时 WSL 路径探测失败优雅返回 null（不抛）", () => {
            // wsl_user 非空会拼 UNC 路径；测试环境无法创建 UNC，statSync 失败应优雅返回 null。
            const result = resolve_session_file("opencode", "wsl", "any_sid", {
                win_home: tmp_root,
                wsl_distro: "Ubuntu-22.04",
                wsl_user: "testuser",
            });
            expect(result).toBeNull();
        });
    });
});
