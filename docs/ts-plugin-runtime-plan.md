# TypeScript 插件运行时与动态加载方案

> 目标读者：负责实现 OmniUsage / UsageBoard 插件系统迁移的 AI 或开发者。  
> 核心结论：**插件作者使用 TypeScript 开发；软件内部编译为单文件 JavaScript；运行时由 Electron 内置 Node.js 以子进程执行；宿主与插件之间只通过 CLI 参数和 stdout JSON 通信。**

---

## 1. 背景

当前插件系统采用子进程插件架构：

```text
宿主 Electron
  ↓ child_process spawn
Python 插件进程
  ↓ stdout
JSON 结果
```

当前协议如下：

```text
输入：CLI 参数 --usageboard-param KEY=VALUE
输出：stdout 一个 JSON 对象，表示成功或失败
隔离：子进程执行
超时：15 秒
```

这个协议本身是合理的，因为它和具体语言无关。任何运行时只要能做到：

```text
1. 读取 CLI 参数
2. 发 HTTP 请求
3. 解析 JSON
4. 转换为统一结果结构
5. stdout 输出 JSON
```

都可以作为插件运行时。

当前 Python 插件的问题主要是：

```text
1. 用户机器不一定有 Python
2. Python / python3 / py 命令差异大
3. 第三方依赖安装麻烦，比如 httpx
4. Windows / macOS / Linux 分发体验不一致
5. 打包 Python 运行时会增加应用体积
```

因此推荐把插件运行时迁移到 Node.js，但为了插件开发体验，不建议让作者直接写纯 JavaScript，而是采用：

```text
TypeScript 源码
  ↓ 构建
单文件 JavaScript
  ↓ 执行
Node 子进程
```

---

## 2. 总体目标

### 2.1 主要目标

1. 用户可以用 TypeScript 编写插件。
2. 软件可以动态发现用户新增的插件。
3. 软件不要求用户安装 Python、Node、ts-node、tsx 或其他外部运行时。
4. 插件仍然以子进程方式执行，保留隔离和超时机制。
5. 插件协议保持不变：CLI 参数输入，stdout JSON 输出。
6. 新插件默认使用 TS/Node，旧 Python 插件继续兼容一段时间。
7. CPA 这类依赖 `httpx` 的插件迁移后不再需要 Python 第三方包。
8. 宿主必须校验插件输出，避免插件错误导致 UI 崩溃。

### 2.2 非目标

以下内容不作为第一阶段目标：

1. 不做强沙箱。
2. 不在宿主主进程内直接 `import()` 插件。
3. 不直接在用户侧执行 `.ts` 文件。
4. 不要求支持任意 npm 依赖动态安装。
5. 不设计插件市场、签名分发、远程更新机制。
6. 不一次性删除 Python 插件支持。

---

## 3. 推荐架构

### 3.1 一句话架构

```text
TypeScript 是插件开发语言；
JavaScript 是插件运行产物；
Node 子进程是插件执行环境；
CLI 参数 + stdout JSON 是宿主与插件之间的唯一通信协议。
```

### 3.2 架构图

```text
用户写插件
  plugins/user/deepseek-usage-plugin.ts
        ↓
软件扫描插件目录
        ↓
解析 UsageBoardPlugin metadata
        ↓
发现 source = typescript
        ↓
使用内置 esbuild 编译 TS → JS
        ↓
写入 plugin-cache/deepseek-usage-plugin.js
        ↓
插件注册为 ready
        ↓
用户在 UI 填参数
        ↓
宿主启动 Node 子进程
        ↓
传入 --usageboard-param KEY=VALUE
        ↓
插件发 HTTP 请求
        ↓
插件 stdout 输出 JSON
        ↓
宿主读取并校验 JSON
        ↓
更新 UI
```

---

## 4. 目录结构建议

```text
app/
  src/
    plugins/
      discovery/
        plugin-discovery.ts
      metadata/
        metadata-parser.ts
      compiler/
        plugin-compiler.ts
      registry/
        plugin-registry.ts
      runner/
        plugin-runner.ts
        node-plugin-runner.ts
        python-plugin-runner.ts
      validator/
        plugin-output-validator.ts
      sdk/
        index.ts
        cli.ts
        result.ts
        http.ts
        errors.ts

  resources/
    plugins/
      builtin/
        deepseek-usage-plugin.js
        tavily-usage-plugin.js
        cpa-usage-plugin.js

  user-data/
    plugins/
      user/
        my-custom-plugin.ts

    plugin-cache/
      my-custom-plugin/
        index.js
        index.js.map
        manifest.json
```

说明：

```text
resources/plugins/builtin/
  内置插件分发目录，只放已经编译好的 JS 插件。

user-data/plugins/user/
  用户自定义插件源码目录，可以放 .ts 或 .js。

user-data/plugin-cache/
  TS 插件编译产物目录，宿主实际执行这里的 JS。
```

