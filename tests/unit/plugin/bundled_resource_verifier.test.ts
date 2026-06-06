import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, afterEach, beforeEach } from "vitest";
import {
    BundledResourceIntegrityError,
    verify_bundled_resources,
} from "../../../src/main/core/plugin/bundled_resource_verifier";

const test_dir = join(tmpdir(), `bundled-resource-verifier-${String(Date.now())}`);
const plugins_dir = join(test_dir, "plugins");
const sdk_dir = join(test_dir, "sdk");
const source_plugins_dir = resolve(__dirname, "../../../assets/plugins");
const source_sdk_dir = resolve(__dirname, "../../../src/plugins/sdk");

beforeEach(async () => {
    await mkdir(test_dir, { recursive: true });
    await cp(source_plugins_dir, plugins_dir, { recursive: true });
    await cp(source_sdk_dir, sdk_dir, { recursive: true });
});

afterEach(async () => {
    await rm(test_dir, { recursive: true, force: true });
});

describe("verify_bundled_resources", () => {
    it("accepts the bundled plugin and sdk files", async () => {
        await expect(verify_bundled_resources(plugins_dir, sdk_dir)).resolves.toBeUndefined();
    });

    it("rejects a changed bundled plugin file", async () => {
        await writeFile(join(plugins_dir, "claude-usage-plugin.ts"), "tampered", "utf8");

        await expect(verify_bundled_resources(plugins_dir, sdk_dir)).rejects.toBeInstanceOf(
            BundledResourceIntegrityError,
        );
    });

    it("rejects an unexpected bundled plugin file", async () => {
        await writeFile(join(plugins_dir, "evil-usage-plugin.ts"), "export {};", "utf8");

        await expect(verify_bundled_resources(plugins_dir, sdk_dir)).rejects.toBeInstanceOf(
            BundledResourceIntegrityError,
        );
    });
});
