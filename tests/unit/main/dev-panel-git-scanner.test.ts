import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scan_git_roots } from "../../../src/main/core/dev-panel/git-scanner";
import { create_dev_panel_scan_manager } from "../../../src/main/core/dev-panel/scan-manager";

const temporary_paths: string[] = [];

function git(cwd: string, ...args: string[]): void {
    execFileSync("git", args, { cwd, stdio: "ignore" });
}

async function fixture_repo(): Promise<{ root: string; repo: string }> {
    const root = await mkdtemp(join(tmpdir(), "omni-panel-dev-panel-"));
    temporary_paths.push(root);
    const repo = join(root, "repo");
    await mkdir(repo);
    git(repo, "init", "--quiet");
    git(repo, "config", "user.name", "Committer");
    git(repo, "config", "user.email", "committer@example.test");

    await writeFile(join(repo, "README.md"), "old\n");
    git(repo, "add", "README.md");
    execFileSync("git", ["commit", "--quiet", "-m", "old"], {
        cwd: repo,
        env: {
            ...process.env,
            GIT_AUTHOR_NAME: "Alice",
            GIT_AUTHOR_EMAIL: "alice@example.test",
            GIT_AUTHOR_DATE: "2026-03-19T08:00:00+00:00",
            GIT_COMMITTER_DATE: "2026-03-20T00:30:00+00:00",
        },
        stdio: "ignore",
    });
    await writeFile(join(repo, "README.md"), "new\n");
    git(repo, "add", "README.md");
    execFileSync("git", ["commit", "--quiet", "-m", "new"], {
        cwd: repo,
        env: {
            ...process.env,
            GIT_AUTHOR_NAME: "Bob",
            GIT_AUTHOR_EMAIL: "bob@example.test",
            GIT_AUTHOR_DATE: "2026-03-21T01:00:00+00:00",
            GIT_COMMITTER_DATE: "2026-03-21T01:00:00+00:00",
        },
        stdio: "ignore",
    });
    return { root, repo };
}

afterEach(async () => {
    await Promise.all(
        temporary_paths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
});

describe("t481 Git development panel scanner", () => {
    it("aggregates author dates, preserves committer fields, and de-duplicates roots", async () => {
        const { root, repo } = await fixture_repo();
        const result = await scan_git_roots({
            scanRoots: [root, repo],
            commitCutoff: "2026-03-20",
            currentUserOnly: false,
        });

        expect(result.status).toBe("completed");
        expect(result.repositories).toHaveLength(1);
        expect(result.repositories[0]?.commits).toBe(1);
        expect(result.daily).toEqual([expect.objectContaining({ date: "2026-03-21", count: 1 })]);
        expect(result.repositories[0]?.authors).toEqual([
            { name: "Bob", email: "bob@example.test", commits: 1 },
        ]);
        expect(result.repositories[0]?.committers).toEqual([
            { name: "Committer", email: "committer@example.test", commits: 1 },
        ]);
        expect(result.data_version).toBe(1);
    });

    it("reports a missing root while continuing with a valid root", async () => {
        const { root } = await fixture_repo();
        const result = await scan_git_roots({
            scanRoots: [join(root, "missing"), root],
            commitCutoff: "2026-03-20",
            currentUserOnly: false,
        });

        expect(result.status).toBe("completed");
        expect(result.errors.some((item) => item.root.endsWith("missing"))).toBe(true);
        expect(result.repositories).toHaveLength(1);
    });

    it("filters by global author identity and falls back visibly when identity is absent", async () => {
        const { root } = await fixture_repo();
        const identity_file = join(root, "global-gitconfig");
        git(root, "config", "--file", identity_file, "user.name", "Alice");
        git(root, "config", "--file", identity_file, "user.email", "alice@example.test");
        const previous_global = process.env["GIT_CONFIG_GLOBAL"];
        try {
            process.env["GIT_CONFIG_GLOBAL"] = identity_file;
            const filtered = await scan_git_roots({
                scanRoots: [root],
                commitCutoff: "2026-03-19",
                currentUserOnly: true,
            });
            expect(filtered.effective_current_user_only).toBe(true);
            expect(filtered.identity_warning).toBeUndefined();
            expect(filtered.repositories[0]?.commits).toBe(1);
            expect(filtered.repositories[0]?.authors[0]?.name).toBe("Alice");

            process.env["GIT_CONFIG_GLOBAL"] = join(root, "missing-global-gitconfig");
            const fallback = await scan_git_roots({
                scanRoots: [root],
                commitCutoff: "2026-03-19",
                currentUserOnly: true,
            });
            expect(fallback.effective_current_user_only).toBe(false);
            expect(fallback.identity_warning).toContain("降级为全部作者");
            expect(fallback.repositories[0]?.commits).toBe(2);
        } finally {
            if (previous_global === undefined) delete process.env["GIT_CONFIG_GLOBAL"];
            else process.env["GIT_CONFIG_GLOBAL"] = previous_global;
        }
    });

    it("merges duplicate concurrent requests into one scan", async () => {
        const { root } = await fixture_repo();
        const manager = create_dev_panel_scan_manager();
        const configuration = {
            scanRoots: [root],
            commitCutoff: "2026-03-20",
            currentUserOnly: false,
        } as const;
        const first = manager.start(configuration);
        const second = manager.start(configuration);
        expect(first.reused).toBe(false);
        expect(second).toEqual({ scan_id: first.scan_id, status: "running", reused: true });
        await expect.poll(() => manager.get_status().status, { timeout: 5000 }).not.toBe("running");
        expect(manager.get_status().result?.data_version).toBe(1);
    });
});
