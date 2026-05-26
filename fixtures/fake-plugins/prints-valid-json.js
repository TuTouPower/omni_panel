process.stdout.write(
    JSON.stringify({
        success: true,
        schemaVersion: 1,
        updatedAt: "2026-05-24T12:00:00Z",
        items: [
            {
                id: "test",
                name: "Test",
                used: 50,
                limit: 100,
                displayStyle: "percent",
                status: "normal",
            },
        ],
    }),
);