---

## 5. 插件生命周期

## 5.1 安装插件

用户把一个 TypeScript 插件文件放入插件目录：

```text
user-data/plugins/user/deepseek-usage-plugin.ts
```

或者软件提供 UI：

```text
设置 → 插件 → 打开插件目录
```

用户复制 `.ts` 文件进去。

---

## 5.2 扫描插件

软件启动时，或者用户点击“刷新插件”时，执行扫描：

```ts
async function discoverPlugins(pluginDirs: string[]): Promise<DiscoveredPlugin[]> {
    const files = await scanFiles(pluginDirs, [".ts", ".js", ".py"]);

    return files.map((file) => {
        const metadata = parsePluginMetadata(file);

        return {
            sourcePath: file,
            metadata,
            extension: path.extname(file),
        };
    });
}
```

扫描时只做轻量工作：

```text
1. 遍历插件目录
2. 找到 .ts / .js / .py 文件
3. 读取文件头部 metadata
4. 解析 JSON
5. 做基本合法性校验
```

不要在扫描阶段执行插件。

---

## 5.3 解析 metadata

插件文件头部必须包含 metadata 注释块。

### TypeScript / JavaScript 插件 metadata

```ts
// UsageBoardPlugin:
// {
//   "id": "deepseek",
//   "name": "DeepSeek",
//   "runtime": "node",
//   "source": "typescript",
//   "pluginApiVersion": 1,
//   "entry": "deepseek-usage-plugin.js",
//   "description": "Show DeepSeek balance and usage.",
//   "params": [
//     {
//       "key": "apiKey",
//       "label": "API Key",
//       "type": "password",
//       "required": true
//     }
//   ]
// }
// /UsageBoardPlugin
```

### Python 插件 metadata

为了兼容旧插件，继续支持：

```py
# UsageBoardPlugin:
# {
#   "id": "deepseek",
#   "name": "DeepSeek",
#   "runtime": "python",
#   "pluginApiVersion": 1
# }
# /UsageBoardPlugin
```

### metadata 字段定义

```ts
type PluginMetadata = {
    id: string;
    name: string;
    description?: string;

    runtime: "node" | "python";

    /**
     * 插件源码类型。
     * typescript 表示需要编译；
     * javascript 表示可直接执行；
     * python 表示旧插件。
     */
    source: "typescript" | "javascript" | "python";

    /**
     * 宿主支持的插件协议版本。
     */
    pluginApiVersion: number;

    /**
     * 编译后的入口文件。
     * TS 插件通常写 xxx.js。
     */
    entry?: string;

    /**
     * 参数定义，用于渲染配置 UI。
     */
    params?: PluginParam[];

    /**
     * 可选能力声明。
     */
    capabilities?: {
        network?: boolean;
    };
};

type PluginParam = {
    key: string;
    label: string;
    type: "text" | "password" | "number" | "boolean" | "select";
    required?: boolean;
    defaultValue?: unknown;
    options?: Array<{ label: string; value: string }>;
};
```

### metadata 校验规则

扫描时必须校验：

```text
1. id 必须存在，只能包含 a-z、A-Z、0-9、_、-
2. name 必须存在
3. runtime 必须是 node 或 python
4. source 必须和文件扩展名匹配
   - .ts → source=typescript
   - .js → source=javascript
   - .py → source=python
5. pluginApiVersion 必须在宿主支持范围内
6. params 里的 key 不能重复
7. params 里的 type 必须是已知类型
8. entry 不允许包含 .. 或绝对路径
```

---

## 5.4 编译 TypeScript 插件

如果插件是 `.ts`，软件不直接执行，而是先编译为 `.js`。

### 推荐使用 esbuild

编译配置：

```ts
await esbuild.build({
    entryPoints: [sourcePath],
    outfile: compiledPath,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    sourcemap: true,
    legalComments: "inline",
    banner: {
        js: metadataComment,
    },
});
```

### 编译输入

```text
user-data/plugins/user/deepseek-usage-plugin.ts
```

### 编译输出

```text
user-data/plugin-cache/deepseek/index.js
user-data/plugin-cache/deepseek/index.js.map
user-data/plugin-cache/deepseek/manifest.json
```

### 编译 manifest

每次编译后写入：

```json
{
    "id": "deepseek",
    "sourcePath": "/.../plugins/user/deepseek-usage-plugin.ts",
    "compiledPath": "/.../plugin-cache/deepseek/index.js",
    "sourceHash": "sha256:...",
    "compiledAt": "2026-05-26T00:00:00.000Z",
    "pluginApiVersion": 1
}
```

### 缓存判断

下次启动时：

