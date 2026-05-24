module.exports = {
    forbidden: [
        {
            name: "no-circular",
            severity: "error",
            from: {},
            to: { circular: true },
        },
        {
            name: "no-main-from-renderer",
            severity: "error",
            from: { path: "src/renderer" },
            to: { path: "src/main" },
        },
        {
            name: "no-node-from-renderer",
            severity: "error",
            from: { path: "src/renderer" },
            to: { path: "^node:" },
        },
        {
            name: "no-core-from-shared",
            severity: "error",
            from: { path: "src/shared" },
            to: { path: "src/main" },
        },
    ],
    options: {
        doNotFollow: {
            path: "node_modules",
        },
    },
};
