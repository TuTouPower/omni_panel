// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { create_web_usageboard } from "../../../src/web/usageboard-web";

function mock_response(body: unknown): Response {
    return { ok: true, json: () => Promise.resolve(body) } as Response;
}

describe("web usageboard bridge", () => {
    beforeEach(() => vi.unstubAllGlobals());

    it("tokenStats.getRecords fetches /v1/records", async () => {
        const fetch_mock = vi.fn<typeof fetch>().mockResolvedValue(mock_response([]));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        const records = await api.tokenStats.getRecords({});
        expect(records).toEqual([]);
        expect(fetch_mock).toHaveBeenCalledWith(expect.stringContaining("/v1/records"));
    });

    it("config.get fetches /v1/config", async () => {
        const fetch_mock = vi
            .fn<typeof fetch>()
            .mockResolvedValue(mock_response({ config: { language: "zh-Hans" }, hasSecrets: {} }));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        const result = await api.config.get();
        expect(result.config.language).toBe("zh-Hans");
        expect(fetch_mock).toHaveBeenCalledWith(expect.stringContaining("/v1/config"));
    });

    it("config.save posts to /v1/config", async () => {
        const fetch_mock = vi.fn<typeof fetch>().mockResolvedValue(mock_response(undefined));
        vi.stubGlobal("fetch", fetch_mock);

        const api = create_web_usageboard();
        await api.config.save({ language: "en" } as never);
        expect(fetch_mock).toHaveBeenCalledWith(
            expect.stringContaining("/v1/config"),
            expect.objectContaining({ method: "POST" }),
        );
    });

    it("native surfaces are no-ops", () => {
        const api = create_web_usageboard();
        expect(() => {
            api.settings.close();
        }).not.toThrow();
        expect(() => {
            api.tray.open_panel();
        }).not.toThrow();
        expect(() => {
            api.theme.set("dark");
        }).not.toThrow();
    });
});
