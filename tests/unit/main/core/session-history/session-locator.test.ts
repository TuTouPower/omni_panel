import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import {
    clear_resolution_cache,
    locator_source_path,
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
            host: "linux",
            homedir: tmp_root,
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

            const result = resolve_session_file("claude_code", "linux", "sess_abc", paths);
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

            const result = resolve_session_file("claude_code", "linux", "uuid_xyz", paths);
            expect(result).not.toBeNull();
            expect(result?.file_path).toBe(file);
        });

        it("未找到返回 null", () => {
            const proj_dir = join(tmp_root, ".claude", "projects", "empty");
            mkdirSync(proj_dir, { recursive: true });
            const result = resolve_session_file("claude_code", "linux", "missing", paths);
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

            const result = resolve_session_file("kimi_code", "linux", "session_k1", paths);
            expect(result).not.toBeNull();
            expect(result?.extractor_kind).toBe("kimi");
            expect(result?.file_path).toBe(file);
        });

        it("未找到返回 null", () => {
            const result = resolve_session_file("kimi_code", "linux", "no_such", paths);
            expect(result).toBeNull();
        });
    });

    describe("grok (WSL only)", () => {
        it("wsl_user 未配置时返回 null（不抛错）", () => {
            // grok 路径固定走 wsl_home；测试环境无法创建 UNC 路径，
            // 只验证 wsl_user 缺失时优雅返回 null。
            const result = resolve_session_file("grok", "wsl", "grok_sid", {
                host: "windows",
                homedir: tmp_root,
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

            const result = resolve_session_file("opencode", "linux", "any_sid", paths);
            expect(result).not.toBeNull();
            expect(result?.extractor_kind).toBe("opencode");
            expect(result?.file_path).toBe(db);
        });

        it("db 不存在返回 null", () => {
            const result = resolve_session_file("opencode", "linux", "any_sid", paths);
            expect(result).toBeNull();
        });

        it("wsl_user 显式配置时 WSL 路径探测失败优雅返回 null（不抛）", () => {
            // wsl_user 非空会拼 UNC 路径；测试环境无法创建 UNC，statSync 失败应优雅返回 null。
            const result = resolve_session_file("opencode", "wsl", "any_sid", {
                host: "windows",
                homedir: tmp_root,
                win_home: tmp_root,
                wsl_distro: "Ubuntu-22.04",
                wsl_user: "testuser",
            });
            expect(result).toBeNull();
        });
    });

    it("重复 resolve 命中缓存；源文件删除后缓存失效并返回 null", () => {
        const proj_dir = join(tmp_root, ".claude", "projects", "cache_proj");
        mkdirSync(proj_dir, { recursive: true });
        const file = join(proj_dir, "cache_sess.jsonl");
        writeFileSync(file, JSON.stringify({ type: "user" }) + "\n");

        const first = resolve_session_file("claude_code", "linux", "cache_sess", paths);
        expect(first?.file_path).toBe(file);

        const second = resolve_session_file("claude_code", "linux", "cache_sess", paths);
        expect(second?.file_path).toBe(file);

        rmSync(file);
        const third = resolve_session_file("claude_code", "linux", "cache_sess", paths);
        expect(third).toBeNull();
    });
});