```text
1. 计算 TS 源码 hash
2. 读取 plugin-cache manifest
3. 如果 sourceHash 相同，直接使用缓存 JS
4. 如果 sourceHash 不同，重新编译
5. 如果重新编译失败：
   - 有旧 JS 缓存：继续使用旧缓存，但显示警告
   - 没有旧 JS 缓存：标记插件为 compile_error
```

### 不建议直接执行 TS

不推荐：

```bash
tsx plugin.ts
ts-node plugin.ts
node --loader ts-node/esm plugin.ts
```

原因：

```text
1. 需要额外运行时依赖
2. 启动速度更慢
3. loader / ESM / CJS / tsconfig 兼容问题多
4. Electron 内置 Node 版本不同会带来行为差异
5. 用户侧错误更难解释
```

---

## 5.5 注册插件

扫描和编译后，生成插件注册信息：

```ts
type PluginRecord = {
    id: string;
    name: string;
    description?: string;

    runtime: "node" | "python";
    source: "typescript" | "javascript" | "python";

    sourcePath: string;
    executablePath: string;

    pluginApiVersion: number;
    params: PluginParam[];

    status: "ready" | "disabled" | "metadata_error" | "compile_error";
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
};
```

示例：

```json
{
    "id": "deepseek",
    "name": "DeepSeek",
    "runtime": "node",
    "source": "typescript",
    "sourcePath": "/user-data/plugins/user/deepseek-usage-plugin.ts",
    "executablePath": "/user-data/plugin-cache/deepseek/index.js",
    "pluginApiVersion": 1,
    "params": [
        {
            "key": "apiKey",
            "label": "API Key",
            "type": "password",
            "required": true
        }
    ],
    "status": "ready"
}
```

---

## 5.6 用户配置参数

软件根据 metadata 的 `params` 渲染 UI。

示例：

```json
[
    {
        "key": "apiKey",
        "label": "API Key",
        "type": "password",
        "required": true
    }
]
```

用户填写后，宿主保存到本地安全存储。

运行插件时，把参数转成 CLI 参数：

```bash
node index.js \
  --usageboard-param apiKey=sk-xxx \
  --usageboard-param region=us
```

注意：

```text
1. password 类型参数不要写入日志
2. 运行失败时不要把 API key 显示到错误详情里
3. 子进程 env 尽量最小化，不要把所有系统环境变量传给插件
```

---

## 5.7 运行插件

Node 插件执行方式：

```ts
const child = spawn(nodePath, [executablePath, "--usageboard-param", "apiKey=sk-xxx"], {
    cwd: path.dirname(executablePath),
    env: minimalEnv,
    stdio: ["ignore", "pipe", "pipe"],
});
```

### nodePath

推荐优先级：

```text
1. 使用 Electron 当前进程对应的 Node 能力
2. 使用应用内置 node helper
3. 不依赖用户系统 node
```

不要要求用户安装 Node.js。

### 子进程限制

运行插件时必须限制：

```ts
type PluginRunLimits = {
  timeoutMs: 15000
  maxStdoutBytes: 1024 * 1024
  maxStderrBytes: 256 * 1024
}
```

规则：

```text
1. 超过 15 秒，kill 子进程
2. stdout 超过限制，kill 子进程
3. stderr 超过限制，截断并记录
4. 插件 exit code 非 0，视为运行失败
5. 插件必须在 stdout 输出一个 JSON 对象
```

---

## 5.8 插件输出协议

成功结果：

```json
{
    "success": true,
    "items": [
        {
            "label": "Balance",
            "value": "$12.34"
        }
    ],
    "badge": {
        "text": "$12.34"
    },
    "chart": {
        "type": "line",
        "points": [
            { "label": "Mon", "value": 1 },
            { "label": "Tue", "value": 2 }
        ]
    }
}
```

失败结果：

```json
{
    "success": false,
    "error": {
        "code": "AUTH_FAILED",
        "message": "Invalid API key"
    }
}
```

TypeScript 类型：

```ts
type PluginResult = PluginSuccessResult | PluginFailureResult;

type PluginSuccessResult = {
    success: true;
    items?: UsageItem[];
    badge?: Badge;
    chart?: Chart;
};

type PluginFailureResult = {
    success: false;
    error: PluginError;
};

type UsageItem = {
    label: string;
    value: string | number;
    description?: string;
    unit?: string;
};

type Badge = {
    text: string;
    tone?: "default" | "success" | "warning" | "danger";
};

type Chart = {
    type: "line" | "bar" | "pie";
    points: Array<{
        label: string;
        value: number;
    }>;
};

type PluginError = {
    code: string;
    message: string;
    details?: unknown;
};
```

---

## 5.9 校验插件输出

宿主不能信任插件输出。读取 stdout 后必须校验：

```ts
function validatePluginOutput(value: unknown): PluginResult {
    if (!isObject(value)) {
        throw new Error("Plugin output must be a JSON object");
    }

    if (value.success === true) {
        validateSuccessResult(value);
        return value;
    }

    if (value.success === false) {
        validateFailureResult(value);
        return value;
    }

    throw new Error("Plugin output must include success boolean");
}
```

