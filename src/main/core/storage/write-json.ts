import { writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";

export async function writeJsonAtomic(
    filePath: string,
    data: unknown,
    options?: { chmod?: number },
): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.tmp`;
    await writeFile(
        tmpPath,
        JSON.stringify(data, null, 2),
        options?.chmod ? { mode: options.chmod } : undefined,
    );
    await rename(tmpPath, filePath);
}
