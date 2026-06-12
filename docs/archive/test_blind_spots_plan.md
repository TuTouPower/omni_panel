# 测试盲区修复计划

> 2026-06-12 制定。基于项目审查结论，选定 4 个方向的实施方案。

---

## 总则

凡是生产环境语义和测试环境语义不同的地方，不继续 mock，用更接近真实路径的测试。凡是平台语义不一致的地方，不靠平台行为，改成应用层协议。

---

## 一、Windows 信号：stdin quit 协议

### 目标

插件子进程终止在所有平台行为一致：先通知，再强杀。Windows 不再依赖不存在的 Unix 信号语义。

### 现状

```
[当前] Linux: SIGTERM → 等 2s → SIGKILL
        Windows: TerminateProcess（立即杀死，无两阶段语义）
```

### 改后

```
[改后] 所有平台: stdin "quit" → 等 2s → kill()
```

### 实施步骤

**第 1 步：插件 SDK 添加 quit 监听**

文件：`src/plugins/sdk/define-plugin.ts`

在 `definePlugin` 函数中，当 stdin 收到 `"quit\n"` 时触发优雅退出：

```typescript
// definePlugin() 内部，handler 执行完成后
process.stdin.on("data", (chunk) => {
    if (chunk.toString().trim() === "quit") {
        // 给 handler 的 pending 请求 1 秒清理时间
        setTimeout(() => process.exit(0), 1000);
    }
});
```

注意：stdin 监听必须在 `process.stdin.isTTY === false` 时才启用（子进程模式）。TTY 模式下 stdin 用于交互，不应监听。

**第 2 步：runner 改用 stdin quit**

文件：`src/main/core/plugin/runner.ts`

```typescript
// 替换现有的 SIGTERM/SIGKILL 逻辑
function scheduleGracefulKill(child: ChildProcess, settled: { value: boolean }) {
    // 所有平台统一：通过 stdin 发送 quit 命令
    try {
        child.stdin?.write("quit\n");
    } catch {
        // stdin 可能已关闭，直接强杀
        child.kill();
        return;
    }

    // 2 秒后如果还没退出，强杀
    const graceTimer = setTimeout(() => {
        if (!settled.value) {
            child.kill();
        }
    }, GRACE_MS);

    return graceTimer;
}
```

**第 3 步：编写测试**

文件：`tests/integration/plugin/runner.test.ts`

新增测试：

- 插件收到 stdin quit 后自行退出（exit code 0）
- 超时后 runner 先发 quit 再 kill
- stdin 已关闭时直接 kill（不崩溃）

修改现有测试：

- `kills SIGTERM-ignoring process with SIGKILL` → 改为 `kills quit-ignoring process`
- fixture `ignores-sigterm.js` → 改为 `ignores-quit.js`（捕获 stdin quit 但不退出）

新增 fixture：

- `tests/fixtures/fake-plugins/graceful-quit.js` — 收到 quit 后正常退出
- `tests/fixtures/fake-plugins/ignores-quit.js` — 捕获 quit 但不退出，用于测试 kill 升级

**第 4 步：更新文档**

- `docs/test_blind_spots_remaining.md` 标记第 1 项完成
- `src/plugins/sdk/README` 或代码注释说明 stdin quit 协议

### 影响范围

| 文件                                             | 改动                     |
| ------------------------------------------------ | ------------------------ |
| `src/plugins/sdk/define-plugin.ts`               | 添加 stdin quit 监听     |
| `src/main/core/plugin/runner.ts`                 | 改用 stdin quit 替代信号 |
| `tests/integration/plugin/runner.test.ts`        | 新增/修改测试            |
| `tests/fixtures/fake-plugins/graceful-quit.js`   | 新增 fixture             |
| `tests/fixtures/fake-plugins/ignores-quit.js`    | 新增 fixture             |
| `tests/fixtures/fake-plugins/ignores-sigterm.js` | 删除或重命名             |

