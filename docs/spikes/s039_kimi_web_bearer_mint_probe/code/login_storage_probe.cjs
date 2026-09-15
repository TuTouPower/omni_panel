/**
 * s039 探针六：Electron 受控登录窗能否读取页面 localStorage 中的 refresh_token。
 *
 * 背景：应用现有登录窗只通过 webRequest 捕获请求头 Bearer；refresh token 只在页面
 * localStorage（kimi SPA 写 `refresh_token`）。本探针用与 `src/main/index.ts` 相同的
 * webPreferences（contextIsolation: true / nodeIntegration: false / sandbox: true）起窗，
 * 加载一个模拟 SPA 行为的本地页面，验证主进程 `webContents.executeJavaScript` 能读到该键。
 *
 * 用 CommonJS：Electron 42 以 `.mjs` 为入口时脚本会挂住（本探针实测），`.cjs` 正常。
 *
 * 运行：node_modules/.bin/electron docs/spikes/s039_kimi_web_bearer_mint_probe/code/login_storage_probe.cjs
 */
const { app, BrowserWindow, session } = require("electron");
const { createServer } = require("node:http");

const PAGE = `<!doctype html><html><body><script>
    // 模拟 kimi SPA：登录成功后把令牌写进 localStorage
    localStorage.setItem("access_token", "fake-access-token");
    localStorage.setItem("refresh_token", "fake-refresh-token");
    localStorage.setItem("msh_user_id", "fake-user");
</script></body></html>`;

app.whenReady().then(async () => {
    const server = createServer((_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(PAGE);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();

    const partition = "persist:session-login:spike-probe";
    const win = new BrowserWindow({
        width: 400,
        height: 300,
        show: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            partition,
        },
    });
    await win.loadURL(`http://127.0.0.1:${String(port)}/`);
    const value = await win.webContents.executeJavaScript("localStorage.getItem('refresh_token')");
    const keys = await win.webContents.executeJavaScript("Object.keys(localStorage)");
    const cookies = await session.fromPartition(partition).cookies.get({});

    console.log(
        JSON.stringify(
            {
                execute_javascript_allowed: value === "fake-refresh-token",
                read_value: value,
                storage_keys: keys,
                cookie_count: cookies.length,
                web_preferences: {
                    contextIsolation: true,
                    nodeIntegration: false,
                    sandbox: true,
                },
            },
            null,
            2,
        ),
    );
    win.destroy();
    server.close();
    app.exit(0);
});
