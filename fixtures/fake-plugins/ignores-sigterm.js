process.on("SIGTERM", () => {});

const end = Date.now() + 60000;
while (Date.now() < end) {}
