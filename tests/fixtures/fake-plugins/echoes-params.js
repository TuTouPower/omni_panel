/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/restrict-plus-operands */
const params = {};

function parseParams(raw) {
    if (!raw.trim()) {
        return;
    }
    const payload = JSON.parse(raw);
    if (payload.params && typeof payload.params === "object") {
        Object.assign(params, payload.params);
    }
}

function parseArgv() {
    for (let i = 2; i < process.argv.length; i++) {
        if (process.argv[i] === "--usageboard-param" && i + 1 < process.argv.length) {
            const kv = process.argv[++i];
            const eqIdx = kv.indexOf("=");
            if (eqIdx > 0) {
                params[kv.slice(0, eqIdx)] = kv.slice(eqIdx + 1);
            }
        }
    }
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
    raw += chunk;
});
process.stdin.on("end", () => {
    try {
        parseParams(raw);
    } catch {
        parseArgv();
    }
    parseArgv();
    process.stdout.write(JSON.stringify({ echoed: params }));
});
