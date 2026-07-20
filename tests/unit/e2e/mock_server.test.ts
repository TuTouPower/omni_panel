/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- mock stub 与 .mjs import 合理 any */
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
// @ts-expect-error - .mjs fixture，无类型声明
import { create_mock_handler } from "../../../tests/e2e/fixtures/mock_server.mjs";

/**
 * mock_server 自保护单测（T021）。
 * create_mock_handler 喂 fake responses，用 stub res 捕获 statusCode/end body，
 * 覆盖 T010/T018 的关键回归点（trend 双 ?、state 精确 id、secrets 精确 instanceId、POST 占位）。
 */
function fake_responses() {
    return {
        "GET /v1/connectors": [{ instanceId: "A", name: "Alpha" }],
        "GET /v1/connectors/A/state": { instanceId: "A", status: "ready", items: [] },
        "GET /v1/connectors/B/state": { instanceId: "B", status: "failed", items: [] },
        "GET /v1/secrets?instanceId=A": { cpa_mgmt_key: "***" },
        "GET /v1/secrets?instanceId=B": { api_key: "***" },
        "GET /v1/trend?provider=claude&accountId=acc1&metricId=primary": [
            { date: "x", percent: 50 },
            null,
        ],
    };
}

function stub_res() {
    const state = { statusCode: 0, headers: {} as Record<string, string>, body: "" };
    return {
        state,
        res: {
            set statusCode(n: number) {
                state.statusCode = n;
            },
            get statusCode() {
                return state.statusCode;
            },
            setHeader(k: string, v: string) {
                state.headers[k] = v;
            },
            end(chunk: string) {
                state.body = chunk;
            },
        } as unknown as ServerResponse,
    };
}

function call(
    handler: (req: IncomingMessage, res: ServerResponse) => void,
    method: string,
    url: string,
) {
    const { state, res } = stub_res();
    const req = {
        method,
        url,
    } as unknown as IncomingMessage;
    handler(req, res);
    return { status: state.statusCode, body: state.body };
}

describe("create_mock_handler", () => {
    const handler = create_mock_handler(fake_responses());

    it("GET /v1/health returns ok", () => {
        const r = call(handler, "GET", "/v1/health");
        expect(r.status).toBe(200);
        expect(JSON.parse(r.body)).toEqual({ ok: true });
    });

    it("GET /v1/connectors returns array (precise key)", () => {
        const r = call(handler, "GET", "/v1/connectors");
        expect(r.status).toBe(200);
        const parsed = JSON.parse(r.body);
        expect(Array.isArray(parsed)).toBe(true);
        expect((parsed as { instanceId: string }[])[0]?.instanceId).toBe("A");
    });

    it("GET /v1/connectors/:id/state returns precise id (not fallback first)", () => {
        const a = call(handler, "GET", "/v1/connectors/A/state");
        expect(JSON.parse(a.body)).toMatchObject({ instanceId: "A", status: "ready" });
        const b = call(handler, "GET", "/v1/connectors/B/state");
        expect(JSON.parse(b.body)).toMatchObject({ instanceId: "B", status: "failed" });
    });

    it("GET /v1/connectors/:id/state unknown id falls back empty_ipc (no cross-id leak)", () => {
        const r = call(handler, "GET", "/v1/connectors/UNKNOWN/state");
        expect(JSON.parse(r.body)).toEqual({ ok: true, data: {} });
    });

    it("GET /v1/secrets?instanceId=X returns precise instanceId (regression: query key)", () => {
        const a = call(handler, "GET", "/v1/secrets?instanceId=A");
        expect(JSON.parse(a.body)).toEqual({ cpa_mgmt_key: "***" });
        const b = call(handler, "GET", "/v1/secrets?instanceId=B");
        expect(JSON.parse(b.body)).toEqual({ api_key: "***" });
    });

    it("GET /v1/trend?... returns precise query (regression: url.search 双 ? miss, days hardcoded)", () => {
        const r = call(handler, "GET", "/v1/trend?provider=claude&accountId=acc1&metricId=primary");
        expect(r.status).toBe(200);
        const parsed = JSON.parse(r.body) as unknown[];
        expect(parsed.length).toBe(2);
    });

    it("GET /v1/trend unknown query returns [] (no fallback first)", () => {
        const r = call(handler, "GET", "/v1/trend?provider=X&accountId=Y&metricId=Z");
        expect(JSON.parse(r.body)).toEqual([]);
    });

    it("POST any path returns empty_ipc ok", () => {
        const r = call(handler, "POST", "/v1/connectors/A/refresh");
        expect(JSON.parse(r.body)).toEqual({ ok: true, data: {} });
    });

    it("unmatched DELETE returns 404", () => {
        const r = call(handler, "DELETE", "/v1/unknown");
        expect(r.status).toBe(404);
    });
});
