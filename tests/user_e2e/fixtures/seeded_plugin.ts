import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Seed a fake plugin .ts file into a user plugin directory.
 * Returns the absolute path to the created file.
 */
export function seed_fake_plugin(
    user_plugin_dir: string,
    spec: {
        name: string;
        items: { id: string; name: string; used: number; limit: number }[];
        behavior?: "ok" | "error" | "slow" | "crash";
        parameters?: {
            name: string;
            label: string;
            type: string;
            required: boolean;
            placeholder?: string;
        }[];
        /** Override the metadata name. Defaults to spec.name. */
        displayName?: string;
        /** Provider key used for items and metadata. Defaults to "claude". */
        provider?: string;
    },
): string {
    mkdirSync(user_plugin_dir, { recursive: true });
    const file = join(user_plugin_dir, `${spec.name}.ts`);

    const provider = spec.provider ?? "claude";

    const meta_obj: Record<string, unknown> = {
        name: spec.displayName ?? spec.name,
        supportedProviders: [provider],
        defaultSource: "local",
    };
    if (spec.parameters && spec.parameters.length > 0) {
        meta_obj["parameters"] = spec.parameters;
    }
    const meta_json = JSON.stringify(meta_obj, null, 2)
        .split("\n")
        .map((l) => `// ${l}`)
        .join("\n");
    const meta = `// UsageBoardPlugin:\n${meta_json}\n// /UsageBoardPlugin\n`;

    const items_json = JSON.stringify(
        spec.items.map((it) => ({
            id: it.id,
            provider,
            source: "local",
            sourceInstanceId: spec.name,
            accountId: it.id,
            accountLabel: it.name,
            name: it.name,
            used: it.used,
            limit: it.limit,
            displayStyle: "ratio",
            status: "normal",
        })),
    );

    let body: string;
    if (spec.behavior === "error") {
        body = `console.log(JSON.stringify({ success: false, error: { code: "FAKE_ERROR", message: "fake error" } }));\n`;
    } else if (spec.behavior === "crash") {
        body = `process.exit(2);\n`;
    } else if (spec.behavior === "slow") {
        body = `async function main() { await new Promise(r => setTimeout(r, 60_000)); }\nmain();\n`;
    } else {
        body = `console.log(JSON.stringify({ success: true, schemaVersion: 2, updatedAt: new Date().toISOString(), items: ${items_json} }));\n`;
    }

    writeFileSync(file, meta + body);
    return file;
}
