process.on("SIGTERM", () => {
    void process.pid;
});

const end = Date.now() + 60000;
while (Date.now() < end) {}
