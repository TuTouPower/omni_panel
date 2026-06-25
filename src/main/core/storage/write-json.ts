import { writeFile, mkdir, rename, readdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createLogger } from "../../../shared/lib/logger";

const log = createLogger("write-json");

export async function writeJsonAtomic(
    filePath: string,
    data: unknown,
    options?: { chmod?: number },
): Promise<void> {
    log.debug(`writeJsonAtomic: start ${filePath}`);
    try {
        await mkdir(dirname(filePath), { recursive: true });
        const tmpPath = `${filePath}.tmp`;
        await writeFile(
            tmpPath,
            JSON.stringify(data, null, 2),
            options?.chmod ? { mode: options.chmod } : undefined,
        );
        await rename(tmpPath, filePath);
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
