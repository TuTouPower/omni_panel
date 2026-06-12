# 测试盲区：剩余 4 项待办详解

> 2026-06-12 生成。10 子代理并行审查 76 个测试文件后，27 项中已完成 23 项，剩余 4 项需测试基础设施升级。

---

## 项目背景

### OmniUsage 是什么

OmniUsage 是一个桌面应用，用于集中监控多种 AI 服务的用量和费用。支持的 AI 平台包括：Claude（Anthropic）、Codex（OpenAI）、Gemini（Google）、DeepSeek、Kimi（月之暗面）、智谱 GLM、MiniMax、Tavily（搜索）、MiMo（小米）、Antigravity 等。

用户在界面上看到的是一张用量卡片列表：每个 AI 服务一张卡片，显示当前用量（如"已用 75 万 token / 总额 100 万"），带进度条和刷新周期。

### 技术栈

```
┌─────────────────────────────────────────────────┐
│  Electron 42 (Chromium + Node.js)               │
│  ┌───────────────┐  ┌──────────────────────────┐│
│  │  Main Process  │  │   Renderer Process       ││
│  │  (Node.js)     │  │   (React 19 + TypeScript)││
│  │                │  │                          ││
│  │  • 插件编译    │  │   • PopupView (弹窗)     ││
│  │  • 插件执行    │◄─┤   • SettingsView (设置)  ││
│  │  • 调度器      │  │   • TrayMenu (托盘菜单)  ││
│  │  • IPC handlers│  │                          ││
│  │  • Config存储  │  │   Vite + Tailwind CSS    ││
│  └───────────────┘  └──────────────────────────┘│
│         ▲ IPC (ipcMain ◄──► ipcRenderer)        │
│         │ preload bridge (contextIsolation=true) │
│  ┌──────┴───────────────────────────────────────┐│
│  │  Plugin Subprocesses (独立 Node.js 进程)      ││
│  │  每个 AI 服务一个插件，通过 stdin/stdout 通信  ││
│  └──────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

**技术栈关键点：**

- **框架**：Electron 42 + React 19 + TypeScript 5.9
- **构建**：Vite 5 (electron-vite) + esbuild
- **样式**：Tailwind CSS 4 + PostCSS
- **测试**：Vitest 3 (单元/集成) + Playwright (E2E)
- **打包**：electron-builder (输出到 `artifacts/win-unpacked/`)
- **编码规范**：snake_case 命名、4 空格缩进、strict TypeScript

### 插件架构

OmniUsage 的核心能力是插件系统。每个 AI 服务由一个独立的插件脚本负责查询用量。

**插件生命周期：**

```
1. 发现 (discovery.ts)
   扫描 assets/plugins/ 和用户目录下的 .ts 文件

2. 编译 (compiler.ts)
   esbuild 将 .ts 编译为 .js，缓存到 plugin-cache/

3. 调度 (plugin-scheduler.ts)
   按配置的刷新间隔（60-3600秒）定时执行插件

4. 执行 (runner.ts)
   child_process.spawn 启动 Node.js 子进程
   通过 stdin 传入参数（cookie、API key 等）
   插件脚本执行 HTTP 请求，获取 AI 服务用量数据
   通过 stdout 返回 JSON 结果

5. 解析 (output-parser.ts)
   解析插件返回的 JSON，转换为 UI 可用的 UsageItem[]
```

**插件 SDK (`src/plugins/sdk/`)：**

每个插件通过 `@omni-usage/plugin-sdk` 提供的 API 编写：

```typescript
import { definePlugin, ok, failFromHttp } from "@omni-usage/plugin-sdk";

