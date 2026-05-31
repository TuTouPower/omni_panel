process.stdout.write(
    JSON.stringify({
        success: true,
        schemaVersion: 2,
        updatedAt: "2026-05-24T12:00:00Z",
        items: [
            {
                id: "test",
                provider: "claude",
                source: "local",
                sourceInstanceId: "test-source",
                accountId: "test-account",
                accountLabel: "Test",
                name: "Test",
                used: 50,
                limit: 100,
                displayStyle: "percent",
                status: "normal",
            },
        ],
    }),
);
