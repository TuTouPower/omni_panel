process.stdout.write(
    JSON.stringify({
        success: true,
        schemaVersion: 1,
        updatedAt: "2026-05-25T00:00:00Z",
        items: [
            {
                id: "test-zh",
                name: "中文测试：5小时用量",
                used: 42.5,
                limit: 100,
                displayStyle: "percent",
                status: "normal",
                color: "blue",
            },
        ],
    }),
);
