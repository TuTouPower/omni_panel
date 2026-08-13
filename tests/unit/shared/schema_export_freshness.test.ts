import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";
import { pluginMetadataSchema } from "../../../src/shared/schemas/plugin-metadata";
import { pluginResultSchema } from "../../../src/shared/schemas/plugin-output";

const SCHEMA_DIALECT = "http://json-schema.org/draft-07/schema#";

// t338：`pnpm schema:export` 的产物（scripts/export-schemas.ts 用相同
// zodToJsonSchema + $schema 前缀，缩进不影响语义）。本测试以「源派生结构」
// 为基准，断言提交的 schema.json 与其深等——zod 源或提交产物任一漂移即红，
// 补足 CI 漂移门禁只能证明「提交==重导出」、源与导出脚本同步回归时静默失效
// 的盲区。
function derived_plugin_output(): Record<string, unknown> {
    return { $schema: SCHEMA_DIALECT, ...(zodToJsonSchema(pluginResultSchema) as object) };
}

function derived_plugin_metadata(): Record<string, unknown> {
    return { $schema: SCHEMA_DIALECT, ...(zodToJsonSchema(pluginMetadataSchema) as object) };
}

function committed_json(rel: string): Record<string, unknown> {
    const raw = readFileSync(resolve(__dirname, rel), "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
}

describe("schema:export 产物与 zod 源一致（t338）", () => {
    it("plugin-output.schema.json 与源导出深等", () => {
        const committed = committed_json("../../../schemas/plugin-output.schema.json");
        expect(committed).toEqual(derived_plugin_output());
    });

    it("plugin-metadata.schema.json 与源导出深等", () => {
        const committed = committed_json("../../../schemas/plugin-metadata.schema.json");
        expect(committed).toEqual(derived_plugin_metadata());
    });

    it("items 含 metric_id/cycleDurationMs/error 内容契约", () => {
        const item_props = (
            derived_plugin_output().anyOf as {
                properties: { items: { items: { properties: Record<string, unknown> } } };
            }[]
        )[0].properties.items.items.properties;
        expect(item_props).toHaveProperty("metric_id");
        expect(item_props).toHaveProperty("cycleDurationMs");
        expect(item_props).toHaveProperty("error");
        expect(item_props["provider"]).toEqual({ type: "string", pattern: "^[a-z][a-z0-9_]*$" });
    });

    it("plugin-metadata 顶层含 login_url/cookie_names", () => {
        const props = derived_plugin_metadata().properties as Record<string, unknown>;
        expect(props).toHaveProperty("login_url");
        expect(props).toHaveProperty("cookie_names");
    });
});
