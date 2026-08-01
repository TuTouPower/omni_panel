import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { create_grok_oauth_manager } from "../../../src/main/core/auth/grok_oauth_manager";
import {
    OAUTH_EXPIRES_AT_KEY,
    OAUTH_REFRESH_TOKEN_KEY,
    OAUTH_TOKEN_KEY,
} from "../../../src/main/core/auth/oauth_helpers";
import { createConfigStore } from "../../../src/main/core/config/config-store";
import { createSecretsStore, keyFor } from "../../../src/main/core/config/secrets-store";
import { build_secret_param_keys } from "../../../src/main/core/config/secret_param_keys";
import type { AppConfiguration } from "../../../src/main/core/config/types";
import type { ConnectorDefinition } from "../../../src/main/core/connector/manifest-loader";
import type { ObservationStore } from "../../../src/main/core/observation/observation-store";
import { createRuntimeStore } from "../../../src/main/core/scheduler/runtime-store";
import { createRefreshService } from "../../../src/main/core/scheduler/refresh-service";
import { create_file_vault_backend } from "../../../src/main/core/vault/file-vault-backend";
import {
    handleConfigCreateInstance,
    handleConfigSave,
    handleConfigSaveSecrets,
} from "../../../src/main/ipc/config-ipc";
import type { Observation } from "../../../src/shared/types/observation";
import { manifest_schema } from "../../../src/shared/schemas/manifest";

const billing_response = {
    config: {
        currentPeriod: {
            type: "USAGE_PERIOD_TYPE_WEEKLY",
            start: "2026-07-13T23:10:25.819831+00:00",
            end: "2026-07-20T23:10:25.819831+00:00",
        },
        creditUsagePercent: 19,
        productUsage: [],
    },
};

function create_observation_store(): ObservationStore & { inserted: Observation[] } {
    const inserted: Observation[] = [];
    return {
        inserted,
        insert(observation: Observation) {
            inserted.push(observation);
        },
        get_latest: vi.fn(() => null as Observation | null),
        list_latest_by_provider: vi.fn(() => [] as Observation[]),
        list_all_providers: vi.fn(() => [] as string[]),
        list_by_source_instance_id: vi.fn(() => [] as Observation[]),
        query_trend_series: vi.fn(() => [] as (Observation | null)[]),
        prune: vi.fn(() => 0),
        count_observations: vi.fn(() => 0),
        close: vi.fn(),
    };
}

function listen(server: ReturnType<typeof createServer>): Promise<number> {
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            resolve((server.address() as AddressInfo).port);
        });
    });
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

