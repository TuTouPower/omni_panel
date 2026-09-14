import { describe, expect, it } from "vitest";
import type { ConnectorDefinition } from "../../../../../src/main/core/connector/manifest-loader";
import {
    extract_manifest_id_from_path,
    migrate_connector_plugins,
    remap_connector_paths,
} from "../../../../../src/main/core/config/manifest-identity";
import type { ConnectorConfiguration } from "../../../../../src/shared/types/config";

function definition(id: string, executablePath = `/connectors/${id}`): ConnectorDefinition {
    return {
        directory: executablePath,
        executablePath,
        manifest: {
            id,
            provider: id,
            capabilities: ["poll"],
            parameters: [],
            poll: {
                request: { endpoint: "default", path: "/usage", method: "GET" },
                map: {},
            },
        },
    };
}

describe("manifest identity migration", () => {
    it("extracts tails from platform, UNC, mixed, and trailing-separator paths", () => {
        expect(extract_manifest_id_from_path("C:\\Users\\x\\connectors\\cpa")).toBe("cpa");
        expect(extract_manifest_id_from_path("/home/u/connectors/cpa/")).toBe("cpa");
        expect(extract_manifest_id_from_path("\\\\server\\share/mixed\\cpa\\")).toBe("cpa");
        expect(extract_manifest_id_from_path("C:\\")).toBeNull();
        expect(extract_manifest_id_from_path("   ")).toBeNull();
    });

    it("backfills manifestId, refreshes the local path, and preserves each instance", () => {
        const legacy = [
            {
                instanceId: "cpa-primary",
                stateId: "state-primary",
                name: "CPA",
                enabled: true,
                executablePath: "C:\\Users\\x\\connectors\\cpa",
                refreshIntervalSeconds: 120,
                parameterValues: { MODEL: "primary" },
                endpointOverrides: { default: "https://primary.example" },
            },
            {
                instanceId: "cpa-secondary",
                stateId: "state-secondary",
                name: "CPA second",
                enabled: false,
                executablePath: "/home/u/connectors/cpa/",
                refreshIntervalSeconds: 900,
                parameterValues: { MODEL: "secondary" },
                endpointOverrides: { default: "https://secondary.example" },
            },
        ];

        const result = migrate_connector_plugins(legacy, [definition("cpa", "/local/cpa")]);

        expect(result.dropped).toEqual([]);
        expect(result.changed).toBe(true);
        expect(result.plugins).toEqual([
            { ...legacy[0], manifestId: "cpa", executablePath: "/local/cpa" },
            { ...legacy[1], manifestId: "cpa", executablePath: "/local/cpa" },
        ]);
    });

    it("repairs a stale manifestId from a matching legacy path tail", () => {
        const result = migrate_connector_plugins(
            [
                {
                    instanceId: "cpa-1",
                    stateId: "cpa-1",
                    manifestId: "old-cpa-id",
                    name: "CPA",
                    enabled: true,
                    executablePath: "/old/connectors/cpa",
                    refreshIntervalSeconds: 300,
                    parameterValues: {},
                    endpointOverrides: {},
                },
            ],
            [definition("cpa", "/local/cpa")],
        );

        expect(result.dropped).toEqual([]);
        expect(result.plugins[0]).toMatchObject({
            manifestId: "cpa",
            executablePath: "/local/cpa",
        });
    });

    it("remaps imported paths from manifest ids to local definitions", () => {
        const plugin: ConnectorConfiguration = {
            instanceId: "cpa-1",
            stateId: "cpa-1",
            manifestId: "cpa",
            name: "CPA",
            enabled: true,
            executablePath: "/linux/connectors/cpa",
            refreshIntervalSeconds: 300,
            parameterValues: {},
            endpointOverrides: {},
        };

        expect(remap_connector_paths([plugin], [definition("cpa", "/mac/connectors/cpa")])).toEqual(
            [{ ...plugin, executablePath: "/mac/connectors/cpa" }],
        );
    });

    it("reports unknown manifest and no-tail entries for cleanup", () => {
        const result = migrate_connector_plugins(
            [
                {
                    instanceId: "unknown-manifest",
                    stateId: "unknown-manifest",
                    manifestId: "removed",
                    name: "Removed",
                    enabled: true,
                    executablePath: "/old/connectors/not-a-definition",
                    refreshIntervalSeconds: 300,
                    parameterValues: {},
                    endpointOverrides: {},
                },
                {
                    instanceId: "unknown-tail",
                    stateId: "unknown-tail",
                    name: "Unknown",
                    enabled: true,
                    executablePath: "/old/connectors/not-a-definition/",
                    refreshIntervalSeconds: 300,
                    parameterValues: {},
                    endpointOverrides: {},
                },
            ],
            [definition("cpa")],
        );

        expect(result.plugins).toEqual([]);
        expect(result.dropped).toEqual([
            {
                instanceId: "unknown-manifest",
                manifestId: "removed",
                executablePath: "/old/connectors/not-a-definition",
                reason: "unknown-manifest",
            },
            {
                instanceId: "unknown-tail",
                executablePath: "/old/connectors/not-a-definition/",
                reason: "no-tail-match",
            },
        ]);
    });
});