校验规则：

```text
1. stdout 必须是合法 JSON
2. JSON 顶层必须是对象
3. success 必须是 boolean
4. success=true 时，items / badge / chart 至少允许一个存在
5. items 必须是数组
6. item.label 必须是 string
7. item.value 必须是 string 或 number
8. badge.text 必须是 string
9. chart.points[].value 必须是 number
10. success=false 时 error.code 和 error.message 必须存在
11. 字符串长度要有限制
12. 数组长度要有限制
```

建议限制：

```text
items 最多 100 个
chart.points 最多 1000 个
单个字符串最多 5000 字符
error.details 最多 50KB
```

---

## 6. 插件 SDK 设计

为了让插件作者少写样板代码，提供 TS SDK。

插件作者写：

```ts
import { definePlugin, ok, fail, fetchJson, requireParam } from "@usageboard/plugin-sdk";

export default definePlugin(async ({ params }) => {
    const apiKey = requireParam(params, "apiKey");

    const data = await fetchJson("https://api.example.com/balance", {
        headers: {
            Authorization: `Bearer ${apiKey}`,
        },
    });

    return ok({
        items: [
            {
                label: "Balance",
                value: data.balance,
            },
        ],
        badge: {
            text: String(data.balance),
        },
    });
});
```

---

## 6.1 SDK 函数

### definePlugin

```ts
type PluginHandler = (context: PluginContext) => Promise<PluginResult> | PluginResult;

type PluginContext = {
    params: Record<string, string>;
};

export function definePlugin(handler: PluginHandler): void {
    runCli(handler);
}
```

### parseArgs

```ts
export function parseArgs(argv = process.argv.slice(2)): Record<string, string> {
    const params: Record<string, string> = {};

    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--usageboard-param") {
            const pair = argv[++i];
            const index = pair.indexOf("=");

            if (index <= 0) {
                throw new Error(`Invalid parameter: ${pair}`);
            }

            const key = pair.slice(0, index);
            const value = pair.slice(index + 1);
            params[key] = value;
        }
    }

    return params;
}
```

### ok

```ts
export function ok(payload: Omit<PluginSuccessResult, "success">): PluginSuccessResult {
    return {
        success: true,
        ...payload,
    };
}
```

### fail

```ts
export function fail(code: string, message: string, details?: unknown): PluginFailureResult {
    return {
        success: false,
        error: {
            code,
            message,
            details,
        },
    };
}
```

### requireParam

```ts
export function requireParam(params: Record<string, string>, key: string): string {
    const value = params[key];

    if (!value) {
        throw new PluginUserError("MISSING_PARAM", `Missing required parameter: ${key}`);
    }

    return value;
}
```

### fetchJson

```ts
export async function fetchJson<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(url, options);
    const text = await res.text();

    let data: unknown = null;

    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        throw new PluginUserError("INVALID_JSON_RESPONSE", `Invalid JSON response from ${url}`);
    }

    if (!res.ok) {
        throw new PluginUserError("HTTP_ERROR", `HTTP ${res.status} from ${url}`, data);
    }

    return data as T;
}
```

### runCli

```ts
async function runCli(handler: PluginHandler): Promise<void> {
    try {
        const params = parseArgs();
        const result = await handler({ params });
        process.stdout.write(JSON.stringify(result));
    } catch (err) {
        const result = normalizeError(err);
        process.stdout.write(JSON.stringify(result));
        process.exitCode = 0;
    }
}
```

注意：插件业务错误建议仍然 stdout 输出标准失败 JSON，不要依赖 exit code。exit code 主要用于崩溃类错误。

---

## 7. 示例插件

### 7.1 TypeScript 源码

```ts
// UsageBoardPlugin:
// {
//   "id": "example-balance",
//   "name": "Example Balance",
//   "runtime": "node",
//   "source": "typescript",
//   "pluginApiVersion": 1,
//   "entry": "index.js",
//   "params": [
//     {
//       "key": "apiKey",
//       "label": "API Key",
//       "type": "password",
//       "required": true
//     }
//   ]
// }
// /UsageBoardPlugin

import { definePlugin, ok, fetchJson, requireParam } from "@usageboard/plugin-sdk";

type BalanceResponse = {
    balance: number;
    currency: string;
};

export default definePlugin(async ({ params }) => {
    const apiKey = requireParam(params, "apiKey");

    const data = await fetchJson<BalanceResponse>("https://api.example.com/balance", {
        headers: {
            Authorization: `Bearer ${apiKey}`,
        },
    });

    return ok({
        items: [
            {
                label: "Balance",
                value: `${data.currency} ${data.balance}`,
            },
        ],
        badge: {
            text: `${data.balance}`,
            tone: data.balance > 0 ? "success" : "warning",
        },
    });
});
```