### 验证方式

```bash
# 单元 + 集成测试
pnpm vitest run tests/integration/plugin/runner.test.ts

# 全量测试
pnpm test

# 打包验证（Windows）
pnpm package
# 触发插件超时，观察日志确认 stdin quit 路径
```

### 风险与回退

- **风险**：stdin 可能在某些边缘情况下不可写（进程已 stdin EOF）。runner 代码需处理 `stdin.write` 抛异常的情况。
- **回退**：保留原有 `child.kill()` 作为 stdin 失败时的 fallback，不完全删除信号逻辑。

### 预估工时：2-3 天

---

## 二、ASAR 执行路径：打包后集成测试

### 目标

插件编译和执行路径在打包后的真实 Electron 环境中被测试覆盖。

### 现状

集成测试走开发路径，绕过了 ASAR 相关的所有逻辑：

- `configure_esbuild_binary_path` 的 ASAR→unpacked 替换
- `process.resourcesPath` 的存在性
- `ELECTRON_RUN_AS_NODE=1` 的设置
- `app.asar` 内文件的只读约束

### 实施步骤

**第 1 步：创建打包后测试基础设施**

文件：`tests/packaged_smoke/helpers.ts`

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

const APP_DIR = join(__dirname, "../../artifacts/win-unpacked");
const APP_PATH = join(APP_DIR, process.platform === "win32" ? "OmniUsage.exe" : "OmniUsage");

export async function runPluginInPackagedApp(
    pluginName: string,
    params: Record<string, string>,
    timeoutMs = 30000,
): Promise<{ stdout: string; exitCode: number }> {
    const input = JSON.stringify({ params });
    const { stdout, exitCode } = await execFileAsync(APP_PATH, ["--run-plugin", pluginName], {
        env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: "1",
            NODE_ENV: "production",
        },
        timeout: timeoutMs,
        input,
    });
    return { stdout, exitCode: exitCode ?? 0 };
}
```

注意：需要先 `pnpm package` 才能跑这些测试。测试应检查 `APP_PATH` 是否存在，不存在则 skip。

**第 2 步：编写打包后插件执行测试**

文件：`tests/packaged_smoke/plugin_execution.test.ts`

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "node:fs";
import { runPluginInPackagedApp } from "./helpers";

const APP_EXISTS = existsSync(APP_PATH);

describe.skipIf(!APP_EXISTS)("packaged plugin execution", () => {
    it("executes a bundled plugin and returns valid output", async () => {
        const result = await runPluginInPackagedApp("deepseek-usage-plugin.ts", {
            API_KEY: "test-key",
        });
        const output = JSON.parse(result.stdout);
        // 插件可能返回错误（key 无效），但不应崩溃
        expect(output).toHaveProperty("success");
    });

    it("handles missing required params gracefully", async () => {
        const result = await runPluginInPackagedApp("deepseek-usage-plugin.ts", {});
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(false);
        expect(output.error.code).toBe("MISSING_PARAM");
    });

    it("plugin cache directory is writable in packaged app", async () => {
        // 验证 app.asar.unpacked/plugin-cache/ 存在且可写
        const result = await runPluginInPackagedApp("echoes-params.js", {
            TEST: "value",
        });
        expect(result.exitCode).toBe(0);
    });
});
```

**第 3 步：添加 npm script**

文件：`package.json`

```json
{
    "scripts": {
        "test:packaged": "pnpm package && vitest run tests/packaged_smoke"
    }
}
```

**第 4 步：CI 集成**

在 CI 中，打包后测试作为单独的 job 运行，依赖打包步骤：

```yaml
# .github/workflows/test.yml
jobs:
    unit-integration:
        runs-on: ubuntu-latest
        steps:
            - run: pnpm test

    packaged:
        needs: unit-integration
        runs-on: windows-latest # 主要目标平台
        steps:
            - run: pnpm package
            - run: pnpm test:packaged
```