definePlugin(async (ctx) => {
    const apiKey = requireParam(ctx.params, "API_KEY");
    const result = await ctx.http.getJson("default", "/api/usage", {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!result.ok) return failFromHttp(result.error);
    return ok({
        items: result.value.data.items.map((item) => ({
            id: item.id,
            name: item.name,
            used: item.used,
            limit: item.limit,
            // ...
        })),
    });
});
```

**插件输出结构 (`UsageItem`)：**

```typescript
interface UsageItem {
    id: string; // 唯一标识
    provider: UsageProvider; // "claude" | "codex" | "gemini" | ...
    source: string; // "direct" | "cpa" | "api_key"
    sourceInstanceId: string; // 来源实例 ID
    accountId: string; // 账号 ID
    accountLabel: string; // 账号显示名
    name: string; // 用量项名称（如 "Claude Pro"）
    used: number | null; // 已用量
    limit: number | null; // 总额度
    displayStyle: "percent" | "ratio" | "none";
    resetAt: string | null; // 重置时间 ISO 8601
    status: "normal" | "warning" | "critical" | "unknown";
    color?: string; // 颜色提示
}
```

### IPC 架构

Main 和 Renderer 之间通过 Electron IPC 通信，有严格的隔离：

```
Renderer (React)
    │
    ▼
window.usageboard (preload bridge)
    │
    ▼
ipcRenderer.invoke(channel, ...args)
    │
    ▼
ipcMain.handle(channel, handler)
    │
    ▼
Main Process 业务逻辑
```

**安全措施：**

- `contextIsolation: true` — renderer 无法直接访问 Node.js API
- `sandbox: true` — preload 脚本在沙箱中运行
- `assert_valid_sender(e)` — 每个 IPC handler 验证调用来源
- Content-Security-Policy 限制资源加载（`default-src 'self'; img-src 'self' data:`）

**主要 IPC 通道：**

- `config:get/save` — 配置读写
- `plugin:list/getState/refresh/refreshAll` — 插件管理
- `auth:cookieLogin/refreshCookies` — 认证
- `event:stateChange/themeChange/settingsNavigate` — 事件推送
- `log:renderer/export` — 日志
- `popup:reportContentHeight` — 弹窗高度报告

### 配置与存储

```
userData/ (C:\Users\{用户}\AppData\Roaming\OmniUsage)
├── config.json          — 应用配置（插件列表、语言、启动选项等）
├── config.secrets.json  — 加密的敏感数据（API key、cookie）
├── states/              — 插件运行时状态（缓存、快照）
└── logs/
    └── app-YYYY-MM-DD.log  — 运行日志
```

配置使用 Zod schema 校验，敏感数据通过 Electron SafeStorage 加密（依赖 OS keychain）。

### 测试体系

```
tests/
├── unit/                    — 单元测试 (jsdom 环境)
│   ├── renderer/            — React 组件、hooks、工具函数
│   ├── main/                — 主进程逻辑
│   ├── ipc/                 — IPC handler
│   ├── plugin/              — 插件编译、元数据解析
│   ├── sdk/                 — 插件 SDK
│   ├── config/              — 配置存储
│   ├── scheduler/           — 调度器
│   └── shared/              — 共享工具
├── integration/             — 集成测试 (Node.js 环境)
│   ├── plugin/              — 真实插件子进程执行
│   ├── scheduler/           — 调度器完整流程
│   └── config/              — 配置持久化
├── smoke/                   — 冒烟测试 (jsdom)
├── user_e2e/                — E2E 测试 (Playwright + 真实 Electron)
│   ├── specs/               — 功能测试
│   └── visual/              — 视觉回归
├── contract_live/           — 真实 API 合约测试
└── fixtures/                — 测试数据和 fake 插件脚本
```

**测试运行方式：**

```bash
pnpm test          # 单元 + 集成（排除 plugin 集成、排除 contract_live）
pnpm typecheck     # TypeScript 类型检查
pnpm check         # typecheck + lint + format + deadcode + arch
pnpm package       # 打包并启动 app（验证打包产物）
```

**测试环境关键差异：**

| 维度     | 单元测试  | 集成测试       | E2E 测试      |
| -------- | --------- | -------------- | ------------- |
| 环境     | jsdom     | Node.js        | 真实 Electron |
| IPC      | 全部 mock | 部分 mock      | 真实 IPC      |
| 文件系统 | mock      | 临时目录       | 真实 userData |
| 网络     | mock      | 127.0.0.1 stub | 真实/可控     |
| CSP      | 无        | 无             | 真实 CSP      |
| 打包     | 不涉及    | 不涉及         | 打包后运行    |

正是这些差异导致了下面 4 个测试盲区。

---

## 剩余 4 项详解

### 1. Windows 无 Unix 信号（中危）

#### 背景

`src/main/core/plugin/runner.ts` 负责执行插件子进程。当插件执行超时或输出超限时，runner 需要终止子进程。实现了一套两阶段终止链路：

```
正常运行
  → 超时触发
    → SIGTERM（优雅关闭，给进程机会清理）
      → 等待 2 秒
        → SIGKILL（强制杀死）
          → 等待 5 秒
            → 强制 reject promise（防止永久挂起）
```

`tests/integration/plugin/runner.test.ts:137` 测试 SIGTERM→SIGKILL 升级，使用了一个捕获 SIGTERM 信号但不退出的 fixture 进程（`ignores-sigterm.js`）来验证 runner 会升级到 SIGKILL。

#### 问题

Windows 没有 Unix 信号机制。Node.js 在 Windows 上对 `child.kill("SIGTERM")` 的实现是调用 Win32 API `TerminateProcess()` — 这个 API 的行为是立即终止目标进程，没有任何"先通知、再强杀"的语义。

**具体表现：**

```javascript
// runner.ts 中的逻辑
child.kill("SIGTERM"); // Linux: 发送信号，进程可捕获
// Windows: TerminateProcess()，直接杀死

// 2 秒后如果进程还在
child.kill("SIGKILL"); // Linux: 不可捕获的强杀
// Windows: 进程已经被杀了，这行是空操作
```

**影响：**

- 插件进程在 Windows 上被直接终止，没有机会清理临时文件、刷新缓冲区
- 如果插件持有文件锁（例如 CPA Manager 的 cookie 文件），强杀后锁不释放，下次启动可能失败
- `schedule_grace_kill`（2 秒后 SIGKILL）在 Windows 上是空操作，测试通过只是碰巧
- 未来如果插件需要执行清理逻辑（如写入最后已知状态），Windows 上永远不会执行

#### 当前状态

测试通过，但测试的是错误的行为。Windows 上不存在两阶段语义，测试通过是因为 `TerminateProcess` 碰巧杀掉了进程。

#### 修复方案

**方案 A：stdin quit 协议（推荐）**

在插件 SDK 中约定：runner 通过 stdin 发送 `quit` 命令，插件收到后自行退出。

```typescript
// runner.ts 中
if (process.platform === "win32") {
    child.stdin.write("quit\n");
    setTimeout(() => {
        if (!settled.value) child.kill(); // 2 秒后强杀
    }, 2000);
} else {
    child.kill("SIGTERM");
}
```

优点：跨平台语义一致，插件有机会执行清理逻辑。
缺点：需要修改插件 SDK，所有插件都要处理 stdin quit 命令。

**方案 B：命名管道/Socket 通知**

在 Windows 上通过命名管道或 localhost socket 发送关闭通知，插件收到后自行退出。

优点：不依赖信号。
缺点：引入新的 IPC 通道，增加复杂度。

**方案 C：接受 Windows 行为差异（最小改动）**

在 runner.ts 中文档化 Windows 行为差异，不修改代码。因为当前所有插件都是无状态的查询脚本，强杀不会导致数据损坏。

```typescript
// Windows: child.kill("SIGTERM") calls TerminateProcess (immediate kill)
// This is acceptable because plugin scripts are stateless and
// any partial output is discarded on timeout anyway.
```

#### 受影响文件

- `src/main/core/plugin/runner.ts` — 信号发送和超时逻辑（约第 76-191 行）
- `tests/integration/plugin/runner.test.ts` — 测试用例
- `tests/fixtures/fake-plugins/ignores-sigterm.js` — 测试 fixture
- `src/plugins/sdk/define-plugin.ts` — 插件 SDK（如果采用方案 A，需要添加 stdin 监听）

---

### 2. esbuild 编译 vs 打包 ASAR 执行路径（中危）

#### 背景

OmniUsage 的插件用 TypeScript 编写，运行前需要编译为 JavaScript。编译使用 esbuild，产物缓存到 `plugin-cache/` 目录。

**插件编译和执行的完整路径：**

```
[开发模式]
  源码: assets/plugins/claude-usage-plugin.ts
  编译: esbuild → node_modules/.cache/omni-usage/plugins/claude-usage-plugin.js
  执行: node claude-usage-plugin.js
  环境: process.execPath = "node"

[打包后]
  源码: resources/app.asar/assets/plugins/claude-usage-plugin.ts (只读)
  编译: esbuild → resources/app.asar.unpacked/plugin-cache/claude-usage-plugin.js
  执行: OmniUsage.exe claude-usage-plugin.js (ELECTRON_RUN_AS_NODE=1)
  环境: process.execPath = "OmniUsage.exe", process.resourcesPath = "resources"
```

打包后的 Electron 应用使用 ASAR 归档格式。ASAR 内的文件是只读的，编译产物必须写到 `app.asar.unpacked` 目录。`configure_esbuild_binary_path` 函数负责解析 esbuild 二进制的正确路径（从 `app.asar` 替换为 `app.asar.unpacked`）。

#### 问题

`tests/integration/plugin/_helpers/plugin_test_harness.ts` 中的 `compile_plugin` 辅助函数是所有插件集成测试的编译入口，但它：

1. 用 esbuild 直接编译 `.ts` → `.js`，没有经过 `configure_esbuild_binary_path`（ASAR 路径解析）
2. 产物写入临时目录，不在 `app.asar.unpacked`
3. 用 `process.execPath` 执行，但 `process.execPath` 在打包后指向 `OmniUsage.exe`，需要 `ELECTRON_RUN_AS_NODE=1` 环境变量
4. 不设置 `process.resourcesPath`，ASAR 相关分支永远不触发

**具体代码路径差异：**

```typescript
// compiler.ts:21-38 — ASAR 路径解析逻辑
function configure_esbuild_binary_path() {
    if (process.resourcesPath) {
        // 打包后：process.resourcesPath = "resources"
        // esbuild 二进制在 app.asar.unpacked 里
        // 需要把路径从 app.asar 替换为 app.asar.unpacked
        const resolved = require.resolve(esbuildPkg);
        if (resolved.includes("app.asar")) {
            process.env["ESBUILD_BINARY_PATH"] = resolved.replace("app.asar", "app.asar.unpacked");
        }
    }
}
```

这段逻辑在集成测试中完全不执行，因为 `process.resourcesPath` 在测试环境中不存在。

#### 当前状态

单元测试已覆盖 `configure_esbuild_binary_path` 本身（本次新增），但集成测试的编译和执行路径仍然与生产环境不同。这意味着：

- ASAR 内文件的只读约束在测试中不可见
- `ELECTRON_RUN_AS_NODE` 的设置逻辑未覆盖
- esbuild 二进制路径解析在打包后可能失败

#### 修复方案

**方案 A：打包后集成测试（推荐）**

新增 `tests/packaged_smoke/plugin_compile.test.ts`，用打包产物执行插件：

```typescript
// 1. 先打包: pnpm package
// 2. 用打包产物运行插件编译测试
const appPath = "artifacts/win-unpacked/OmniUsage.exe";
const result = await execFile(appPath, ["--run-plugin", "test.ts"], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
});
expect(result.exitCode).toBe(0);
```

优点：覆盖真实执行路径，包括 ASAR、esbuild 路径、ELECTRON_RUN_AS_NODE。
缺点：测试慢（需要先打包），CI 资源消耗大。

**方案 B：Mock ASAR 环境**

在测试中设置 `process.resourcesPath` 指向一个临时目录，目录结构模拟 ASAR：

```
tmp/
  app.asar/
    assets/plugins/xxx.ts
  app.asar.unpacked/
    plugin-cache/
