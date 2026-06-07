import { join } from "node:path";
import { compilePlugin } from "../src/main/core/plugin/compiler";
import { discoverPlugins } from "../src/main/core/plugin/discovery";

interface AfterPackContext {
    appOutDir: string;
    electronPlatformName: string;
}

function get_resources_dir(context: AfterPackContext): string {
    if (context.electronPlatformName === "darwin") {
        return join(context.appOutDir, "Contents", "Resources");
    }
    return join(context.appOutDir, "resources");
}

export default async function precompile_bundled_plugins(context: AfterPackContext): Promise<void> {
    const resources_dir = get_resources_dir(context);
    const plugins_dir = join(resources_dir, "plugins");
    const sdk_dir = join(resources_dir, "sdk");
    const cache_dir = join(resources_dir, "plugin-cache");
    const plugins = await discoverPlugins(plugins_dir, "bundled");

    let compiled_count = 0;
    for (const plugin of plugins) {
        const result = await compilePlugin(plugin, cache_dir, sdk_dir);
        if (result.status === "compile_error") {
            throw new Error(`Failed to precompile ${plugin.scriptName}: ${result.error}`);
        }
        compiled_count++;
    }

    console.log(
        `[precompile-bundled-plugins] compiled ${String(compiled_count)} plugins to ${cache_dir}`,
    );
}
