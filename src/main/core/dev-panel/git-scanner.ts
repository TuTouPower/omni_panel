import { execFile, type ChildProcess } from "node:child_process";
import { readFile, realpath, readdir, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import type {
    DevPanelAuthorSummary,
    DevPanelConfiguration,
    DevPanelDailyRepositoryCount,
    DevPanelDailySummary,
    DevPanelRepositorySummary,
    DevPanelScanError,
    DevPanelScanResult,
} from "../../../shared/types/dev-panel";

const ROOT_TIMEOUT_MS = 30_000;
const COMMAND_TIMEOUT_MS = 30_000;
const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;
const SKIP_DIRECTORIES = new Set([
    ".git",
    ".hg",
    ".svn",
    "node_modules",
    "dist",
    "out",
    "build",
    ".cache",
    ".venv",
    "target",
    ".scratch",
    ".claude",
    "uv_cache",
    ".turbo",
    ".next",
]);

function is_ignorable_git_error(message: string): boolean {
    const lower = message.toLowerCase();
    return (
        lower.includes("invalid gitfile format") ||
        lower.includes("not a git repository") ||
        lower.includes("not a valid repository")
    );
}

async function is_valid_git_entry(git_path: string): Promise<boolean> {
    try {
        const s = await stat(git_path);
        if (s.isDirectory()) {
            try {
                await stat(resolve(git_path, "HEAD"));
                return true;
            } catch {
                try {
                    await stat(resolve(git_path, "config"));
                    return true;
                } catch {
                    return false;
                }
            }
        }
        if (s.isFile()) {
            if (s.size === 0) return false;
            const content = await readFile(git_path, "utf-8");
            const match = /^gitdir:\s*(.+)$/m.exec(content);
            if (!match?.[1]) return false;
            const raw_target = match[1].trim();
            const target = isAbsolute(raw_target)
                ? raw_target
                : resolve(dirname(git_path), raw_target);
            await stat(target);
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

function path_key(value: string): string {
    return process.platform === "win32" ? value.toLowerCase() : value;
}

interface GitCommandResult {
    readonly stdout: string;
    readonly stderr: string;
}

interface CommitRecord {
    readonly date: string;
    readonly author_name: string;
    readonly author_email: string;
    readonly committer_name: string;
    readonly committer_email: string;
}

interface RepositoryScan {
    readonly repository: string;
    readonly path: string;
    readonly commits: readonly CommitRecord[];
}

function expand_root(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed === "~") return homedir();
    if (trimmed.startsWith("~/")) return resolve(homedir(), trimmed.slice(2));
    return isAbsolute(trimmed) ? trimmed : resolve(trimmed);
}

function throw_if_aborted(signal: AbortSignal): void {
    if (signal.aborted) {
        throw new Error("scan cancelled");
    }
}

function exec_file(
    args: readonly string[],
    signal: AbortSignal,
    timeout: number = COMMAND_TIMEOUT_MS,
): Promise<GitCommandResult> {
    return new Promise((resolve_result, reject) => {
        const child_holder: { current: ChildProcess | undefined } = { current: undefined };
        let settled = false;
        const finish = (callback: () => void): void => {
            if (settled) return;
            settled = true;
            signal.removeEventListener("abort", on_abort);
            callback();
        };
        const on_abort = (): void => {
            child_holder.current?.kill();
            finish(() => {
                reject(new Error("scan cancelled"));
            });
        };
        signal.addEventListener("abort", on_abort, { once: true });
        const child = execFile(
            "git",
            [...args],
            {
                shell: false,
                timeout,
                maxBuffer: MAX_GIT_OUTPUT_BYTES,
                encoding: "utf8",
            },
            (error, stdout, stderr) => {
                finish(() => {
                    if (error) {
                        const detail = stderr.trim() || error.message;
                        reject(new Error(detail));
                        return;
                    }
                    resolve_result({ stdout, stderr });
                });
            },
        );
        child_holder.current = child;
        if (signal.aborted) on_abort();
    });
}

async function exec_optional(args: readonly string[], signal: AbortSignal): Promise<string> {
    try {
        return (await exec_file(args, signal, 5_000)).stdout.trim();
    } catch {
        throw_if_aborted(signal);
        return "";
    }
}

async function canonical_path(path: string): Promise<string> {
    try {
        return await realpath(path);
    } catch {
        return resolve(path);
    }
}

async function discover_repositories(root: string, signal: AbortSignal): Promise<string[]> {
    const repositories = new Map<string, string>();
    const root_top = await exec_optional(["-C", root, "rev-parse", "--show-toplevel"], signal);
    if (root_top) {
        const top = await canonical_path(root_top);
        repositories.set(path_key(top), top);
    }

    const pending = [root];
    while (pending.length > 0) {
        throw_if_aborted(signal);
        const directory = pending.pop();
        if (!directory) continue;
        let entries;
        try {
            entries = await readdir(directory, { withFileTypes: true });
        } catch (error: unknown) {
            if (directory === root) {
                throw new Error(error instanceof Error ? error.message : "扫描根目录不可读");
            }
            continue;
        }
        for (const entry of entries) {
            throw_if_aborted(signal);
            const child = resolve(directory, entry.name);
            if (entry.name === ".git") {
                if (await is_valid_git_entry(child)) {
                    const repo = await canonical_path(directory);
                    repositories.set(path_key(repo), repo);
                }
                continue;
            }
            if (entry.isDirectory() && !SKIP_DIRECTORIES.has(entry.name)) {
                pending.push(child);
            }
        }
    }
    return [...repositories.values()];
}

function local_date(value: string, timezone: string): string | null {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const values = new Map(parts.map((part) => [part.type, part.value]));
    const year = values.get("year");
    const month = values.get("month");
    const day = values.get("day");
    return year && month && day ? `${year}-${month}-${day}` : null;
}

function parse_log(stdout: string, timezone: string): CommitRecord[] {
    const records: CommitRecord[] = [];
    for (const raw of stdout.split("\x1e")) {
        const fields = raw.trim().split("\x1f");
        if (fields.length < 6) continue;
        const date = local_date(fields[3] ?? "", timezone);
        if (!date) continue;
        records.push({
            date,
            author_name: fields[1] ?? "",
            author_email: fields[2] ?? "",
            committer_name: fields[4] ?? "",
            committer_email: fields[5] ?? "",
        });
    }
    return records;
}

function increment_summary(
    target: Map<string, { name: string; email: string; commits: number }>,
    name: string,
    email: string,
): void {
    const key = `${name}\u0000${email}`;
    const previous = target.get(key);
    if (previous) {
        previous.commits++;
        return;
    }
    target.set(key, { name, email, commits: 1 });
}

function sort_people(values: Map<string, DevPanelAuthorSummary>): DevPanelAuthorSummary[] {
    return [...values.values()].sort(
        (left, right) =>
            right.commits - left.commits ||
            left.name.localeCompare(right.name) ||
            left.email.localeCompare(right.email),
    );
}

function aggregate_repository(
    repository: RepositoryScan,
    cutoff: string,
    current_user_only: boolean,
    identity: { name: string; email: string } | null,
): { summary: DevPanelRepositorySummary; daily: Map<string, Map<string, number>> } {
    const authors = new Map<string, DevPanelAuthorSummary>();
    const committers = new Map<string, DevPanelAuthorSummary>();
    const daily = new Map<string, Map<string, number>>();
    let commits = 0;
    for (const record of repository.commits) {
        if (record.date < cutoff) continue;
        if (
            current_user_only &&
            identity &&
            (record.author_name !== identity.name || record.author_email !== identity.email)
        ) {
            continue;
        }
        commits++;
        increment_summary(authors, record.author_name, record.author_email);
        increment_summary(committers, record.committer_name, record.committer_email);
        const day = daily.get(record.date) ?? new Map<string, number>();
        day.set(repository.repository, (day.get(repository.repository) ?? 0) + 1);
        daily.set(record.date, day);
    }
    return {
        summary: {
            repository: repository.repository,
            path: repository.path,
            commits,
            authors: sort_people(authors),
            committers: sort_people(committers),
        },
        daily,
    };
}

async function scan_repository(
    repository_path: string,
    signal: AbortSignal,
    timezone: string,
): Promise<RepositoryScan> {
    const top_raw = await exec_file(
        ["-C", repository_path, "rev-parse", "--show-toplevel"],
        signal,
    );
    const top = await canonical_path(top_raw.stdout.trim());
    const repository = basename(top) || top;
    const log_result = await exec_file(
        [
            "-C",
            top,
            "--no-pager",
            "log",
            "--all",
            // Do not use --since here: Git filters that option by committer
            // date, while the product cutoff is defined on author date.
            "--date=iso-strict",
            "--pretty=format:%H%x1f%an%x1f%ae%x1f%ad%x1f%cn%x1f%ce%x1e",
        ],
        signal,
    );
    return { repository, path: top, commits: parse_log(log_result.stdout, timezone) };
}

export async function scan_git_roots(
    configuration: DevPanelConfiguration,
    scan_id: string = randomUUID(),
    data_version = 1,
    signal: AbortSignal = new AbortController().signal,
): Promise<DevPanelScanResult> {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
    const roots = configuration.scanRoots.map(expand_root).filter((root) => root.length > 0);
    const errors: DevPanelScanError[] = [];
    const repositories = new Set<string>();
    const configured_name = await exec_optional(
        ["config", "--global", "--get", "user.name"],
        signal,
    );
    const configured_email = await exec_optional(
        ["config", "--global", "--get", "user.email"],
        signal,
    );
    const identity =
        configured_name && configured_email
            ? { name: configured_name, email: configured_email }
            : null;
    const identity_warning =
        configuration.currentUserOnly && !identity
            ? "未找到全局 Git user.name/user.email，已降级为全部作者"
            : undefined;
    const effective_current_user_only = configuration.currentUserOnly && identity !== null;
    const summaries: DevPanelRepositorySummary[] = [];
    const daily = new Map<string, Map<string, number>>();
    const add_repository_scan = (scanned: RepositoryScan): void => {
        const aggregate = aggregate_repository(
            scanned,
            configuration.commitCutoff,
            effective_current_user_only,
            identity,
        );
        summaries.push(aggregate.summary);
        for (const [date, counts] of aggregate.daily) {
            const target = daily.get(date) ?? new Map<string, number>();
            for (const [name, count] of counts) target.set(name, (target.get(name) ?? 0) + count);
            daily.set(date, target);
        }
    };
    for (const root of roots) {
        throw_if_aborted(signal);
        try {
            const info = await stat(root);
            if (!info.isDirectory()) {
                errors.push({ root, message: "扫描根目录不是目录" });
                continue;
            }
            const root_controller = new AbortController();
            const timer = setTimeout(() => {
                root_controller.abort();
            }, ROOT_TIMEOUT_MS);
            const abort_root = (): void => {
                root_controller.abort();
            };
            signal.addEventListener("abort", abort_root, { once: true });
            try {
                for (const repository of await discover_repositories(
                    root,
                    root_controller.signal,
                )) {
                    throw_if_aborted(root_controller.signal);
                    try {
                        const common_dir = await exec_file(
                            ["-C", repository, "rev-parse", "--git-common-dir"],
                            root_controller.signal,
                        );
                        const common = await canonical_path(
                            resolve(repository, common_dir.stdout.trim()),
                        );
                        const common_key = path_key(common);
                        if (repositories.has(common_key)) continue;
                        repositories.add(common_key);
                        add_repository_scan(
                            await scan_repository(repository, root_controller.signal, timezone),
                        );
                    } catch (error: unknown) {
                        if (root_controller.signal.aborted) throw error;
                        const message = error instanceof Error ? error.message : String(error);
                        if (is_ignorable_git_error(message)) {
                            continue;
                        }
                        errors.push({
                            root,
                            path: repository,
                            message,
                        });
                    }
                }
            } catch (error: unknown) {
                if (signal.aborted) throw error;
                errors.push({
                    root,
                    message: root_controller.signal.aborted
                        ? "扫描根超时（超过 30 秒）"
                        : error instanceof Error
                          ? error.message
                          : String(error),
                });
            } finally {
                clearTimeout(timer);
                signal.removeEventListener("abort", abort_root);
            }
        } catch (error: unknown) {
            if (signal.aborted) throw error;
            errors.push({ root, message: error instanceof Error ? error.message : String(error) });
        }
    }

    const daily_result: DevPanelDailySummary[] = [...daily.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, counts]) => {
            const repositories_for_day: DevPanelDailyRepositoryCount[] = [...counts.entries()]
                .map(([repository, count]) => ({ repository, count }))
                .sort(
                    (left, right) =>
                        right.count - left.count || left.repository.localeCompare(right.repository),
                );
            return {
                date,
                count: repositories_for_day.reduce((sum, item) => sum + item.count, 0),
                repositories: repositories_for_day,
            };
        });
    return {
        scan_id,
        status: errors.length > 0 && summaries.length === 0 ? "failed" : "completed",
        scanned_at: new Date().toISOString(),
        data_version,
        timezone,
        scan_roots: roots,
        cutoff: configuration.commitCutoff,
        current_user_only: configuration.currentUserOnly,
        effective_current_user_only,
        ...(identity_warning ? { identity_warning } : {}),
        daily: daily_result,
        repositories: summaries.sort((left, right) =>
            left.repository.localeCompare(right.repository),
        ),
        errors,
    };
}
