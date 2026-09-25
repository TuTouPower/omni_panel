import { readFileSync, writeFileSync } from "node:fs";
import { zodToJsonSchema } from "zod-to-json-schema";
import prettier from "prettier";

import { pluginMetadataSchema } from "../src/shared/schemas/plugin-metadata";
import { pluginResultSchema } from "../src/shared/schemas/plugin-output";

type JsonObject = Record<string, unknown>;

const stringifyJsonSchema = async (schema: JsonObject, filePath: string): Promise<string> => {
    const { $schema: schemaDialect, ...jsonSchema } = schema;

    const jsonSchemaDialect =
        typeof schemaDialect === "string"
            ? schemaDialect
            : "http://json-schema.org/draft-07/schema#";

    const raw = JSON.stringify({ $schema: jsonSchemaDialect, ...jsonSchema }, null, 4);
    const prettier_config = (await prettier.resolveConfig(filePath)) ?? {};
    return prettier.format(raw, { ...prettier_config, parser: "json" });
};

const is_check = process.argv.includes("--check");

async function main() {
    const targets = [
        {
            file: "schemas/plugin-output.schema.json",
            content: await stringifyJsonSchema(
                zodToJsonSchema(pluginResultSchema),
                "schemas/plugin-output.schema.json",
            ),
        },
        {
            file: "schemas/plugin-metadata.schema.json",
            content: await stringifyJsonSchema(
                zodToJsonSchema(pluginMetadataSchema),
                "schemas/plugin-metadata.schema.json",
            ),
        },
    ];

    if (is_check) {
        let has_drift = false;
        for (const target of targets) {
            let existing = "";
            try {
                existing = readFileSync(target.file, "utf8");
            } catch {
                existing = "";
            }
            if (existing !== target.content) {
                console.error(
                    `[schema:export --check] Drift detected in ${target.file}. Run 'pnpm schema:export' to synchronize.`,
                );
                has_drift = true;
            }
        }
        if (has_drift) {
            process.exit(1);
        }
        console.log("All exported JSON schemas match current Zod schema definitions.");
    } else {
        for (const target of targets) {
            writeFileSync(target.file, target.content, "utf8");
        }
        console.log("Schemas exported to schemas/");
    }
}

main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
});
