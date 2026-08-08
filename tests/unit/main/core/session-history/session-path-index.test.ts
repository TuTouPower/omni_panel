import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type * as NodeFs from "node:fs";
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    renameSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
    clear_resolution_cache,
    flush_session_index,
    resolve_session_file,
    type LocatorPaths,
} from "../../../../../src/main/core/session-history/session-locator";
import {
    SESSION_INDEX_FILE,
    type SessionIndexFile,
} from "../../../../../src/main/core/session-history/session-path-index";

/**
 * t254 持久索引：跨重启命中免整目录扫描；失效回退扫描并修正索引；
 * WSL 用户名探测缓存。
 * readdirSync 计数断言「不发生目录树遍历」。
 */

const fs_counter = vi.hoisted(() => ({ readdir_dirs: [] as string[] }));

vi.mock("node:fs", async (import_original) => {
    const actual = await import_original<typeof NodeFs>();
    return {
        ...actual,
        readdirSync: ((...args: Parameters<typeof actual.readdirSync>) => {
            const dir = typeof args[0] === "string" ? args[0] : String(args[0]);
            fs_counter.readdir_dirs.push(dir);
            return actual.readdirSync(...args);
        }) as typeof actual.readdirSync,
    };
});

function readdir_count(): number {
    return fs_counter.readdir_dirs.length;
}

function readdir_dirs(): string[] {
    return [...fs_counter.readdir_dirs];
}

function read_index(index_dir: string): SessionIndexFile {
    return JSON.parse(
        readFileSync(join(index_dir, SESSION_INDEX_FILE), "utf8"),
    ) as SessionIndexFile;
}

