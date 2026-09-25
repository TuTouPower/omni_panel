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
            name: "no-web-from-renderer",
            severity: "error",
            from: { path: "src/renderer" },
            to: { path: "src/web" },
        },
        {
            name: "no-preload-from-renderer",
            severity: "error",
            from: { path: "src/renderer" },
            to: { path: "src/preload" },
        },
        {
            name: "no-node-from-renderer",
            severity: "error",
            from: { path: "src/renderer" },
            to: { path: "^node:" },
        },
        {
            name: "no-renderer-from-main",
            severity: "error",
            from: { path: "src/main" },
            to: { path: "src/renderer" },
        },
        {
            name: "no-core-from-shared",
            severity: "error",
            from: { path: "src/shared" },
            to: { path: "src/main" },
        },
        {
            name: "no-renderer-from-shared",
            severity: "error",
            from: { path: "src/shared" },
            to: { path: "src/renderer" },
        },
        {
            name: "no-preload-from-shared",
            severity: "error",
            from: { path: "src/shared" },
            to: { path: "src/preload" },
        },
    ],
    options: {
        doNotFollow: {
            path: "node_modules",
        },
    },
};
