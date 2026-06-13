/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-call -- CommonJS fixture executed directly by Node. */
// Listens on fd 3 for quit and exits cleanly
const fs = require("fs");
try {
    const quitStream = fs.createReadStream(3, { encoding: "utf8" });
    quitStream.on("data", (chunk) => {
        if (chunk.trim() === "quit") {
            process.exit(0);
        }
    });
} catch {
    // fd 3 not available
}
// Keep running until quit or force kill
setTimeout(() => {
    process.exit(0);
}, 60000);
