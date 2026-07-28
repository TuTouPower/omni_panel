import type { AppConfiguration } from "../../../shared/types/config";
import type { ConnectorDefinition } from "../connector/manifest-loader";
import { OAUTH_EXPIRES_AT_KEY, OAUTH_REFRESH_TOKEN_KEY } from "../auth/oauth_helpers";

export function build_secret_param_keys(
    config: AppConfiguration,
    definitions: readonly ConnectorDefinition[],
): Map<string, ReadonlySet<string>> {
    const keys_by_instance = new Map<string, ReadonlySet<string>>();

    for (const plugin of config.plugins) {
        const definition = definitions.find(
            (candidate) => candidate.executablePath === plugin.executablePath,
        );
        const keys = new Set(
            definition?.manifest.parameters
                .filter((parameter) => parameter.type === "secret")
                .map((parameter) => parameter.name) ?? [],
        );
        const auth = definition?.manifest.auth;
        if (auth?.method === "oauth_device") {
            keys.add(auth.secret_name);
            keys.add(OAUTH_REFRESH_TOKEN_KEY);
            keys.add(OAUTH_EXPIRES_AT_KEY);
        }
        keys_by_instance.set(plugin.instanceId, keys);
    }

    return keys_by_instance;
}
