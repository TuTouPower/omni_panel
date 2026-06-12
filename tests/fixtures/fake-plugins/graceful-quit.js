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
setTimeout(() => {}, 60000);
