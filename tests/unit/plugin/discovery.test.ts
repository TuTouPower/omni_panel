import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { discoverPlugins } from "../../../src/main/core/plugin/discovery";

describe("discoverPlugins", () => {
    it("returns empty array for non-existent directory", async () => {
        const result = await discoverPlugins("/nonexistent/path");
        expect(result).toEqual([]);
    });

    it("discovers .ts plugins with metadata", async () => {
        const tmpDir = join(process.cwd(), ".test-plugins-disc");
        await mkdir(tmpDir, { recursive: true });

        const pluginContent = [
            "// UsageBoardPlugin:",
            "// {",
            '//   "name": "TestPlugin",',
            '//   "parameters": [{"name": "KEY", "label": "Key", "type": "secret", "required": true}]',
            "// }",
            "// /UsageBoardPlugin",
            "",
            'console.log("hello");',
        ].join("\n");

        await writeFile(join(tmpDir, "test-plugin.ts"), pluginContent, "utf8");

        const result = await discoverPlugins(tmpDir);

        expect(result.length).toBe(1);
        expect(result[0]?.scriptName).toBe("test-plugin.ts");
        expect(result[0]?.metadata?.name).toBe("TestPlugin");
        expect(result[0]?.source).toBe("bundled");

        await rm(tmpDir, { recursive: true });
    });

    it("skips non-.ts files", async () => {
        const tmpDir = join(process.cwd(), ".test-plugins-skip");
        await mkdir(tmpDir, { recursive: true });
        await writeFile(join(tmpDir, "readme.md"), "docs\n", "utf8");
        await writeFile(join(tmpDir, ".dotfile.ts"), "// hidden\n", "utf8");

        const result = await discoverPlugins(tmpDir);
        expect(result).toEqual([]);

        await rm(tmpDir, { recursive: true });
    });

    it("includes plugins with unparseable metadata as null", async () => {
        const tmpDir = join(process.cwd(), ".test-plugins-bad");
        await mkdir(tmpDir, { recursive: true });
        await writeFile(
            join(tmpDir, "broken.ts"),
            "// no metadata block\nconsole.log(1);\n",
            "utf8",
        );

        const result = await discoverPlugins(tmpDir);
        expect(result.length).toBe(1);
        expect(result[0]?.metadata).toBeNull();

        await rm(tmpDir, { recursive: true });
    });
});