describe("session-locator 持久索引 (t254)", () => {
    let tmp_root: string;
    let index_dir: string;
    let paths: LocatorPaths;

    beforeEach(() => {
        tmp_root = mkdtempSync(join(tmpdir(), "t254-loc-"));
        index_dir = join(tmp_root, "index");
        paths = { win_home: tmp_root, wsl_distro: "Ubuntu-22.04", wsl_user: "testuser", index_dir };
        clear_resolution_cache();
        fs_counter.readdir_dirs = [];
    });

    afterEach(() => {
        rmSync(tmp_root, { recursive: true, force: true });
        clear_resolution_cache();
    });

    function make_claude_session(session_id: string, file_name?: string): string {
        const proj_dir = join(tmp_root, ".claude", "projects", "proj");
        mkdirSync(proj_dir, { recursive: true });
        const file = join(proj_dir, file_name ?? `${session_id}.jsonl`);
        writeFileSync(
            file,
            JSON.stringify({ type: "user", sessionId: session_id, message: { content: "hi" } }) +
                "\n",
        );
        return file;
    }

    it("AC1：跨重启（清缓存）命中持久索引，定位不执行目录树遍历", () => {
        const file = make_claude_session("sess_persist");
        expect(resolve_session_file("claude_code", "win", "sess_persist", paths)?.file_path).toBe(
            file,
        );
        flush_session_index();
        expect(existsSync(join(index_dir, SESSION_INDEX_FILE))).toBe(true);

        // 模拟重启：清内存缓存；磁盘索引仍在。
        clear_resolution_cache();
        fs_counter.readdir_dirs = [];

        const result = resolve_session_file("claude_code", "win", "sess_persist", paths);
        expect(result?.file_path).toBe(file);
        expect(readdir_count()).toBe(0);
    });

    it("AC2：索引中的文件被删除后回退扫描并修正索引（后续不再命中失效条目）", () => {
        make_claude_session("sess_gone");
        expect(resolve_session_file("claude_code", "win", "sess_gone", paths)).not.toBeNull();
        flush_session_index(); // t264: 落盘合并，clear 前显式 flush。
        clear_resolution_cache();

        const file = join(tmp_root, ".claude", "projects", "proj", "sess_gone.jsonl");
        rmSync(file);

        // 回退扫描后应返回 null（找不到）。
        expect(resolve_session_file("claude_code", "win", "sess_gone", paths)).toBeNull();
        // 索引已修正：文件中不再有该 key。
        flush_session_index();
        expect(read_index(index_dir).entries?.["claude_code|win|sess_gone"]).toBeUndefined();
    });

    it("AC2：索引中的文件被移动（改名）后回退扫描并按现状更新索引", () => {
        const file = make_claude_session("sess_moved", "sess_moved.jsonl");
        expect(resolve_session_file("claude_code", "win", "sess_moved", paths)?.file_path).toBe(
            file,
        );
        flush_session_index(); // t264: 落盘合并，clear 前显式 flush。
        clear_resolution_cache();

        // 改名后文件名不再是 session_id，但首行 sessionId 字段可匹配。
        const moved = join(tmp_root, ".claude", "projects", "proj", "renamed.jsonl");
        renameSync(file, moved);

        const result = resolve_session_file("claude_code", "win", "sess_moved", paths);
        expect(result?.file_path).toBe(moved);
        flush_session_index();
        expect(read_index(index_dir).entries?.["claude_code|win|sess_moved"]?.file_path).toBe(
            moved,
        );
    });

    it("AC3：新会话文件出现后可定位并回填索引", () => {
        // 先 resolve 一个存在的会话触发索引文件创建（未命中零写，不建文件）。
        const seed = make_claude_session("sess_seed");
        expect(resolve_session_file("claude_code", "win", "sess_seed", paths)?.file_path).toBe(
            seed,
        );
        flush_session_index();
        // 未命中会话不入索引。
        expect(resolve_session_file("claude_code", "win", "sess_new", paths)).toBeNull();
        flush_session_index();
        expect(read_index(index_dir).entries?.["claude_code|win|sess_new"]).toBeUndefined();

        const file = make_claude_session("sess_new");
        const result = resolve_session_file("claude_code", "win", "sess_new", paths);
        expect(result?.file_path).toBe(file);
        flush_session_index();
        expect(read_index(index_dir).entries?.["claude_code|win|sess_new"]?.file_path).toBe(file);
    });

    it("AC4：同一会话反复定位不产生重复目录扫描（进程内缓存命中）", () => {
        const file = make_claude_session("sess_repeat");
        expect(resolve_session_file("claude_code", "win", "sess_repeat", paths)?.file_path).toBe(
            file,
        );
        const scan_count = readdir_count();
        expect(scan_count).toBeGreaterThan(0);

        for (let i = 0; i < 3; i++) {
            expect(
                resolve_session_file("claude_code", "win", "sess_repeat", paths)?.file_path,
            ).toBe(file);
        }
        // 后续 resolve 全部命中内存缓存，不再扫描。
        expect(readdir_count()).toBe(scan_count);
    });

    it("AC4：WSL 用户名探测在进程内只执行一次（空串时）", () => {
        const no_index_paths: LocatorPaths = {
            win_home: tmp_root,
            wsl_distro: "Ubuntu-22.04",
            wsl_user: "",
            index_dir,
        };
        clear_resolution_cache();
        fs_counter.readdir_dirs = [];

        // 两次 grok resolve（wsl_user 空）：第一次探测 wsl home，第二次缓存命中。
        resolve_session_file("grok", "wsl", "s1", no_index_paths);
        resolve_session_file("grok", "wsl", "s2", no_index_paths);

        const wsl_home = "\\\\wsl.localhost\\Ubuntu-22.04\\home";
        // 探测只列 home 目录本身一次；grok 会话扫描扫的是其子目录，不计数。
        const wsl_home_scans = readdir_dirs().filter((d) => d === wsl_home).length;
        expect(wsl_home_scans).toBe(1);
    });

    it("索引损坏时整体丢弃重建，不抛错", () => {
        make_claude_session("sess_corrupt");
        resolve_session_file("claude_code", "win", "sess_corrupt", paths);
        flush_session_index(); // t264: 落盘合并，clear 前显式 flush。
        clear_resolution_cache();

        // 写坏索引文件。
        writeFileSync(join(index_dir, SESSION_INDEX_FILE), "{not valid json");

        // 不抛错，回退扫描仍能定位并重建索引。
        const result = resolve_session_file("claude_code", "win", "sess_corrupt", paths);
        expect(result?.file_path).toBe(
            join(tmp_root, ".claude", "projects", "proj", "sess_corrupt.jsonl"),
        );
        flush_session_index();
        expect(read_index(index_dir).entries?.["claude_code|win|sess_corrupt"]?.file_path).toBe(
            join(tmp_root, ".claude", "projects", "proj", "sess_corrupt.jsonl"),
        );
    });

    it("f001：WSL 探测失败（返回空）不写负缓存，下次可重探测自愈", () => {
        // 模拟 WSL 未挂载：用不存在的 distro，home 目录 readdir 失败返回空。
        const no_wsl_paths: LocatorPaths = {
            win_home: tmp_root,
            wsl_distro: "NoSuchDistro",
            wsl_user: "",
            index_dir,
        };
        clear_resolution_cache();
        fs_counter.readdir_dirs = [];

        // 第一次探测失败（WSL 未挂载）。
        const r1 = resolve_session_file("grok", "wsl", "s1", no_wsl_paths);
        expect(r1).toBeNull();
        const scans_after_first = readdir_dirs().filter((d) => d.includes("NoSuchDistro")).length;
        expect(scans_after_first).toBeGreaterThan(0);

        // 再次 resolve：空串未写缓存，应重新探测（额外 home 扫描发生）。
        resolve_session_file("grok", "wsl", "s2", no_wsl_paths);
        const scans_after_second = readdir_dirs().filter((d) => d.includes("NoSuchDistro")).length;
        expect(scans_after_second).toBeGreaterThan(scans_after_first);
    });

    it("f003：跨配置（paths_key 不同）不得命中旧条目，回退扫描更新", () => {
        const file = make_claude_session("sess_cfg");
        expect(resolve_session_file("claude_code", "win", "sess_cfg", paths)?.file_path).toBe(file);
        flush_session_index(); // t264: 落盘合并，clear 前显式 flush。
        clear_resolution_cache();

        // 换 win_home 配置（paths_key 变）。
        const other_home = join(tmp_root, "other-home");
        mkdirSync(join(other_home, ".claude", "projects", "proj"), { recursive: true });
        const other_file = join(other_home, ".claude", "projects", "proj", "sess_cfg.jsonl");
        writeFileSync(
            other_file,
            JSON.stringify({ type: "user", sessionId: "sess_cfg", message: { content: "hi" } }) +
                "\n",
        );
        const other_paths: LocatorPaths = {
            win_home: other_home,
            wsl_distro: "Ubuntu-22.04",
            wsl_user: "testuser",
            index_dir,
        };

        // 旧条目仍指向原 home 文件，但 paths_key 不匹配 → 不得直接命中旧路径，应回退扫描定位到新 home。
        const result = resolve_session_file("claude_code", "win", "sess_cfg", other_paths);
        expect(result?.file_path).toBe(other_file);
    });
});