### 7.2 编译后的运行方式

```bash
node plugin-cache/example-balance/index.js \
  --usageboard-param apiKey=sk-xxx
```

### 7.3 stdout

```json
{
    "success": true,
    "items": [
        {
            "label": "Balance",
            "value": "USD 12.34"
        }
    ],
    "badge": {
        "text": "12.34",
        "tone": "success"
    }
}
```

---

## 8. 宿主模块拆分

## 8.1 plugin-discovery.ts

职责：

```text
1. 扫描插件目录
2. 发现 .ts / .js / .py 文件
3. 调用 metadata-parser
4. 返回 DiscoveredPlugin[]
```

接口：

```ts
type DiscoveredPlugin = {
    sourcePath: string;
    extension: ".ts" | ".js" | ".py";
    metadata: PluginMetadata;
};

async function discoverPlugins(dirs: string[]): Promise<DiscoveredPlugin[]>;
```

---

## 8.2 metadata-parser.ts

职责：

```text
1. 从文件注释中提取 UsageBoardPlugin JSON
2. 支持 // 和 # 两种注释
3. 解析 JSON
4. 校验基础字段
```

接口：

```ts
function parsePluginMetadata(filePath: string): PluginMetadata;
```

伪代码：

```ts
function parsePluginMetadataContent(content: string, commentPrefix: "//" | "#") {
    const lines = content.split(/\r?\n/);
    const start = lines.findIndex((line) => line.includes("UsageBoardPlugin:"));
    const end = lines.findIndex((line) => line.includes("/UsageBoardPlugin"));

    if (start < 0 || end < 0 || end <= start) {
        throw new Error("Missing UsageBoardPlugin metadata block");
    }

    const jsonLines = lines
        .slice(start + 1, end)
        .map((line) => stripCommentPrefix(line, commentPrefix));

    return JSON.parse(jsonLines.join("\n"));
}
```

---

## 8.3 plugin-compiler.ts

职责：

```text
1. 判断 TS 插件是否需要重新编译
2. 调用 esbuild
3. 生成 JS、source map、manifest
4. 处理编译错误
```

接口：

```ts
type CompileResult =
    | {
          status: "success";
          executablePath: string;
          sourceMapPath?: string;
      }
    | {
          status: "error";
          error: PluginError;
          fallbackExecutablePath?: string;
      };

async function compileTypeScriptPlugin(plugin: DiscoveredPlugin): Promise<CompileResult>;
```

---

## 8.4 plugin-registry.ts

职责：

```text
1. 管理所有插件记录
2. 合并扫描结果、编译结果、用户启用状态
3. 提供 UI 查询接口
4. 提供 runner 查询接口
```

接口：

```ts
class PluginRegistry {
    refresh(): Promise<void>;
    list(): PluginRecord[];
    get(id: string): PluginRecord | undefined;
    enable(id: string): Promise<void>;
    disable(id: string): Promise<void>;
}
```

---

## 8.5 plugin-runner.ts

职责：

```text
1. 根据 runtime 选择 node 或 python runner
2. 传入参数
3. 执行子进程
4. 收集 stdout / stderr
5. 处理超时和输出大小限制
6. 调用 output validator
```

接口：

```ts
type RunPluginOptions = {
    plugin: PluginRecord;
    params: Record<string, string>;
    timeoutMs?: number;
};

async function runPlugin(options: RunPluginOptions): Promise<PluginResult>;
```

---

## 8.6 node-plugin-runner.ts

职责：

```text
1. 执行编译后的 JS 插件
2. 不依赖系统 node
3. 维护 timeout 和输出大小限制
```

伪代码：

```ts
async function runNodePlugin(
    executablePath: string,
    params: Record<string, string>,
): Promise<RawPluginRunResult> {
    const args = [executablePath, ...serializeUsageBoardParams(params)];

    return runSubprocess({
        command: getBundledNodePath(),
        args,
        cwd: path.dirname(executablePath),
        env: getMinimalPluginEnv(),
        timeoutMs: 15000,
        maxStdoutBytes: 1024 * 1024,
        maxStderrBytes: 256 * 1024,
    });
}
```

---

## 8.7 python-plugin-runner.ts

职责：

```text
1. 兼容旧 Python 插件
2. 只在 runtime=python 时使用
3. 保留现有 python detect 逻辑，但变为可选
```

建议：

```text
1. 新插件不再推荐 Python
2. Python 支持保留一个迁移周期
3. 未来可以在 major version 中移除
```

---

## 8.8 plugin-output-validator.ts

职责：

```text
1. 解析 stdout JSON
2. 校验 PluginResult schema
3. 标准化错误结构
4. 防止 UI 消费非法数据
```

接口：

```ts
function parseAndValidatePluginOutput(stdout: string): PluginResult;
```