describe("Grok OAuth account lifecycle", () => {
    let temp_dir: string | undefined;
    let server: ReturnType<typeof createServer> | undefined;

    afterEach(async () => {
        if (server) {
            await close(server);
            server = undefined;
        }
        if (temp_dir) {
            await rm(temp_dir, { recursive: true, force: true });
            temp_dir = undefined;
        }
    });

    it("persists formal OAuth credentials, clears temporary credentials, schedules it, and refreshes with bearer auth", async () => {
        temp_dir = await mkdtemp(join(tmpdir(), "grok-oauth-lifecycle-"));
        const config_store = createConfigStore(join(temp_dir, "config.json"));
        await config_store.save({
            schemaVersion: 1,
            language: "zh-Hans",
            plugins: [],
            launchAtLogin: false,
            removedConnectorIds: ["grok"],
        });
        const vault = await create_file_vault_backend(temp_dir);
        const secrets_store = createSecretsStore(vault);
        let authorization: string | undefined;
        server = createServer((request: IncomingMessage, response) => {
            authorization = request.headers.authorization;
            response.writeHead(200, { "Content-Type": "application/json" });
            response.end(JSON.stringify(billing_response));
        });
        const server_port = await listen(server);
        const connector_dir = join(process.cwd(), "connectors", "grok");
        const parsed_manifest = manifest_schema.parse(
            JSON.parse(await readFile(join(connector_dir, "manifest.json"), "utf8")) as unknown,
        );
        const manifest = manifest_schema.parse({
            ...parsed_manifest,
            endpoints: { grok_billing: `http://127.0.0.1:${String(server_port)}` },
        });
        const definition: ConnectorDefinition = {
            directory: connector_dir,
            executablePath: connector_dir,
            manifest,
        };
        const secret_param_keys = new Map<string, ReadonlySet<string>>();
        const scheduler_spy = vi.fn<(instance_id: string) => void>();
        const on_config_saved = vi.fn((config: AppConfiguration) => {
            const updated_keys = build_secret_param_keys(config, [definition]);
            secret_param_keys.clear();
            for (const [instance_id, keys] of updated_keys) {
                secret_param_keys.set(instance_id, keys);
            }
            for (const plugin of config.plugins) {
                if (plugin.enabled) scheduler_spy(plugin.instanceId);
            }
        });
        const deps = {
            configStore: config_store,
            secretsStore: secrets_store,
            secretParamKeys: secret_param_keys,
            onConfigSaved: on_config_saved,
            definitions: [definition],
        };

        const created = await handleConfigCreateInstance(deps, "grok");
        expect(created.ok).toBe(true);
        if (!created.ok) return;
        const formal_instance_id = created.data.instanceId;
        expect(scheduler_spy).toHaveBeenCalledWith(formal_instance_id);

        const temporary_instance_id = "grok-oauth-temporary";
        await vault.set(keyFor(temporary_instance_id, OAUTH_TOKEN_KEY), "temporary-access-token");
        await vault.set(
            keyFor(temporary_instance_id, OAUTH_REFRESH_TOKEN_KEY),
            "temporary-refresh-token",
        );
        await vault.set(keyFor(temporary_instance_id, OAUTH_EXPIRES_AT_KEY), "1780000000000");

        const saved_secrets = await handleConfigSaveSecrets(deps, {
            instanceId: formal_instance_id,
            secrets: {
                [OAUTH_TOKEN_KEY]: "formal-access-token",
                [OAUTH_REFRESH_TOKEN_KEY]: "formal-refresh-token",
                [OAUTH_EXPIRES_AT_KEY]: "1780000000000",
                NOT_WHITELISTED: "must-not-persist",
            },
        });
        expect(saved_secrets.ok).toBe(true);
        await expect(vault.get(keyFor(formal_instance_id, OAUTH_TOKEN_KEY))).resolves.toBe(
            "formal-access-token",
        );
        await expect(vault.get(keyFor(formal_instance_id, OAUTH_REFRESH_TOKEN_KEY))).resolves.toBe(
            "formal-refresh-token",
        );
        await expect(vault.get(keyFor(formal_instance_id, OAUTH_EXPIRES_AT_KEY))).resolves.toBe(
            "1780000000000",
        );
        await expect(vault.get(keyFor(formal_instance_id, "NOT_WHITELISTED"))).resolves.toBeNull();

        await create_grok_oauth_manager({ vault }).logout(temporary_instance_id);
        await expect(vault.list_keys(`${temporary_instance_id}:`)).resolves.toEqual([]);

        const updated_config = await config_store.load();
        const formal_plugin = updated_config.plugins.find(
            (plugin) => plugin.instanceId === formal_instance_id,
        );
        if (!formal_plugin) throw new Error("formal Grok instance was not created");
        const config_for_save = {
            ...updated_config,
            plugins: updated_config.plugins.map((plugin) =>
                plugin.instanceId === formal_instance_id
                    ? { ...plugin, refreshIntervalSeconds: 300 }
                    : plugin,
            ),
        };
        const saved_config = await handleConfigSave(deps, config_for_save);
        expect(saved_config.ok).toBe(true);
        expect(on_config_saved).toHaveBeenCalledTimes(2);
        expect(scheduler_spy).toHaveBeenLastCalledWith(formal_instance_id);

        const observation_store = create_observation_store();
        const refresh_service = createRefreshService({
            definitions: [definition],
            observationStore: observation_store,
            runtimeStore: createRuntimeStore(),
            configStore: config_store,
            vault,
        });
        await refresh_service.refresh(formal_instance_id, { force: true });

        expect(authorization).toBe("Bearer formal-access-token");
        expect(observation_store.inserted).toHaveLength(1);
    });
});