### 影响范围

| 文件                                            | 改动                        |
| ----------------------------------------------- | --------------------------- |
| `tests/packaged_smoke/helpers.ts`               | 新增：打包后执行辅助函数    |
| `tests/packaged_smoke/plugin_execution.test.ts` | 新增：打包后插件测试        |
| `package.json`                                  | 新增 `test:packaged` script |

### 验证方式

```bash
pnpm package && pnpm test:packaged
```

### 风险与回退

- **风险**：打包步骤慢（约 30-60 秒），不适合每次 commit 触发。
- **回退**：CI 中仅在 main branch merge 时运行，PR 不跑。本地开发用 `pnpm test` 覆盖。

### 预估工时：1-2 天

---

## 三、HTTP stub：本地 HTTPS stub

### 目标

插件集成测试使用 HTTPS stub，覆盖 TLS、重定向、gzip、非 JSON 错误响应等真实网络行为。

### 现状

所有插件集成测试使用 `http.createServer` 创建纯文本 HTTP 服务器。真实 API 请求经过 TLS、DNS、重定向、压缩等环节，全部绕过。

### 实施步骤

**第 1 步：生成测试证书**

文件：`tests/integration/plugin/_helpers/test-certs.ts`

```typescript
import { generateKeyPairSync, createSign } from "node:crypto";

export function generateSelfSignedCert(): { key: string; cert: string } {
    // 使用 node:crypto 生成自签名 RSA 证书
    // 有效期 1 年，CN=localhost
    // 仅用于测试，不提交到 git
}
```

证书在测试启动时动态生成，不提交到仓库。

**第 2 步：创建 HTTPS stub**

文件：`tests/integration/plugin/_helpers/https_stub.ts`

```typescript
import { createServer } from "node:https";
import { generateSelfSignedCert } from "./test-certs";

export interface HttpsStubOptions {
    handler: (req: IncomingMessage, res: ServerResponse) => void;
    // 可选：模拟特定行为
    redirect?: { from: string; to: string; status: 301 | 302 | 307 };
    delay?: number; // 模拟网络延迟
    gzip?: boolean; // 是否启用 gzip 压缩
    malformedJson?: boolean; // 返回非法 JSON
}

export function createHttpsStub(options: HttpsStubOptions) {
    const { key, cert } = generateSelfSignedCert();
    const server = createServer({ key, cert }, (req, res) => {
        // 处理重定向
        if (options.redirect && req.url === options.redirect.from) {
            res.writeHead(options.redirect.status, { Location: options.redirect.to });
            res.end();
            return;
        }

        // 处理 gzip
        if (options.gzip) {
            res.setHeader("Content-Encoding", "gzip");
            // 用 zlib.gzip 压缩响应体
        }

        // 处理延迟
        if (options.delay) {
            setTimeout(() => options.handler(req, res), options.delay);
            return;
        }

        options.handler(req, res);
    });

    server.listen(0, "127.0.0.1");
    return server;
}
```

**第 3 步：更新 http-client 支持自签 CA**

文件：`src/plugins/sdk/http-client.ts`

插件 HTTP 客户端需要支持 `NODE_EXTRA_CA_CERTS` 环境变量。`undici` 默认使用系统 CA store，设置 `NODE_EXTRA_CA_CERTS` 后会自动加载额外 CA 证书。

测试中通过 `buildPluginCommand` 传入环境变量：

```typescript
const cmd = buildPluginCommand(plugin, params, "zh-Hans", nodePath, {
    NODE_EXTRA_CA_CERTS: certPath,
});
```

**第 4 步：编写新测试用例**

文件：`tests/integration/plugin/https_stub.test.ts`

