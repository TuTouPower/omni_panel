import { writeFileSync } from "node:fs";
import { zodToJsonSchema } from "zod-to-json-schema";

import { pluginMetadataSchema } from "../src/shared/schemas/plugin-metadata";
import { pluginOutputSchema } from "../src/shared/schemas/plugin-output";

type JsonObject = Record<string, unknown>;

const stringifyJsonSchema = (schema: JsonObject): string => {
    const { $schema: schemaDialect, ...jsonSchema } = schema;

    const jsonSchemaDialect =
        typeof schemaDialect === "string"
            ? schemaDialect
            : "http://json-schema.org/draft-07/schema#";

    return `${JSON.stringify({ $schema: jsonSchemaDialect, ...jsonSchema }, null, 2)}\n`;
};

writeFileSync(
    "schemas/plugin-output.schema.json",
    stringifyJsonSchema(zodToJsonSchema(pluginOutputSchema)),
);

writeFileSync(
    "schemas/plugin-metadata.schema.json",
    stringifyJsonSchema(zodToJsonSchema(pluginMetadataSchema)),
);

console.log("Schemas exported to schemas/");
