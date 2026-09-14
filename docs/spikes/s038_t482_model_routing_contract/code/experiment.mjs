import assert from "node:assert/strict";
import http from "node:http";

const pages = new Map([
    [1, { data: { items: [{ id: "alpha", status: "enabled", group: "default" }] } }],
    [2, { data: { items: [{ id: "beta", status: "disabled", group: "experimental" }] } }],
    [3, { data: { items: [] } }],
]);

const receivedPuts = [];
const server = http.createServer((request, response) => {
    if (request.method === "GET" && request.url?.startsWith("/api/channel/")) {
        const page = Number(new URL(request.url, "http://127.0.0.1").searchParams.get("p"));
        const body = JSON.stringify(pages.get(page) ?? { data: { items: [] } });
        response.writeHead(200, { "content-type": "application/json" });
        response.end(body);
        return;
    }

    if (request.method === "PUT" && request.url === "/api/channel/alpha") {
        let body = "";
        request.on("data", (chunk) => {
            body += chunk;
        });
        request.on("end", () => {
            receivedPuts.push(JSON.parse(body));
            response.writeHead(200, { "content-type": "application/json" });
            response.end(JSON.stringify({ success: true }));
        });
        return;
    }

    response.writeHead(404).end();
});

const listen = () =>
    new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve(server.address().port));
    });

const getJson = async (url) => (await fetch(url)).json();
const readAllPages = async (baseUrl) => {
    const result = [];
    for (let page = 1; ; page += 1) {
        const payload = await getJson(`${baseUrl}/api/channel/?p=${String(page)}`);
        const items = payload?.data?.items;
        assert.ok(Array.isArray(items), "channel response must expose data.items");
        if (items.length === 0) return result;
        result.push(...items);
    }
};

const extractModelName = (payload) => {
    const candidates = [
        payload?.model,
        payload?.id,
        payload?.choices?.[0]?.model,
        payload?.choices?.[0]?.message?.model,
        payload?.choices?.[0]?.message?.reasoning_content?.model,
    ];
    return candidates.find((value) => typeof value === "string" && value.length > 0) ?? null;
};

const port = await listen();
try {
    const baseUrl = `http://127.0.0.1:${String(port)}`;
    const channels = await readAllPages(baseUrl);
    assert.deepEqual(
        channels.map((item) => item.id),
        ["alpha", "beta"],
    );
    assert.equal(channels[0].status, "enabled");
    assert.equal(channels[0].group, "default");

    const putResponse = await fetch(`${baseUrl}/api/channel/alpha`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            models: ["default_model"],
            model_mapping: { default_model: "alpha" },
        }),
    });
    assert.equal(putResponse.status, 200);
    assert.deepEqual(receivedPuts, [
        { models: ["default_model"], model_mapping: { default_model: "alpha" } },
    ]);
    assert.equal(
        "status" in receivedPuts[0],
        false,
        "status is read-only and must not be sent on PUT",
    );

    assert.equal(extractModelName({ model: "reasoning-model" }), "reasoning-model");
    assert.equal(
        extractModelName({
            choices: [{ message: { reasoning_content: { model: "reasoning-model-2" } } }],
        }),
        "reasoning-model-2",
    );

    console.log(
        "PASS: paginated data.items, status/group read fields, status-free PUT, and reasoning model extraction",
    );
} finally {
    await new Promise((resolve) => server.close(resolve));
}