```typescript
describe("HTTPS stub coverage", () => {
    it("handles TLS connection to self-signed cert", async () => {
        // 插件通过 HTTPS 连接到自签证书服务器
        // 验证 NODE_EXTRA_CA_CERTS 生效
    });

    it("follows 301 redirect", async () => {
        // stub 返回 301，验证插件跟随重定向
    });

    it("decompresses gzip response", async () => {
        // stub 返回 gzip 压缩的 JSON
        // 验证插件正确解压
    });

    it("handles non-JSON error response (502 HTML)", async () => {
        // stub 返回 502 + HTML body
        // 验证插件返回 INVALID_RESPONSE 错误，不崩溃
    });

    it("handles connection timeout", async () => {
        // stub 延迟 30 秒响应
        // 验证插件返回 TIMEOUT 错误
    });
});
```

**第 5 步：保留旧 stub，渐进迁移**

现有 `http_stub.ts` 不删除。新测试用 `https_stub.ts`，旧测试逐步迁移。

### 影响范围

| 文件                                                       | 改动                                |
| ---------------------------------------------------------- | ----------------------------------- |
| `tests/integration/plugin/_helpers/https_stub.ts`          | 新增：HTTPS stub                    |
| `tests/integration/plugin/_helpers/test-certs.ts`          | 新增：动态证书生成                  |
| `tests/integration/plugin/https_stub.test.ts`              | 新增：HTTPS 测试用例                |
| `src/plugins/sdk/http-client.ts`                           | 可能：确保 NODE_EXTRA_CA_CERTS 生效 |
| `tests/integration/plugin/_helpers/plugin_test_harness.ts` | 修改：支持传入额外环境变量          |

### 验证方式

```bash
pnpm vitest run tests/integration/plugin/https_stub.test.ts
```

### 风险与回退

- **风险**：自签证书在某些 Node.js 版本上可能有兼容问题。
- **回退**：如果动态证书生成有问题，使用预生成的测试证书文件（提交到 `tests/fixtures/certs/`，加入 .gitignore 的实际内容用占位符）。

### 预估工时：1 天

---

## 四、Settings save：Playwright E2E

### 目标

配置保存的完整链路（UI 点击 → IPC → 磁盘写入 → UI 反馈）通过 E2E 测试覆盖。

### 现状

smoke test 渲染 SettingsView 但 config.save 全部 mock，不验证真实保存。

### 前提

项目已有 Playwright E2E 框架：

- `playwright.config.ts` — 配置文件
- `tests/user_e2e/fixtures/` — 测试 fixtures（Electron app 启动、页面对象）
- `tests/user_e2e/specs/` — 现有 E2E 测试
- `tests/user_e2e/pages/settings_page.ts` — 设置页页面对象

### 实施步骤

**第 1 步：扩展 SettingsPage 页面对象**

文件：`tests/user_e2e/pages/settings_page.ts`

```typescript
export class SettingsPage {
    // 现有方法...

    async selectLanguage(language: string) {
        await this.page.selectOption('[data-testid="settings-language"]', language);
    }

    async clickSave() {
        await this.page.click('[data-testid="settings-save-btn"]');
    }

    async waitForSaved() {
        await this.page.waitForSelector("text=已保存");
    }

    async waitForError() {
        await this.page.waitForSelector('[data-testid="settings-save-error"]');
    }
}
```

**第 2 步：编写 E2E 测试**

文件：`tests/user_e2e/specs/settings_save.spec.ts`

