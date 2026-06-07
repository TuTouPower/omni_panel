import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pluginsDir = join(root, "assets", "plugins");
const sdkDir = join(root, "src", "plugins", "sdk");
const verifierPath = join(root, "src", "main", "core", "plugin", "bundled_resource_verifier.ts");

async function hashDir(dir: string): Promise<Record<string, string>> {
    const hashes: Record<string, string> = {};
    const files: string[] = [];

    const walk = async (current: string) => {
        const entries = await readdir(current, { withFileTypes: true });
        for (const entry of entries) {
            const p = join(current, entry.name);
            if (entry.isDirectory()) await walk(p);
            else if (entry.isFile()) files.push(relative(dir, p).replaceAll("\\", "/"));
        }
    };
    await walk(dir);

    for (const file of files.sort()) {
        const content = await readFile(join(dir, file));
        hashes[file] = createHash("sha256").update(content).digest("hex");
    }
    return hashes;
}

function formatHashMap(name: string, hashes: Record<string, string>): string {
    const entries = Object.entries(hashes)
        .map(([k, v]) => `    "${k}": "${v}"`)
        .join(",\n");
    return `const ${name}: Readonly<Record<string, string>> = {\n${entries},\n};`;
}

async function main() {
    const pluginHashes = await hashDir(pluginsDir);
    const sdkHashes = await hashDir(sdkDir);

    let source = await readFile(verifierPath, "utf8");

    const pluginBlock = formatHashMap("PLUGIN_HASHES", pluginHashes);
    const sdkBlock = formatHashMap("SDK_HASHES", sdkHashes);

    source = source.replace(
        /const PLUGIN_HASHES: Readonly<Record<string, string>> = \{[^}]+\};/s,
        pluginBlock,
    );
    source = source.replace(
        /const SDK_HASHES: Readonly<Record<string, string>> = \{[^}]+\};/s,
        sdkBlock,
    );

    await writeFile(verifierPath, source, "utf8");

    console.log("Updated bundled resource hashes:");
    console.log(`  plugins: ${String(Object.keys(pluginHashes).length)} files`);
    console.log(`  sdk: ${String(Object.keys(sdkHashes).length)} files`);
}

main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});