```

优点：不需要打包，测试快。
缺点：不是真实 ASAR，路径解析可能有差异。

#### 受影响文件

- `tests/integration/plugin/_helpers/plugin_test_harness.ts` — 编译辅助函数（约第 52-81 行）
- `tests/integration/plugin/*.test.ts` — 所有 9 个插件集成测试
- `src/main/core/plugin/compiler.ts` — ASAR 路径解析（约第 21-38 行）
- `src/main/core/plugin/runner.ts` — ELECTRON_RUN_AS_NODE 设置

---

### 3. http_stub 绕过 TLS/DNS/重定向/gzip（低危）

#### 背景

OmniUsage 的插件需要从各种 AI 平台的 API 获取用量数据。每个插件通过 `ctx.http.getJson(endpoint, path, options)` 发起 HTTP 请求，底层使用 `undici`（Node.js 的 HTTP 客户端库）。

**真实 API 请求链路：**

```
插件代码
  → SDK HttpClient (undici)
    → DNS 解析（api.anthropic.com → IP 地址）
      → TCP 连接
        → TLS 握手（证书验证、SNI、协议协商）
          → HTTP/2 或 HTTP/1.1 请求
            → 服务器响应
              → gzip/br 解压
                → 3xx 重定向跟随
                  → JSON 解析
                    → 返回给插件
```

为了在测试中不依赖真实网络，所有插件集成测试使用 `tests/integration/plugin/_helpers/http_stub.ts` 创建本地 HTTP 服务器，插件连接这个服务器获取数据。

#### 问题

http_stub 的实现非常简化：

```typescript
// http_stub.ts — 创建本地 HTTP 服务器
const server = http.createServer(handler); // 纯文本 HTTP，无 TLS
server.listen(0, "127.0.0.1"); // 直连，无 DNS
```

**缺失的环节：**

| 环节         | 真实行为                        | stub 行为            | 风险                  |
| ------------ | ------------------------------- | -------------------- | --------------------- |
| TLS          | 证书验证、SNI、TLS 1.2/1.3 协商 | 无                   | 证书过期/吊销检测不到 |
| DNS          | 解析、缓存、超时、IPv6 回退     | 无（直连 127.0.0.1） | DNS 故障无法覆盖      |
| 重定向       | 301/302/307/308 跟随            | 无                   | API 迁移重定向失败    |
| 压缩         | gzip/br 解压                    | 无                   | 压缩响应体解析错误    |
| Content-Type | JSON 解析、HTML 错误页处理      | 无（直接 JSON）      | 非 JSON 响应未处理    |
| 超时         | DNS/TCP/TLS/读取各自超时        | 只有整体超时         | 细粒度超时未测试      |
| 代理         | HTTP_PROXY/NO_PROXY 处理        | 无                   | 企业代理环境失败      |

**真实 API 失败场景示例：**

- Cloudflare 502 Bad Gateway（返回 HTML 而非 JSON）
- DNS 解析超时（网络不稳）
- TLS 证书过期（AI 平台证书轮换）
- gzip 流损坏（网络中断）
- 301 重定向（API 版本升级）
- 429 Too Many Requests（速率限制）

这些场景在当前测试中完全不可覆盖。

#### 当前状态

插件集成测试通过，但只验证了"纯 HTTP + 正确 JSON 响应"的 happy path。

#### 修复方案

**方案 A：本地 HTTPS 服务器（推荐）**

```typescript
// tests/integration/plugin/_helpers/https_stub.ts
import { createServer } from "node:https";
import { generateKeyPairSync, createCertificate } from "node:crypto";

function createHttpsStub(handler: RequestHandler) {
    const { cert, key } = generateSelfSignedCert();
    const server = createServer({ cert, key }, handler);
    server.listen(0, "127.0.0.1");
    return server;
}
```

插件需要信任自签证书（通过环境变量 `NODE_EXTRA_CA_CERTS` 指向测试 CA 证书）。

优点：覆盖 TLS 验证、SNI、证书过期等场景。
缺点：需要管理测试证书，插件需要额外 CA 配置。

**方案 B：分类标记**

现有 stub 测试标记为 `@happy-path`，新增带 TLS/重定向/压缩的测试作为 `@integration`，在 CI 中分层运行：

```bash
pnpm test              # 现有 stub 测试（快速，< 2 分钟）
pnpm test:integration  # HTTPS stub 测试（慢，需本地证书）
```

#### 受影响文件

- `tests/integration/plugin/_helpers/http_stub.ts` — 现有 stub（约第 54-120 行）
- `tests/integration/plugin/*.test.ts` — 所有 9 个插件测试
- 需要新增：`tests/integration/plugin/_helpers/https_stub.ts`
- `src/plugins/sdk/http-client.ts` — 插件 HTTP 客户端（可能需要 CA 配置支持）

---

### 4. Settings save 端到端从未测试（低危）

#### 背景

OmniUsage 的设置界面（SettingsView）允许用户配置插件、调整外观、管理数据。保存配置的完整链路跨越了 Electron 的两个进程：

```
用户操作                          Renderer Process              Main Process
─────────                        ──────────────              ────────────
修改设置                           SettingsForm 组件
  ↓
点击"保存"                         onSave() 回调
  ↓
                                  config.save(updatedConfig)
  ↓
                                  ipcRenderer.invoke("config:save")
  ↓                                                               handleConfigSave()
  ↓                                                                 ↓
  ↓                                                               Zod schema 校验
  ↓                                                                 ↓
  ↓                                                               scheduleSave() (防抖)
  ↓                                                                 ↓
  ↓                                                               writeFile + rename (原子写入)
  ↓                                                                 ↓
  ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ { ok: true } ─ ┘
  ↓
显示"已保存"
```

`tests/smoke/renderer-smoke.test.tsx` 渲染 SettingsView 组件，验证 UI 元素存在，但 `config.save` 是一个始终返回 `undefined` 的 mock：

```typescript
window.usageboard = {
    config: {
        save: vi.fn().mockResolvedValue(undefined),
        // ...
    },
    // ...
};
```

#### 问题

完整保存链路从未被测试。只测试了第一步（点击按钮），后面全部 mock。任何环节断裂都检测不到。

**未覆盖的故障场景：**

| 场景               | 当前覆盖                  | 风险                          |
| ------------------ | ------------------------- | ----------------------------- |
| 正常保存           | UI 点击测试通过，IPC mock | IPC 真实调用未验证            |
| 保存非法 config    | 无                        | Zod 校验失败时用户看到什么？  |
| 保存时磁盘满       | 无                        | writeFile 失败静默吞掉        |
| 两个窗口同时保存   | 无                        | 写入竞争导致数据丢失          |
| 保存后立即关闭窗口 | 无                        | scheduleSave 未完成，数据丢失 |
| IPC 超时           | 无                        | 用户无限等待"保存中..."       |
| 配置并发修改       | 无                        | A 窗口保存覆盖 B 窗口的修改   |

#### 当前状态

smoke test 通过，但只验证了 UI 存在，不验证功能。`config-ipc.test.ts` 测试了 handleConfigSave 本身（独立于 UI），但没有测试 UI → IPC → 磁盘的完整链路。

#### 修复方案

**方案 A：Playwright E2E 测试（推荐）**

利用项目已有的 Playwright E2E 框架，新增端到端保存测试：

```typescript
// tests/user_e2e/specs/settings_save.spec.ts
import { test, expect } from "../fixtures/test";

test("saves config and persists to disk", async ({ app }) => {
    const page = await app.firstWindow();

    // 导航到设置页
    await page.goto("file://...#settings");

    // 修改语言设置
    await page.selectOption('[data-testid="settings-language"]', "en");

    // 点击保存
    await page.click('[data-testid="settings-save-btn"]');

    // 验证 UI 显示"已保存"
    await expect(page.locator("text=Saved")).toBeVisible();

    // 验证磁盘上的 config.json 已更新
    const config = JSON.parse(await readFile(configPath, "utf8"));
    expect(config.language).toBe("en");
});

test("shows error when save fails", async ({ app }) => {
    // 模拟磁盘满（通过拦截 writeFile）
    // ...
});
```

优点：覆盖完整链路，包括 IPC + 文件系统。
缺点：需要先打包 app，测试慢（每个用例约 10-30 秒）。

**方案 B：分层测试**

1. **单元层**（已有）：`config-ipc.test.ts` 测试 handleConfigSave
2. **集成层**（新增）：用真实 configStore + 注册 IPC handler，测试 UI 到磁盘的链路
3. **E2E 层**（新增）：用 Playwright 跑打包后的 app

```typescript
// tests/integration/settings/save-flow.test.ts
it("saves config via IPC and persists to disk", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "settings-save-"));
    const configPath = join(tmpDir, "config.json");
    const store = createConfigStore(configPath);

    // 注册真实 IPC handler
    await registerConfigIpc({ configStore: store, ... });

    // 模拟 renderer 调用
    const handler = ipc_main_mock.handle.mock.calls
        .find(([ch]) => ch === "config:save")?.[1];
    const result = await handler(
        { senderFrame: { url: "file://app" } },
        { schemaVersion: 1, language: "en", plugins: [], launchAtLogin: false },
    );

    expect(result.ok).toBe(true);
    const saved = JSON.parse(await readFile(configPath, "utf8"));
    expect(saved.language).toBe("en");
});
```

#### 受影响文件

- `tests/smoke/renderer-smoke.test.tsx` — 现有 smoke test（约第 61-79 行）
- 需要新增：`tests/integration/settings/save-flow.test.ts`
- 或 `tests/user_e2e/specs/settings_save.spec.ts`（Playwright）
- `tests/user_e2e/fixtures/` — E2E 测试基础设施（已存在）

---

## 总结

| 项                | 类型         | 根因              | 推荐方案          | 预估工作量 |
| ----------------- | ------------ | ----------------- | ----------------- | ---------- |
| Windows 信号      | 架构         | 平台语义不同      | stdin quit 协议   | 2-3 天     |
| ASAR 执行路径     | 测试基础设施 | 开发/打包路径不同 | 打包后集成测试    | 1-2 天     |
| http_stub TLS     | 测试基础设施 | 纯 HTTP stub      | 本地 HTTPS 服务器 | 1 天       |
| Settings save e2e | 测试基础设施 | mock 替代真实 IPC | Playwright E2E    | 1-2 天     |

4 项都涉及测试基础设施升级，建议在 CI 流水线中分阶段实施，不影响当前开发节奏。