describe("session-locator 落盘批间合并 (t264)", () => {
    let tmp_root: string;
    let index_dir: string;
    let paths: LocatorPaths;
    let save_spy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        tmp_root = mkdtempSync(join(tmpdir(), "t264-loc-"));
        index_dir = join(tmp_root, "index");
        paths = { win_home: tmp_root, wsl_distro: "Ubuntu-22.04", wsl_user: "testuser", index_dir };
        clear_resolution_cache();
        const index_module =
            await import("../../../../../src/main/core/session-history/session-path-index");
        save_spy = vi.spyOn(index_module, "save_session_index");
    });

    afterEach(() => {
        save_spy.mockRestore();
        flush_session_index();
        rmSync(tmp_root, { recursive: true, force: true });
        clear_resolution_cache();
    });

    function make_claude_session(session_id: string): string {
        const proj_dir = join(tmp_root, ".claude", "projects", "proj");
        mkdirSync(proj_dir, { recursive: true });
        const file = join(proj_dir, `${session_id}.jsonl`);
        writeFileSync(
            file,
            JSON.stringify({ type: "user", sessionId: session_id, message: { content: "hi" } }) +
                "\n",
        );
        return file;
    }

    it("AC1/2：单次 miss-resolve 至多一次写盘；未命中且内容不变时不写盘", () => {
        // 冷会话：索引为空 → 扫描命中回填。
        make_claude_session("sess_batch");
        resolve_session_file("claude_code", "win", "sess_batch", paths);
        flush_session_index();
        expect(save_spy).toHaveBeenCalledTimes(1);

        // 未命中且 key 不存在：内存索引无该 key，delete 不改变内容 → 不写盘。
        save_spy.mockClear();
        resolve_session_file("claude_code", "win", "does_not_exist", paths);
        flush_session_index();
        expect(save_spy).not.toHaveBeenCalled();
    });

    it("AC3：批量 resolve N 冷会话，flush 后写盘次数显著小于 N", () => {
        const N = 50;
        for (let i = 0; i < N; i++) make_claude_session(`sess_${String(i).padStart(3, "0")}`);
        for (let i = 0; i < N; i++) {
            resolve_session_file("claude_code", "win", `sess_${String(i).padStart(3, "0")}`, paths);
        }
        // debounce 窗口内 resolve 全部返回，未触发写盘。
        expect(save_spy).toHaveBeenCalledTimes(0);
        // flush 后一次写盘包含全部条目。
        flush_session_index();
        expect(save_spy).toHaveBeenCalledTimes(1);
        const index = read_index(index_dir).entries ?? {};
        expect(Object.keys(index)).toHaveLength(N);
    });

    it("AC3：单 miss 内「删失效 + 回填」合并为一次写盘", () => {
        const file = make_claude_session("sess_miss");
        resolve_session_file("claude_code", "win", "sess_miss", paths);
        flush_session_index();
        save_spy.mockClear();

        // 清缓存后改文件（mtime 变）→ 索引失效 → 扫描命中回填。
        clear_resolution_cache();
        writeFileSync(file, "changed content\n");
        const result = resolve_session_file("claude_code", "win", "sess_miss", paths);
        expect(result).not.toBeNull();
        flush_session_index();
        // 删失效条目 + 回填新条目合并为一次写盘。
        expect(save_spy).toHaveBeenCalledTimes(1);
    });

    it("切 index_dir 时先 flush 旧 dir 待落盘条目，不丢失 (t264 f001)", () => {
        const dir_a = join(tmp_root, "index-a");
        const dir_b = join(tmp_root, "index-b");
        const paths_a: LocatorPaths = { ...paths, index_dir: dir_a };
        const paths_b: LocatorPaths = { ...paths, index_dir: dir_b };
        const proj = join(tmp_root, ".claude", "projects", "proj");
        mkdirSync(proj, { recursive: true });
        const file_a = join(proj, "sess_a.jsonl");
        writeFileSync(file_a, JSON.stringify({ sessionId: "sess_a" }) + "\n");
        const file_b = join(proj, "sess_b.jsonl");
        writeFileSync(file_b, JSON.stringify({ sessionId: "sess_b" }) + "\n");

        // resolve A → dirty A；同一 debounce 窗口内 resolve B → 应先把 A 落盘再切 B。
        resolve_session_file("claude_code", "win", "sess_a", paths_a);
        resolve_session_file("claude_code", "win", "sess_b", paths_b);
        flush_session_index();

        // A 的条目已落盘到 dir_a，B 的到 dir_b。
        expect(read_index(dir_a).entries?.["claude_code|win|sess_a"]?.file_path).toBe(file_a);
        expect(read_index(dir_b).entries?.["claude_code|win|sess_b"]?.file_path).toBe(file_b);
    });

    it("命中早退路径后 flush 旧 dir 待落盘条目，不丢失 (t264 f002)", () => {
        const dir_a = join(tmp_root, "index-a");
        const dir_b = join(tmp_root, "index-b");
        const paths_a: LocatorPaths = { ...paths, index_dir: dir_a };
        const paths_b: LocatorPaths = { ...paths, index_dir: dir_b };
        const proj = join(tmp_root, ".claude", "projects", "proj");
        mkdirSync(proj, { recursive: true });
        const file_a = join(proj, "sess_a.jsonl");
        writeFileSync(file_a, JSON.stringify({ sessionId: "sess_a" }) + "\n");
        const file_b = join(proj, "sess_b.jsonl");
        writeFileSync(file_b, JSON.stringify({ sessionId: "sess_b" }) + "\n");

        // 先让 A、B 都建立磁盘索引（各 flush 一次）。
        resolve_session_file("claude_code", "win", "sess_a", paths_a);
        flush_session_index();
        resolve_session_file("claude_code", "win", "sess_b", paths_b);
        flush_session_index();

        // 模拟 A 再次产生 dirty（改文件 → resolve A 扫描回填置 dirty A，未 flush）。
        writeFileSync(file_a, "changed\n");
        clear_resolution_cache();
        resolve_session_file("claude_code", "win", "sess_a", paths_a);
        // A dirty 待落盘；此时 resolve B（磁盘索引早退，无 persist，守卫不触发）→ session_index 换为 B 的 map。
        clear_resolution_cache();
        const hit_b = resolve_session_file("claude_code", "win", "sess_b", paths_b);
        expect(hit_b?.file_path).toBe(file_b);
        // flush（timer/before-quit 路径）须用保存的 map 引用把 A 待落盘条目写盘。
        flush_session_index();
        expect(read_index(dir_a).entries?.["claude_code|win|sess_a"]?.file_path).toBe(file_a);
    });
});