---

## 9. 运行时选择规则

推荐优先使用 metadata，而不是只看扩展名。

```ts
function resolveRuntime(plugin: DiscoveredPlugin): RuntimePlan {
    const { runtime, source } = plugin.metadata;
    const ext = plugin.extension;

    if (ext === ".ts") {
        assert(source === "typescript");
        assert(runtime === "node");
        return {
            needsCompile: true,
            runner: "node",
        };
    }

    if (ext === ".js") {
        assert(source === "javascript");
        assert(runtime === "node");
        return {
            needsCompile: false,
            runner: "node",
        };
    }

    if (ext === ".py") {
        assert(source === "python");
        assert(runtime === "python");
        return {
            needsCompile: false,
            runner: "python",
        };
    }

    throw new Error(`Unsupported plugin extension: ${ext}`);
}
```

---

## 10. 兼容与迁移策略

### 10.1 不一次性删除 Python

建议第一阶段保留双运行时：

```text
.ts → 编译后用 Node 执行
.js → 直接用 Node 执行
.py → 继续用 Python 执行
```

这样可以降低迁移风险。

### 10.2 插件迁移顺序

建议按复杂度从低到高迁移：

```text
1. deepseek-usage-plugin.py
2. tavily-usage-plugin.py
3. glm-usage-plugin.py
4. minimax-usage-plugin.py
5. codex-usage-plugin.py
6. cpa-usage-plugin.py
7. claude-usage-plugin.py
```

理由：

```text
1. DeepSeek / Tavily 请求简单，适合验证 Node runner 和 SDK
2. CPA 有 httpx 依赖，是迁移收益最大的关键验证点
3. Claude 登录流程复杂，最后迁移，降低早期风险
```

### 10.3 迁移验收节点

```text
Milestone 1:
  软件能扫描 .ts 插件并显示到 UI。

Milestone 2:
  软件能把 .ts 插件编译成 .js 并缓存。

Milestone 3:
  软件能执行编译后的 .js 插件并读取 stdout JSON。

Milestone 4:
  DeepSeek / Tavily 插件迁移成功。

Milestone 5:
  CPA 插件迁移成功，彻底移除 httpx 用户安装需求。

Milestone 6:
  所有内置插件迁移到 TS 源码 + JS 产物。

Milestone 7:
  Python runner 变为 legacy，可在未来版本移除。
```

---

## 11. 错误处理设计

### 11.1 metadata 错误

```json
{
    "code": "PLUGIN_METADATA_ERROR",
    "message": "Invalid UsageBoardPlugin metadata"
}
```

UI 行为：

```text
插件列表中显示为错误状态，不允许启用。
```

### 11.2 编译错误

```json
{
    "code": "PLUGIN_COMPILE_ERROR",
    "message": "Failed to compile TypeScript plugin"
}
```

UI 行为：

```text
1. 如果有旧缓存：继续使用旧缓存，但显示“源码编译失败，当前使用上次可用版本”
2. 如果无旧缓存：插件不可运行
```

### 11.3 运行超时

```json
{
    "success": false,
    "error": {
        "code": "PLUGIN_TIMEOUT",
        "message": "Plugin execution timed out after 15000ms"
    }
}
```

### 11.4 stdout 非法

```json
{
    "success": false,
    "error": {
        "code": "INVALID_PLUGIN_OUTPUT",
        "message": "Plugin returned invalid JSON"
    }
}
```

### 11.5 HTTP 错误

插件 SDK 应输出：

```json
{
    "success": false,
    "error": {
        "code": "HTTP_ERROR",
        "message": "HTTP 401 from provider API"
    }
}
```

注意不要泄漏 API key。

---

## 12. 安全边界

### 12.1 重要说明

Node 子进程不是强沙箱。

它能提供的是：

```text
1. 插件崩溃不影响宿主
2. 插件超时可以被 kill
3. stdout / stderr 可以被限制
4. 插件和 UI 主进程隔离
```

它不能防止：

```text
1. 恶意插件读取本地文件
2. 恶意插件访问网络
3. 恶意插件读取环境变量
4. 恶意插件消耗 CPU 直到超时
```

所以第一阶段应把插件视为“受信任代码”。

### 12.2 必须做的限制

```ts
const pluginSandboxOptions = {
    timeoutMs: 15000,
    maxStdoutBytes: 1024 * 1024,
    maxStderrBytes: 256 * 1024,
    cwd: pluginDirectory,
    env: minimalEnv,
};
```

### 12.3 不要做的事

```text
1. 不要把完整 process.env 传给插件
2. 不要在日志中记录 password 参数
3. 不要把插件 stdout 直接插入 HTML
4. 不要在主进程内 import 用户插件
5. 不要允许 entry 指向插件目录外部
```

---

## 13. 依赖策略

### 13.1 第一阶段推荐

