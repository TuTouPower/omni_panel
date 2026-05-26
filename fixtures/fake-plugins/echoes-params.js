const params = {};
for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === "--usageboard-param" && i + 1 < process.argv.length) {
        const kv = process.argv[++i];
        const eqIdx = kv.indexOf("=");
        if (eqIdx > 0) {
            params[kv.slice(0, eqIdx)] = kv.slice(eqIdx + 1);
        }
    }
}
process.stdout.write(JSON.stringify({ echoed: params }));
