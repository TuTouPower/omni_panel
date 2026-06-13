import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export function seed_fake_plugin(
    user_plugin_dir: string,
    spec: {
        name: string;
        items: {
            id: string;
            name: string;
            used: number;
            limit: number;
            status?: "normal" | "warning" | "critical" | "unknown";
        }[];
        behavior?: "ok" | "error" | "slow" | "crash";
        errorMessage?: string;
        parameters?: {
            name: string;
            label: string;
            type: string;
            required: boolean;
            placeholder?: string;
        }[];
        displayName?: string;
        provider?: string;
        requiredParam?: string;
    },
): string {
    const provider = spec.provider ?? "claude";
    const connector_root =
        basename(user_plugin_dir) === "plugins"
            ? join(dirname(user_plugin_dir), "connectors")
            : user_plugin_dir;
    const plugin_dir = join(connector_root, spec.name);
    mkdirSync(plugin_dir, { recursive: true });

    const parameters = (spec.parameters ?? []).map((parameter) => ({
        ...parameter,
        exposeToScript: parameter.name === spec.requiredParam,
    }));

    writeFileSync(
        join(plugin_dir, "manifest.json"),
        JSON.stringify(
            {
                id: spec.name,
                provider,
                capabilities: ["local"],
                parameters,
                local: { paths: ["~/.fake"] },
                script: "connector.ts",
            },
            null,
            4,
        ),
    );

    const observations_json = JSON.stringify(
        spec.items.map((item) => ({
            provider,
            source_instance_id: spec.name,
            account_id: item.id,
            account_label: item.name,
            metric_id: `${item.id}:usage`,
            name: item.name,
            window: "month",
            used: item.used,
            limit: item.limit,
            display_style: "ratio",
            reset_at: null,
            status: item.status ?? "normal",
            observed_at: 0,
            source: "local",
            stale: false,
            last_error: null,
        })),
    );

    let body: string;
    if (spec.behavior === "error") {
        body = `async function main() { throw new Error(${JSON.stringify(spec.errorMessage ?? "fake error")}); }\n`;
    } else if (spec.behavior === "crash") {
        body = `async function main() { throw new Error("process exited with code 2"); }\n`;
    } else if (spec.behavior === "slow") {
        body = `async function main() { throw new Error("Script execution timed out after 15000ms"); }\n`;
    } else if (spec.requiredParam) {
        body = `async function main() {\n    if (!ctx.params[${JSON.stringify(spec.requiredParam)}]) throw new Error("Missing required parameter");\n    return ${observations_json}.map((item) => ({ ...item, observed_at: Date.now() }));\n}\n`;
    } else {
        body = `async function main() {\n    return ${observations_json}.map((item) => ({ ...item, observed_at: Date.now() }));\n}\n`;
    }

    writeFileSync(join(plugin_dir, "connector.ts"), body);
    return plugin_dir;
}