第一阶段建议插件只能使用：

```text
1. Node 内置 API
2. 全局 fetch
3. @usageboard/plugin-sdk
```

不允许用户插件自动安装任意 npm 包。

原因：

```text
1. 自动 npm install 会引入供应链风险
2. 不同平台安装二进制依赖容易失败
3. 分发和缓存复杂度上升
4. 当前插件只是 HTTP 请求，不需要复杂依赖
```

### 13.2 未来可选扩展

未来如果要允许第三方依赖，可以设计：

```json
{
    "dependencies": {
        "some-package": "^1.0.0"
    }
}
```

但必须配套：

```text
1. lockfile
2. 依赖缓存目录
3. 安装权限提示
4. 安全审计
5. 插件签名
6. 失败回滚
```

不建议第一阶段做。

---

## 14. Node / Electron 版本要求

因为方案依赖 Node 的 `fetch()`，需要确认 Electron 内置 Node 版本。

推荐要求：

```text
Electron 内置 Node >= 18
```

如果当前 Electron 版本低于 Node 18，有两个选择：

```text
1. 升级 Electron
2. 在 SDK 中提供 fetch polyfill
```

推荐优先升级 Electron，不建议为了插件引入 polyfill 依赖。

---

## 15. AI 实现任务拆解

下面是可以直接交给 AI 的任务列表。

---

### Task 1：实现 metadata-parser.ts

目标：

```text
支持从 .ts / .js / .py 插件文件中解析 UsageBoardPlugin metadata。
```

要求：

```text
1. .ts / .js 使用 // 注释
2. .py 使用 # 注释
3. 支持 JSON 解析
4. 校验必填字段
5. 返回 PluginMetadata
6. 提供单元测试
```

测试用例：

```text
1. 合法 TS metadata
2. 合法 JS metadata
3. 合法 Python metadata
4. 缺少开始标记
5. 缺少结束标记
6. JSON 语法错误
7. 缺少 id
8. runtime 和扩展名不匹配
```

---

### Task 2：实现 plugin-output-validator.ts

目标：

```text
读取插件 stdout，解析并校验 PluginResult。
```

要求：

```text
1. stdout 必须是 JSON object
2. success 必须是 boolean
3. success=true 校验 items / badge / chart
4. success=false 校验 error
5. 限制数组长度和字符串长度
6. 输出标准错误
```

测试用例：

```text
1. 合法 success result
2. 合法 failure result
3. 非 JSON
4. JSON 数组
5. 缺少 success
6. item.value 类型错误
7. chart point value 非 number
8. error.message 缺失
```

---

### Task 3：实现 plugin-sdk

目标：

```text
提供插件作者使用的 TypeScript SDK。
```

文件：

```text
src/plugins/sdk/index.ts
src/plugins/sdk/cli.ts
src/plugins/sdk/result.ts
src/plugins/sdk/http.ts
src/plugins/sdk/errors.ts
```

导出：

```ts
export { definePlugin, ok, fail, fetchJson, requireParam };
```

要求：

```text
1. parseArgs 支持 --usageboard-param KEY=VALUE
2. definePlugin 自动执行 handler
3. ok / fail 返回标准结构
4. fetchJson 处理 HTTP 非 2xx 和非法 JSON
5. requireParam 处理缺参
6. 错误不要泄漏敏感参数
```

---

### Task 4：实现 plugin-compiler.ts

目标：

```text
把用户 TS 插件编译成可执行 JS。
```

要求：

```text
1. 使用 esbuild
2. bundle=true
3. platform=node
4. target=node18
5. 产物写入 plugin-cache
6. 生成 sourcemap
7. 写 manifest.json
8. 基于 sourceHash 判断是否需要重新编译
9. 编译失败时保留旧缓存
```

测试用例：

```text
1. 第一次编译成功
2. 源码未变化时复用缓存
3. 源码变化时重新编译
4. TS 语法错误时返回 compile_error
5. 有旧缓存时 fallback
```

---

### Task 5：实现 node-plugin-runner.ts

目标：

```text
执行编译后的 JS 插件。
```

要求：

```text
1. 使用 Electron 内置 Node 或应用内置 Node helper
2. 传入 --usageboard-param 参数
3. 设置 cwd 为插件产物目录
4. 使用 minimalEnv
5. timeout=15000ms
6. 限制 stdout / stderr 大小
7. exit code 非 0 时返回标准错误
8. stdout 交给 validator
```

测试用例：

```text
1. 正常输出 JSON
2. 插件输出非法 JSON
3. 插件超时
4. 插件 stdout 过大
5. 插件 stderr 过大
6. 插件 exit code 非 0
```

---

### Task 6：实现 plugin-discovery.ts 和 plugin-registry.ts

目标：

```text
把扫描、编译、注册串起来。
```

要求：

