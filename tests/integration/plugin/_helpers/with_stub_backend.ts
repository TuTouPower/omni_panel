import { withHttpStub, type HttpStubRoute } from "./http_stub";
import { runBundledPlugin, type PluginRunOptions } from "./plugin_test_harness";

export interface StubBackendOptions extends Omit<PluginRunOptions, "env"> {
    readonly endpointKey?: string;
    readonly routes: HttpStubRoute[];
    readonly env?: Record<string, string>;
}

export async function runWithStubBackend(opts: StubBackendOptions) {
    return withHttpStub(opts.routes, async (handle) => {
        const env = {
            OMNI_PLUGIN_ENDPOINTS: JSON.stringify({
                [opts.endpointKey ?? "default"]: handle.baseUrl,
            }),
        };
        const result = await runBundledPlugin({
            pluginFile: opts.pluginFile,
            params: opts.params,
            env: { ...env, ...(opts.env ?? {}) },
            ...(opts.timeoutMs === undefined ? {} : { timeoutMs: opts.timeoutMs }),
            ...(opts.language === undefined ? {} : { language: opts.language }),
        });
        return { ...result, baseUrl: handle.baseUrl, requests: handle.requests };
    });
}
