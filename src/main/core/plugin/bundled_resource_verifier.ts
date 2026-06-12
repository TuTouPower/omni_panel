import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const PLUGIN_HASHES: Readonly<Record<string, string>> = {
    "claude-usage-plugin.ts": "7d06c3fcaee6079fcde914897f037b7aca5ec33ef613553cdb4e74eb9f059efb",
    "codex-usage-plugin.ts": "3bbb525108095c3eb3267f273c9bf96b88288caedb00cd5b68b5e18f961ccff1",
    "cpa-usage-plugin.ts": "d92389bb474888746e3d4d245bbf1acb4f7ae3d05a1f8d908972a99da5177357",
    "deepseek-usage-plugin.ts": "71f1634c3e87a815d52b4685e16d4c52f8fbeeb3883b838a6e7bd4ed3ec42211",
    "glm-usage-plugin.ts": "7e262fc77d5d93e31be239a1c925713ba387b91af2b98c77e77ffd7ce32111a9",
    "mimo-usage-plugin.ts": "8956a3dfd96ffd226c529f20753e4224754c5371d4bf01e25406c6a7602f45c7",
    "minimax-usage-plugin.ts": "53b10a2bfa473a78f5424b50b4676e5a7eae341efdfd574e229c452733cc6109",
    "tavily-usage-plugin.ts": "9f846176dfc6cd44ed85ab1db9bbbabf469c41bf59e239bd35cd3af10ce32aab",
    "tsconfig.json": "6afd460e11238e42af163c64413cef38df7ba0ecc1459b52052d9486ba409629",
};

const SDK_HASHES: Readonly<Record<string, string>> = {
    "define-plugin.ts": "b364808db49bc685e5587fb67bc54e17f1f4c2ff7672e25091e7705c4b004603",
    "endpoints.ts": "2c4c7def375029793b374053d5b905fad6ed17851931cc64ef85d47d6de62cc4",
    "errors.ts": "c6fffe9bd61da92b9b144b6a5ce45822d646273ef83b054c4bbd94558d424a78",
    "helpers.ts": "62062cbdf70e790677b447cfe2e7ec040485920df6061222083497381e96206d",
    "http-client.ts": "4c60168efc6d5d1cb67374d28e980fbbf61df10622550ad84b5e7438d88dc7b2",
    "index.ts": "bf1d945d1c274f86506d2cbae83f2d9d604e2df93f9d6883dfc2fafaca36c0ca",
    "result.ts": "36f68663b71d180de0544ba8fad35d752c90269e4af6818946a788158a8f3d51",
};

export class BundledResourceIntegrityError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "BundledResourceIntegrityError";
    }
}

async function list_files(dir: string): Promise<readonly string[]> {
    const files: string[] = [];
    const walk = async (current_dir: string): Promise<void> => {
        const entries = await readdir(current_dir, { withFileTypes: true });
        for (const entry of entries) {
            const path = join(current_dir, entry.name);
            if (entry.isDirectory()) {
                await walk(path);
            } else if (entry.isFile()) {
                files.push(relative(dir, path).replaceAll("\\", "/"));
            }
        }
    };
    await walk(dir);
    return files.sort();
}

async function hash_file(path: string): Promise<string> {
    const content = await readFile(path);
    return createHash("sha256").update(content).digest("hex");
}

async function verify_dir(
    label: string,
    dir: string,
    expected_hashes: Readonly<Record<string, string>>,
): Promise<void> {
    const actual_files = await list_files(dir);
    const expected_files = Object.keys(expected_hashes).sort();
    const unexpected = actual_files.filter((file) => !expected_hashes[file]);
    const missing = expected_files.filter((file) => !actual_files.includes(file));
    if (unexpected.length > 0 || missing.length > 0) {
        throw new BundledResourceIntegrityError(
            `${label} file set mismatch: unexpected=${unexpected.join(",") || "none"} missing=${missing.join(",") || "none"}`,
        );
    }

    for (const file of expected_files) {
        const actual_hash = await hash_file(join(dir, file));
        if (actual_hash !== expected_hashes[file]) {
            throw new BundledResourceIntegrityError(`${label} hash mismatch: ${file}`);
        }
    }
}

export async function verify_bundled_resources(
    plugins_dir: string,
    sdk_dir: string,
): Promise<void> {
    await verify_dir("bundled plugins", plugins_dir, PLUGIN_HASHES);
    await verify_dir("plugin sdk", sdk_dir, SDK_HASHES);
}