```text
1. 扫描 builtin 和 user 插件目录
2. 解析 metadata
3. 根据 runtime/source 决定是否编译
4. 生成 PluginRecord
5. 支持 refresh
6. 支持 enable / disable
7. 编译错误插件也能在 UI 中显示错误状态
```

---

### Task 7：迁移第一个插件

目标：

```text
把 DeepSeek 插件从 Python 迁移为 TypeScript。
```

要求：

```text
1. 保持旧输出格式一致
2. 使用 plugin-sdk
3. 使用 fetchJson
4. 编译为 JS
5. 与旧 Python 插件结果做快照对比
```

验收：

```text
1. 无需 Python
2. 无需 pip install
3. 插件能在 UI 显示结果
4. API key 缺失时显示标准错误
5. API key 错误时显示标准错误
```

---

### Task 8：迁移 CPA 插件

目标：

```text
把 CPA 插件从 Python + httpx 迁移到 TypeScript + fetch + Promise.all。
```

要求：

```text
1. 移除 httpx 依赖
2. 使用 Promise.all 并发请求 provider
3. 单 provider 失败不影响其他 provider，除非旧行为要求整体失败
4. 输出结构与旧插件一致
5. 添加错误聚合逻辑
```

验收：

```text
1. 用户不再需要安装 httpx
2. 多 provider 并发正常
3. 部分 provider 失败有清晰错误信息
4. 输出和旧 CPA 插件兼容
```

---

## 16. 验收标准

最终实现完成后，应满足：

```text
1. 软件可以扫描 .ts 插件
2. 软件可以解析 TS 插件 metadata
3. 软件可以编译 TS 插件为 JS
4. 软件可以缓存编译产物
5. 软件可以动态加载新增插件
6. 软件可以执行编译后的 JS 插件
7. 软件不要求用户安装 Node / Python / ts-node / tsx
8. 插件 stdout 会被 schema 校验
9. 插件超时会被 kill
10. 插件输出过大会被截断或终止
11. 旧 Python 插件仍可运行
12. DeepSeek 或 Tavily 插件完成 TS 迁移
13. CPA 插件完成 TS 迁移后不再需要 httpx
14. UI 不需要关心插件源语言
```

---

## 17. 推荐最终文案

可以在项目文档中这样描述新插件体系：

```text
UsageBoard 插件使用 TypeScript 编写，并在安装或刷新时编译为单文件 JavaScript。
宿主通过 Electron 内置 Node.js 以子进程方式执行插件。
插件通过 CLI 参数接收配置，并通过 stdout 输出标准 JSON。
该机制保留了旧插件系统的隔离模型，同时避免用户安装 Python 或第三方依赖。
```

---

## 18. 最小可行版本 MVP

如果要快速落地，MVP 只做这些：

```text
1. metadata-parser 支持 // 注释
2. plugin-compiler 使用 esbuild 编译单个 .ts 文件
3. node-plugin-runner 执行编译后的 .js
4. plugin-output-validator 校验 stdout
5. SDK 提供 definePlugin / ok / fail / fetchJson / requireParam
6. 迁移 DeepSeek 插件验证全链路
```

暂不做：

```text
1. 第三方 npm 依赖
2. 插件签名
3. 插件市场
4. 强沙箱
5. 远程更新
6. 复杂版本协商
```

---

## 19. 给实现 AI 的最终指令

请按照以下顺序实现：

```text
1. 先阅读当前插件协议、command-builder、metadata-parser、python-detect、现有插件文件。
2. 不要改变 CLI 参数协议和 stdout JSON 协议。
3. 增加 Node/TypeScript 插件支持，而不是删除 Python 支持。
4. 先实现 metadata-parser 对 // 注释块的支持。
5. 再实现 plugin-output-validator，确保宿主不信任插件输出。
6. 实现 plugin-sdk，减少插件样板代码。
7. 实现 plugin-compiler，用 esbuild 把 .ts 编译为 .js。
8. 实现 node-plugin-runner，用子进程执行 JS。
9. 把 discovery、compiler、runner、registry 串起来。
10. 先迁移 DeepSeek 或 Tavily 插件验证链路。
11. 再迁移 CPA 插件，移除 httpx 依赖。
12. 最后再考虑 Claude 这类复杂插件。
```

约束：

```text
1. 不要引入用户侧运行时依赖。
2. 不要要求用户安装 Node、Python、tsx、ts-node。
3. 不要在主进程中直接 import 用户插件。
4. 不要把 API key 写入日志。
5. 不要把完整 process.env 传给插件。
6. 不要让插件输出绕过 schema 校验。
7. 不要破坏旧 Python 插件兼容性。
```

完成后输出：

```text
1. 修改文件列表
2. 新增模块说明
3. 插件运行流程说明
4. 至少一个 TS 插件示例
5. 单元测试结果
6. DeepSeek 或 Tavily 插件迁移结果
```
