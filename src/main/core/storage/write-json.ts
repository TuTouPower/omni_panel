import { writeFile, mkdir, rename, readdir, unlink, open } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createLogger } from "../../../shared/lib/logger";

const log = createLogger("write-json");

/**
 * Windows rename 覆盖已存在目标时偶发 EPERM/EBUSY——目标被另一进程短暂持句柄
 * （如 Defender 扫描 config.json）。瞬时抖动，有限重试后仍失败才抛错。
 */
const RENAME_MAX_ATTEMPTS = 3;

async function rename_with_retry(tmpPath: string, filePath: string): Promise<void> {
    for (let attempt = 1; ; attempt++) {
        try {
            await rename(tmpPath, filePath);
            return;
        } catch (error) {
            const code = (error as NodeJS.ErrnoException | null)?.code;
            const transient = code === "EPERM" || code === "EBUSY" || code === "EACCES";
            if (attempt >= RENAME_MAX_ATTEMPTS || !transient) throw error;
            await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
        }
    }
}

/**
 * 原子写文本文件：先写 .tmp，fsync 落盘后再 rename 到目标路径。
 * 在 writeFile 后直接 fsync 可防止进程 mid-write 被杀时 tmp 文件只留预分配的 null bytes，
 * 从而避免 rename 后的目标文件变成全 \0 损坏文件。
 */
export async function writeFileAtomic(
    filePath: string,
    content: string,
    options?: { chmod?: number },
): Promise<void> {
    const tmpPath = `${filePath}.tmp`;
    await writeFile(tmpPath, content, options?.chmod ? { mode: options.chmod } : "utf8");
    const handle = await open(tmpPath, "r+");
    try {
        await handle.sync();
    } finally {
        await handle.close();
    }
    await rename_with_retry(tmpPath, filePath);
}

export async function writeJsonAtomic(
    filePath: string,
    data: unknown,
    options?: { chmod?: number },
): Promise<void> {
    log.debug(`writeJsonAtomic: start ${filePath}`);
    try {
        await mkdir(dirname(filePath), { recursive: true });
        await writeFileAtomic(filePath, JSON.stringify(data, null, 2), options);
        log.debug(`writeJsonAtomic: done ${filePath}`);
    } catch (error) {
        log.error(`writeJsonAtomic: failed ${filePath}`, error);
        throw error;
    }
}

/**
 * Remove stale `.tmp` files left by interrupted atomic writes.
 * Call once on startup for each directory that uses writeJsonAtomic.
 */
export async function cleanup_temp_files(dir: string): Promise<void> {
    let entries: string[];
    try {
        entries = await readdir(dir);
    } catch {
        // Directory may not exist yet — nothing to clean
        return;
    }
    const tmp_files = entries.filter((name) => name.endsWith(".tmp"));
    if (tmp_files.length > 0) {
        log.debug(`cleanup_temp_files: removing ${String(tmp_files.length)} files in ${dir}`);
    }
    await Promise.all(
        tmp_files.map((name) =>
            unlink(join(dir, name)).catch(() => {
                /* already gone */
            }),
        ),
    );
}
