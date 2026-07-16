import { describe, expect, it } from "vitest";

describe("net-client global Agent", () => {
    it("exports MAX_CONNECTIONS_PER_ORIGIN from constants", async () => {
        const constants = await import("../../../src/shared/constants");
        expect(constants.MAX_CONNECTIONS_PER_ORIGIN).toBe(6);
    });

    it("exports init_global_network from net-client", async () => {
        const net = await import("../../../src/main/core/connector/net-client");
        expect(typeof net.init_global_network).toBe("function");
    });
});