```typescript
import { test, expect } from "../fixtures/test";
import { SettingsPage } from "../pages/settings_page";
import { readFile } from "node:fs/promises";

test.describe("Settings save", () => {
    test("saves language change and persists to config.json", async ({ app }) => {
        const page = await app.firstWindow();
        const settings = new SettingsPage(page);
        await settings.goto();

        await settings.selectLanguage("en");
        await settings.clickSave();
        await settings.waitForSaved();

        // 验证磁盘上的 config.json 已更新
        const configPath = app.configPath; // 从 fixture 获取
        const config = JSON.parse(await readFile(configPath, "utf8"));
        expect(config.language).toBe("en");
    });

    test("saves plugin enable/disable toggle", async ({ app }) => {
        const page = await app.firstWindow();
        const settings = new SettingsPage(page);
        await settings.goto();

        // 切换第一个插件的启用状态
        const toggle = page.locator('[data-testid="plugin-toggle"]').first();
        const wasEnabled = await toggle.isChecked();
        await toggle.click();
        await settings.clickSave();
        await settings.waitForSaved();

        // 验证磁盘状态
        const configPath = app.configPath;
        const config = JSON.parse(await readFile(configPath, "utf8"));
        expect(config.plugins[0].enabled).toBe(!wasEnabled);
    });

    test("saves refresh interval change", async ({ app }) => {
        const page = await app.firstWindow();
        const settings = new SettingsPage(page);
        await settings.goto();

        // 修改刷新间隔
        const intervalInput = page.locator('[data-testid="settings-refresh-interval"]').first();
        await intervalInput.fill("600");
        await settings.clickSave();
        await settings.waitForSaved();

        const configPath = app.configPath;
        const config = JSON.parse(await readFile(configPath, "utf8"));
        expect(config.plugins[0].refreshIntervalSeconds).toBe(600);
    });

    test("shows error feedback when save fails", async ({ app }) => {
        // 通过 fixture 或 mock 注入故障
        // 例如：让 config-store 的 writeFile 抛 ENOSPC
        // 验证 UI 显示错误提示
    });

    test("concurrent saves from popup and settings do not corrupt config", async ({ app }) => {
        // 同时打开 popup 和 settings 窗口
        // 两边同时修改和保存
        // 验证 config.json 内容一致，无数据丢失
    });
});
```

**第 3 步：确保 E2E fixture 提供 configPath**

文件：`tests/user_e2e/fixtures/electron_app.ts`

现有 fixture 已经启动真实 Electron app，需要确认能获取到 userData 路径：

```typescript
// 在 fixture 中暴露 configPath
const userDataPath = await app.evaluate(() => app.getPath("userData"));
const configPath = join(userDataPath, "config.json");
```

**第 4 步：添加 npm script**

```json
{
    "scripts": {
        "test:e2e:settings": "playwright test --config=playwright.config.ts --project=default --grep=settings_save"
    }
}
```

### 影响范围

| 文件                                         | 改动                  |
| -------------------------------------------- | --------------------- |
| `tests/user_e2e/specs/settings_save.spec.ts` | 新增：E2E 保存测试    |
| `tests/user_e2e/pages/settings_page.ts`      | 扩展：保存相关方法    |
| `tests/user_e2e/fixtures/electron_app.ts`    | 可能：暴露 configPath |

### 验证方式

```bash
# 先打包
pnpm package
# 跑 E2E
npx playwright test --config=playwright.config.ts --project=default --grep=settings_save
```

### 风险与回退

- **风险**：E2E 测试依赖打包产物，CI 中需要额外的打包步骤。
- **回退**：如果 CI 时间太长，E2E 保存测试仅在 nightly build 中运行。

### 预估工时：1-2 天

---

## 执行顺序

```
第 1 周
├── Day 1-2: stdin quit 协议（最高优先级，修复架构问题）
├── Day 3:   HTTPS stub（独立，不依赖其他改动）
└── Day 4-5: 打包后集成测试（依赖打包基础设施）

第 2 周
└── Day 1-2: Playwright E2E save（依赖打包 + E2E 框架扩展）
```

4 项相互独立，可以并行开发。但建议按顺序落地，因为：

1. stdin quit 是架构修复，影响 runner 的核心逻辑，需要先稳定
2. HTTPS stub 和打包后测试是测试基础设施，可以并行
3. Playwright E2E 依赖打包流程稳定后再加

## 验收标准

每项完成后必须满足：

- `pnpm typecheck` 通过
- `pnpm test` 全量通过（无回归）
- 新增测试在 CI 中可重复运行
- 文档同步更新
