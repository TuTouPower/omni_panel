import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { discover_connector_definitions } from "../../../../../src/main/core/connector/manifest-loader";
import type { Manifest } from "../../../../../src/shared/schemas/manifest";

const MINIMAL_MANIFEST: Manifest = {
    id: "custom_vendor",
    provider: "custom_vendor",
    capabilities: ["poll"],
    parameters: [{ name: "API_KEY", type: "secret", required: true, exposeToScript: true }],
    endpoints: { default: "https://api.example.com" },
    poll: { request: { endpoint: "default", path: "/usage", method: "GET" }, map: {} },
    script: "connector.ts",
};

async function make_user_connector(parent: string, provider: string): Promise<string> {
    const dir = join(parent, provider);
    await mkdir(dir, { recursive: true });
    const manifest: Manifest = { ...MINIMAL_MANIFEST, id: provider, provider };
    await writeFile(join(dir, "manifest.json"), JSON.stringify(manifest));
    await writeFile(join(dir, "connector.ts"), "export {};");
    return dir;
}

describe("manifest-loader custom provider (t095)", () => {
    const tmp_roots: string[] = [];
    afterEach(async () => {
        await Promise.all(tmp_roots.splice(0).map((d) => rm(d, { recursive: true, force: true })));
    });

    // t515: 引入 allow_user_connectors 信任开关，默认跳过未受信用户目录；开启后发现合法的自定义 snake_case 连接器
    it("discovers a user connector with arbitrary snake_case provider name when allow_user_connectors is true", async () => {
        const builtin = await mkdtemp(join(tmpdir(), "builtin-"));
        const user = await mkdtemp(join(tmpdir(), "user-"));
        tmp_roots.push(builtin, user);
        await make_user_connector(user, "my_vendor");

        // 默认未开启信任时跳过
        const defs_default = await discover_connector_definitions(builtin, user);
        expect(defs_default.find((d) => d.manifest.provider === "my_vendor")).toBeUndefined();

        // 显式开启信任后加载
        const defs = await discover_connector_definitions(builtin, user, {
            allow_user_connectors: true,
        });

        const custom = defs.find((d) => d.manifest.provider === "my_vendor");
        expect(custom, "custom provider connector must be discovered, not skipped").toBeDefined();
    });

    it("still discovers builtin enum providers alongside custom ones", async () => {
        const builtin = await mkdtemp(join(tmpdir(), "builtin-"));
        const user = await mkdtemp(join(tmpdir(), "user-"));
        tmp_roots.push(builtin, user);
        await make_user_connector(builtin, "deepseek");
        await make_user_connector(user, "acme Corp"); // invalid: space → rejected by regex

        const defs = await discover_connector_definitions(builtin, user, {
            allow_user_connectors: true,
        });
        const providers = defs.map((d) => d.manifest.provider);

        expect(providers).toContain("deepseek");
        // 空格 / 非法字符 provider 应被 manifest regex 拒绝（manifest_schema 结构校验）
        expect(providers).not.toContain("acme Corp");
    });
});
