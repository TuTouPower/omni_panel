import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { discoverPlugins } from "../../../src/main/core/plugin/discovery";

describe("discoverPlugins", () => {
    it("returns empty array for non-existent directory", async () => {
        const result = await discoverPlugins("/nonexistent/path");
        expect(result).toEqual([]);
    });

    it("discovers .py plugins with metadata", async () => {
        const tmpDir = join(process.cwd(), ".test-plugins-disc");
        await mkdir(tmpDir, { recursive: true });

        const pluginContent = [
            "#!/usr/bin/env python3",
            "# UsageBoardPlugin:",
            "# {",
            '#   "name": "TestPlugin",',
            '#   "parameters": [{"name": "KEY", "label": "Key", "type": "secret", "required": true}]',
            "# }",
            "# /UsageBoardPlugin",
            "",
            'print("hello")',
        ].join("\n");

        await writeFile(join(tmpDir, "test-plugin.py"), pluginContent, "utf8");
        await writeFile(join(tmpDir, "_common.py"), "# shared\n", "utf8");

        const result = await discoverPlugins(tmpDir);

        expect(result.length).toBe(1);
        expect(result[0]?.scriptName).toBe("test-plugin.py");
        expect(result[0]?.metadata?.name).toBe("TestPlugin");
        expect(result[0]?.source).toBe("bundled");

        await rm(tmpDir, { recursive: true });
    });

    it("skips _common.py and non-.py files", async () => {
        const tmpDir = join(process.cwd(), ".test-plugins-skip");
        await mkdir(tmpDir, { recursive: true });
        await writeFile(join(tmpDir, "_common.py"), "# shared\n", "utf8");
        await writeFile(join(tmpDir, "readme.md"), "docs\n", "utf8");

        const result = await discoverPlugins(tmpDir);
        expect(result).toEqual([]);

        await rm(tmpDir, { recursive: true });
    });

    it("includes plugins with unparseable metadata as null", async () => {
        const tmpDir = join(process.cwd(), ".test-plugins-bad");
        await mkdir(tmpDir, { recursive: true });
        await writeFile(join(tmpDir, "broken.py"), "# no metadata block\nprint(1)\n", "utf8");

        const result = await discoverPlugins(tmpDir);
        expect(result.length).toBe(1);
        expect(result[0]?.metadata).toBeNull();

        await rm(tmpDir, { recursive: true });
    });
});