describe("t310 平台感知路径层复用（AC-001/002/003）", () => {
    let tmp_root: string;

    beforeEach(() => {
        clear_resolution_cache();
        tmp_root = mkdtempSync(join(tmpdir(), "t310-loc-"));
    });

    afterEach(() => {
        rmSync(tmp_root, { recursive: true, force: true });
        clear_resolution_cache();
    });

    describe("AC-001：非 Windows 宿主 linux/mac 源返回 POSIX 路径、wsl 源不可用", () => {
        it("linux host：claude/kimi/opencode/grok linux 源按 homedir 解析，不构造 UNC", () => {
            const linux_paths: LocatorPaths = {
                host: "linux",
                homedir: tmp_root,
                // win_home 指向不存在目录：若实现误用 win_home 作 linux 根会定位失败。
                win_home: join(tmp_root, "win-home-unused"),
                wsl_distro: "Ubuntu-22.04",
                wsl_user: "",
            };
            const proj = join(tmp_root, ".claude", "projects", "proj");
            mkdirSync(proj, { recursive: true });
            const cc_file = join(proj, "sess_l.jsonl");
            writeFileSync(cc_file, JSON.stringify({ sessionId: "sess_l" }) + "\n");

            const kimi_dir = join(
                tmp_root,
                ".kimi-code",
                "sessions",
                "wd",
                "sess_k",
                "agents",
                "main",
            );
            mkdirSync(kimi_dir, { recursive: true });
            const kimi_file = join(kimi_dir, "wire.jsonl");
            writeFileSync(kimi_file, "{}\n");

            const oc_dir = join(tmp_root, ".local", "share", "opencode");
            mkdirSync(oc_dir, { recursive: true });
            const oc_file = join(oc_dir, "opencode.db");
            writeFileSync(oc_file, "SQLite format 3");

            const grok_dir = join(tmp_root, ".grok", "sessions", "proj", "sess_g");
            mkdirSync(grok_dir, { recursive: true });
            const grok_file = join(grok_dir, "chat_history.jsonl");
            writeFileSync(grok_file, "{}\n");

            const cc = resolve_session_file("claude_code", "linux", "sess_l", linux_paths);
            expect(cc).not.toBeNull();
            expect(cc?.file_path).toBe(cc_file);
            expect(cc?.file_path).not.toContain("\\\\wsl.localhost");

            const kimi = resolve_session_file("kimi_code", "linux", "sess_k", linux_paths);
            expect(kimi).not.toBeNull();
            expect(kimi?.file_path).toBe(kimi_file);
            expect(kimi?.file_path).not.toContain("\\\\wsl.localhost");

            const oc = resolve_session_file("opencode", "linux", "any", linux_paths);
            expect(oc).not.toBeNull();
            expect(oc?.file_path).toBe(oc_file);
            expect(oc?.file_path).not.toContain("\\\\wsl.localhost");

            const grok = resolve_session_file("grok", "linux", "sess_g", linux_paths);
            expect(grok).not.toBeNull();
            expect(grok?.file_path).toBe(grok_file);
            expect(grok?.file_path).not.toContain("\\\\wsl.localhost");
        });

        it("macos host：mac 源同样按 homedir 解析（POSIX）", () => {
            const macos_paths: LocatorPaths = {
                host: "macos",
                homedir: tmp_root,
                win_home: join(tmp_root, "win-home-unused"),
                wsl_distro: "Ubuntu-22.04",
                wsl_user: "",
            };
            const proj = join(tmp_root, ".claude", "projects", "proj");
            mkdirSync(proj, { recursive: true });
            const file = join(proj, "sess_m.jsonl");
            writeFileSync(file, JSON.stringify({ sessionId: "sess_m" }) + "\n");

            const result = resolve_session_file("claude_code", "mac", "sess_m", macos_paths);
            expect(result).not.toBeNull();
            expect(result?.file_path).toBe(file);
            expect(result?.file_path).not.toContain("\\\\wsl.localhost");
        });

        it("非 Windows 宿主 wsl 源返回 null（不构造 UNC、不抛错）", () => {
            for (const host of ["linux", "macos"] as const) {
                const p: LocatorPaths = {
                    host,
                    homedir: tmp_root,
                    win_home: tmp_root,
                    wsl_distro: "Ubuntu-22.04",
                    wsl_user: "karon",
                };
                expect(resolve_session_file("claude_code", "wsl", "any", p)).toBeNull();
                expect(resolve_session_file("kimi_code", "wsl", "any", p)).toBeNull();
                expect(resolve_session_file("opencode", "wsl", "any", p)).toBeNull();
                expect(resolve_session_file("grok", "wsl", "any", p)).toBeNull();
            }
        });
    });

    describe("AC-002：Windows 宿主 win 源基于 win_home、wsl 源基于 UNC（纯映射）", () => {
        const win_paths: LocatorPaths = {
            host: "windows",
            homedir: "/unused-homedir",
            win_home: "C:\\Users\\Test",
            wsl_distro: "Ubuntu-22.04",
            wsl_user: "karon",
        };

        it("win 源基于 win_home + win32 拼接", () => {
            expect(locator_source_path("claude_code", "win", win_paths)).toBe(
                "C:\\Users\\Test\\.claude\\projects",
            );
            expect(locator_source_path("opencode", "win", win_paths)).toBe(
                "C:\\Users\\Test\\.local\\share\\opencode\\opencode.db",
            );
            expect(locator_source_path("kimi_code", "win", win_paths)).toBe(
                "C:\\Users\\Test\\.kimi-code\\sessions",
            );
            expect(locator_source_path("grok", "win", win_paths)).toBe(
                "C:\\Users\\Test\\.grok\\sessions",
            );
        });

        it("wsl 源基于 UNC 拼接", () => {
            expect(locator_source_path("claude_code", "wsl", win_paths)).toBe(
                "\\\\wsl.localhost\\Ubuntu-22.04\\home\\karon\\.claude\\projects",
            );
            expect(locator_source_path("opencode", "wsl", win_paths)).toBe(
                "\\\\wsl.localhost\\Ubuntu-22.04\\home\\karon\\.local\\share\\opencode\\opencode.db",
            );
            expect(locator_source_path("kimi_code", "wsl", win_paths)).toBe(
                "\\\\wsl.localhost\\Ubuntu-22.04\\home\\karon\\.kimi-code\\sessions",
            );
            expect(locator_source_path("grok", "wsl", win_paths)).toBe(
                "\\\\wsl.localhost\\Ubuntu-22.04\\home\\karon\\.grok\\sessions",
            );
        });
    });

    describe("AC-003：wsl_user 探测失败（空串）时 wsl 源不可用", () => {
        it("不生成缺用户名 UNC，wsl 源返回 null；win 源不受影响", () => {
            const no_user_paths: LocatorPaths = {
                host: "windows",
                homedir: "/unused-homedir",
                win_home: "C:\\Users\\Test",
                // 不存在的 distro：home 目录探测必然失败 → 有效 wsl_user 为空串。
                wsl_distro: "NoSuchDistro-AC003",
                wsl_user: "",
            };
            expect(locator_source_path("claude_code", "wsl", no_user_paths)).toBeNull();
            expect(locator_source_path("opencode", "wsl", no_user_paths)).toBeNull();
            expect(locator_source_path("kimi_code", "wsl", no_user_paths)).toBeNull();
            expect(locator_source_path("grok", "wsl", no_user_paths)).toBeNull();
            expect(locator_source_path("claude_code", "win", no_user_paths)).toBe(
                "C:\\Users\\Test\\.claude\\projects",
            );
        });
    });

    it("session-history 源码无 env local 残留（t437 守卫，替代 t310 的 win 守卫）", async () => {
        const path = await import("node:path");
        const fs = await import("node:fs");
        const files = [
            "src/main/core/session-history/session-locator.ts",
            "src/main/core/session-history/subscription-service.ts",
            "src/main/core/session-history/session-path-index.ts",
            "src/main/ipc/session-history-ipc.ts",
        ];
        const root = path.resolve(import.meta.dirname, "../../../../../");
        // 覆盖 env: "local" / env = "local" / env === "local" / env !== "local" 等写法。
        const literal = /env\s*(?::|={1,3}|!==|!=)\s*["']local["']/;
        for (const f of files) {
            const content = fs.readFileSync(path.join(root, f), "utf8");
            expect(content, `${f} contains env local literal`).not.toMatch(literal);
        }
    });
});
