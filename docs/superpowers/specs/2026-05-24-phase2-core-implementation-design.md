# Phase 2: Core Implementation Design Spec

> 日期：2026-05-24
> 状态：设计通过，待实现
> 范围：Round 3 ~ Round 7（含 Round 3.5 严格质量门禁）
> **权威来源**：本文件为跨 round 架构总览。权威优先级：
> 1. **round spec**（`docs/superpowers/specs/2026-05-24-round*.md`）— 定义范围、验收标准、文件清单
> 2. **plan**（`docs/superpowers/plans/2026-05-24-phase2-core-implementation.md`）— 定义执行步骤
> 3. **本文件** — 仅保留跨 round 架构约束和决策记录
>
> 冲突时以 round spec 为准。本文件不再扩写实现细节。

---

## 1. 决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| Schema 校验 | Zod + JSON Schema 导出 | TS-native 类型推断 + 向后兼容 JSON Schema |
| 脚手架 | Electron Forge + Vite | 官方推荐，插件系统完善 |
| 模块组织 | 领域分组 + 构造注入 | 边界清晰，可测试性好 |
| Unconfirmed 策略 | 全取最保守 | 不猜测，不引入歧义 |
| 设计粒度 | 架构 spec + 逐 round spec | 全覆盖 |

### 1.1 Unconfirmed 决策（全保守）

| 项目 | 决策 |
|------|------|
| stdout 多余文本 | trim 后整体 JSON 解析，失败报错 |
| required 参数为空 | 阻止执行 |
| 失败时保留旧缓存 | 是，runtime-store 保留 lastSuccess |
| 80 行限制 | 实现，仅扫描前 80 行 |

---

## 2. 目录结构

```
omni_usage/
├── src/
│   ├── main/                        # 主进程
│   │   ├── index.ts                 # Electron 入口
│   │   ├── core/
│   │   │   ├── plugin/              # 插件领域
│   │   │   │   ├── metadata-parser.ts
│   │   │   │   ├── output-parser.ts
│   │   │   │   ├── command-builder.ts
│   │   │   │   ├── runner.ts
│   │   │   │   ├── instance.ts
│   │   │   │   ├── discovery.ts
│   │   │   │   └── types.ts
│   │   │   ├── config/
│   │   │   │   ├── config-store.ts
│   │   │   │   ├── secrets-store.ts
│   │   │   │   └── types.ts
│   │   │   ├── cache/
│   │   │   │   ├── cache-store.ts
│   │   │   │   └── types.ts
│   │   │   ├── scheduler/
│   │   │   │   ├── plugin-scheduler.ts
│   │   │   │   ├── runtime-store.ts
│   │   │   │   ├── refresh-service.ts
│   │   │   │   └── types.ts
│   │   │   └── paths.ts
│   │   └── ipc/                     # Round 8
│   ├── preload/                     # Round 8
│   ├── renderer/                    # Round 9
│   └── shared/
│       ├── schemas/
│       │   ├── plugin-output.ts     # Zod schema（source of truth）
│       │   ├── plugin-metadata.ts   # Zod schema
│       │   └── index.ts
│       ├── types/
│       │   ├── plugin.ts
│       │   ├── config.ts
│       │   └── ipc.ts
│       ├── errors/
│       │   ├── plugin-errors.ts
│       │   └── index.ts
│       └── constants.ts
├── tests/
│   ├── unit/
│   │   ├── plugin/
│   │   │   ├── metadata-parser.test.ts
│   │   │   ├── output-parser.test.ts
│   │   │   └── command-builder.test.ts
│   │   └── shared/
│   │       └── schemas.test.ts
│   ├── integration/
│   │   ├── plugin/
│   │   │   └── runner.test.ts
│   │   ├── config/
│   │   │   └── config-store.test.ts
│   │   ├── cache/
│   │   │   └── cache-store.test.ts
│   │   └── scheduler/
│   │       ├── runtime-store.test.ts
│   │       ├── plugin-scheduler.test.ts
│   │       └── refresh-service.test.ts
│   └── e2e/
├── fixtures/
│   ├── plugin-output/               # Phase 1 已有
│   ├── plugin-metadata/             # Phase 1 已有
│   └── fake-plugins/               # Round 5 新增
├── schemas/                         # 从 Zod 导出更新
├── docs/
├── resources/
│   └── plugins/                     # Round 10
└── [config files]
```

---

## 3. 模块接口定义

### 3.1 shared/schemas/plugin-output.ts

Zod schema 为 source of truth，同时导出 JSON Schema。

```typescript
import { z } from "zod";

export const usageDisplayStyleSchema = z.enum(["percent", "ratio"]);
export const usageStatusSchema = z.enum(["normal", "warning", "critical", "unknown"]);
export const usageColorSchema = z.enum(["blue", "green", "yellow", "orange", "red"]);

export const usageItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  used: z.number(),
  limit: z.number(),
  displayStyle: usageDisplayStyleSchema,
  resetAt: z.string().datetime().optional(),
  status: usageStatusSchema.default("unknown"),
  color: usageColorSchema.optional(),
});

export const pluginChartSegmentSchema = z.object({
  model: z.string(),
  tokens: z.number(),
});

export const pluginChartBucketSchema = z.object({
  label: z.string(),
  segments: z.array(pluginChartSegmentSchema),
});

export const pluginChartSchema = z.object({
  kind: z.string(),
  period: z.string(),
  bucketUnit: z.enum(["hour", "day"]),
  buckets: z.array(pluginChartBucketSchema),
  message: z.string().optional(),
});

export const pluginOutputSchema = z.object({
  schemaVersion: z.number(),
  updatedAt: z.string(),
  items: z.array(usageItemSchema),
  badge: z.string().optional(),
  chart: pluginChartSchema.optional(),
});

export const pluginErrorOutputSchema = z.object({
  error: z.string(),
});

// 推断类型
export type UsageItem = z.infer<typeof usageItemSchema>;
export type PluginOutput = z.infer<typeof pluginOutputSchema>;
export type PluginChart = z.infer<typeof pluginChartSchema>;
export type PluginErrorOutput = z.infer<typeof pluginErrorOutputSchema>;
```

### 3.2 shared/schemas/plugin-metadata.ts

```typescript
export const pluginParameterTypeSchema = z.enum([
  "string", "secret", "integer", "boolean", "choice", "directory", "file",
]);

export const pluginParameterOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
});

// 带翻译的 option
export const pluginParameterOptionWithTranslationsSchema = pluginParameterOptionSchema
  .catchall(z.string()); // 允许 label@zh-Hans 等动态 key

export const pluginParameterMetadataSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: pluginParameterTypeSchema,
  required: z.boolean(),
  placeholder: z.string().optional(),
  defaultValue: z.string().optional(),
  options: z.array(pluginParameterOptionWithTranslationsSchema).optional(),
}).catchall(z.string()); // 允许动态翻译 key

export const pluginMetadataSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  parameters: z.array(pluginParameterMetadataSchema).optional(),
}).catchall(z.string()); // 允许 name@zh-Hans 等动态 key

export type PluginMetadata = z.infer<typeof pluginMetadataSchema>;
export type PluginParameterMetadata = z.infer<typeof pluginParameterMetadataSchema>;
```

### 3.3 shared/errors/plugin-errors.ts

```typescript
export class PluginOutputParseError extends Error {
  constructor(message: string, public readonly raw: string) {
    super(message);
    this.name = "PluginOutputParseError";
  }
}

export class PluginSchemaError extends Error {
  constructor(message: string, public readonly issues: z.ZodIssue[]) {
    super(message);
    this.name = "PluginSchemaError";
  }
}

export class MetadataParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetadataParseError";
  }
}

export class PluginExecutionError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = "PluginExecutionError";
  }
}

export class PluginTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Plugin execution timed out after ${timeoutMs}ms`);
    this.name = "PluginTimeoutError";
  }
}
```

### 3.4 plugin/metadata-parser.ts

```typescript
export function parsePluginMetadata(content: string): PluginMetadata | null;
// 逻辑：
// 1. 取 content 前 80 行
// 2. 找 UsageBoardPlugin: 开始标记（前缀匹配，忽略行首空白和 # 前缀）
// 3. 收集直到 /UsageBoardPlugin 结束标记
// 4. stripCommentPrefix: 去除 # 和紧随空格
// 5. 拼接后 JSON.parse
// 6. 用 pluginMetadataSchema.safeParse 校验
// 返回：
//   null = 无 marker 或 JSON 解析失败（静默）
//   PluginMetadata = 成功
// 抛出 MetadataParseError = marker 存在但格式严重错误（可选）
```

### 3.5 plugin/output-parser.ts

```typescript
export function parsePluginOutput(stdout: string): PluginOutput;
export function parsePluginOutputOrError(stdout: string): PluginOutput | PluginErrorOutput;
// 逻辑：
// 1. stdout.trim()
// 2. JSON.parse（失败抛 PluginOutputParseError）
// 3. 尝试 pluginErrorOutputSchema.safeParse → 匹配则返回 PluginErrorOutput
// 4. 尝试 pluginOutputSchema.safeParse → 匹配则返回 PluginOutput
// 5. 都不匹配抛 PluginSchemaError
```

### 3.6 plugin/command-builder.ts

```typescript
export interface PluginCommand {
  command: string;
  args: string[];
}

export function buildPluginCommand(
  executablePath: string,
  parameterValues: Record<string, string>,
  language: "zh-Hans" | "en",
): PluginCommand;
// .py → { command: "python3", args: [executablePath, ...paramArgs] }
// 非 .py → { command: executablePath, args: [...paramArgs] }
// 参数格式：--usageboard-param KEY=value
// 额外：--usageboard-param USAGEBOARD_LANGUAGE=zh-Hans
// 仅传递非空 parameterValues
```

### 3.7 plugin/runner.ts

```typescript
export interface PluginExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface PluginRunnerOptions {
  timeoutMs?: number; // 默认 15000
}

export function executePlugin(
  command: PluginCommand,
  options?: PluginRunnerOptions,
): Promise<PluginExecutionResult>;
// 使用 child_process.spawn（不用 exec）
// 捕获 stdout + stderr
// timeout 后 kill 子进程（SIGTERM，超时后 SIGKILL）
// secret 参数不进日志/错误消息
```

### 3.8 paths.ts

```typescript
import { app } from "electron";

export function getDataRoot(): string;       // app.getPath("userData")
export function getConfigPath(): string;     // getDataRoot() + "/config.json"
export function getStatesDir(): string;      // getDataRoot() + "/states"
export function getBundledPluginsDir(): string; // 开发: resources/plugins, 生产: process.resourcesPath + "/plugins"
export function getUserPluginsDir(): string; // getDataRoot() + "/plugins"
export function getLogsDir(): string;        // getDataRoot() + "/logs"
```

### 3.9 config/config-store.ts

```typescript
export interface ConfigStore {
  load(): Promise<AppConfiguration>;
  save(config: AppConfiguration): Promise<void>;
}
// load: 读取 config.json → JSON.parse → 返回
// 文件不存在返回默认配置
// save: JSON.stringify(config, null, 2) → atomic write（write to tmp + rename）
// JSON 编码：prettyPrinted + sortedKeys
```

### 3.10 cache/cache-store.ts

```typescript
export interface CacheStore {
  load(stateId: string): Promise<PluginCachedState | null>;
  save(stateId: string, state: PluginCachedState): Promise<void>;
  delete(stateId: string): Promise<void>;
}
// 文件：states/{stateId}.json
// load: 文件不存在返回 null
// save: atomic write
// delete: 删除文件，不存在不报错
```

### 3.11 scheduler/runtime-store.ts

```typescript
export type PluginSnapshotState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly items: readonly UsageItem[]; readonly updatedAt: Date; readonly badge?: string; readonly chart?: PluginChart }
  | { readonly status: "failed"; readonly error: string; readonly lastSuccess?: PluginCachedState };

export interface RuntimeStoreListener {
  onStateChange(instanceId: string, state: PluginSnapshotState): void;
}

export interface RuntimeStore {
  getSnapshot(instanceId: string): PluginSnapshotState;
  updateState(instanceId: string, state: PluginSnapshotState): void;
  getAll(): ReadonlyMap<string, PluginSnapshotState>;
  subscribe(listener: RuntimeStoreListener): () => void;
}
// 纯内存状态机
// 状态转换：idle → loading → ready | failed
// failed 状态保留 lastSuccess（如果之前有 ready）
// subscribe 返回 unsubscribe 函数
```

### 3.12 scheduler/plugin-scheduler.ts

```typescript
export interface PluginScheduler {
  start(instanceId: string, intervalSeconds: number): void;
  stop(instanceId: string): void;
  stopAll(): void;
  refreshNow(instanceId: string): void;
}
// 每个插件独立 setInterval
// interval = max(intervalSeconds, 5)
// 首次：有缓存且未过期则等 interval，否则立即
// refreshNow：取消旧 timer，立即触发，重建 timer
// stop：clearInterval，移除记录
```

### 3.13 scheduler/refresh-service.ts

```typescript
export interface PluginRefreshService {
  refresh(instanceId: string, options?: { force?: boolean }): Promise<void>;
  refreshAll(): Promise<void>;
}
// refresh 流程：
// 1. cache-store.load(stateId) 检查是否过期
// 2. [未过期且非 force] → 更新 runtime-store 为 cached data，结束
// 3. runtime-store → loading
// 4. config-store 获取 instance 配置
// 5. 检查 required 参数是否为空 → 空则 failed，结束
// 6. command-builder 构建命令
// 7. runner.execute()
// 8. [exit 0] → output-parser 解析
//    - PluginOutput → cache-store.save → runtime-store → ready
//    - PluginErrorOutput → runtime-store → failed
// 9. [exit != 0] → runtime-store → failed（stderr 作错误消息）
// 10. [timeout] → runtime-store → failed
// 失败时保留 lastSuccess（从 cache-store 加载）
// 防并发：同一 instanceId 正在 refresh 时忽略新请求
```

---

## 4. 技术栈配置

### 4.1 package.json scripts

```json
{
  "scripts": {
    "start": "electron-forge start",
    "build": "electron-forge make",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --max-warnings=0",
    "format:check": "prettier --check .",
    "format": "prettier --write .",
    "deadcode": "knip",
    "arch": "depcruise src --validate .dependency-cruiser.cjs",
    "security:js": "pnpm audit --audit-level=high && gitleaks detect --source .",
    "security:sast": "semgrep scan --config=auto",
    "check": "pnpm typecheck && pnpm lint && pnpm format:check && pnpm deadcode && pnpm arch",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "schema:export": "tsx scripts/export-schemas.ts"
  }
}
```

### 4.2 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "useUnknownInCatchVariables": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "allowUnreachableCode": false,
    "allowUnusedLabels": false,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx"
  },
  "include": ["src", "tests"],
  "exclude": ["node_modules"]
}
```

### 4.3 ESLint 关键规则

```typescript
// eslint.config.ts
export default [
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
];
```

### 4.4 dependency-cruiser 架构规则

```javascript
// .dependency-cruiser.cjs
module.exports = {
  forbidden: [
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
    { name: "no-main-from-renderer", severity: "error",
      from: { path: "src/renderer" },
      to: { path: "src/main" } },
    { name: "no-node-from-renderer", severity: "error",
      from: { path: "src/renderer" },
      to: { path: "^node:" } },
    { name: "no-core-from-shared", severity: "error",
      from: { path: "src/shared" },
      to: { path: "src/main" } },
  ],
};
```

---

## 5. 测试策略

TDD 工作流：RED → GREEN → REFACTOR → `pnpm check` 全绿。

具体测试用例见各 round spec（权威来源）：

| Round | Spec |
|-------|------|
| 3 | `2026-05-24-round3-skeleton.md` |
| 3.5 | `2026-05-24-round3.5-quality-gates.md` |
| 4 | `2026-05-24-round4-parser.md` |
| 5 | `2026-05-24-round5-runner.md` |
| 6 | `2026-05-24-round6-state-layer.md` |
| 7 | `2026-05-24-round7-scheduler.md` |

---

## 6. Round 范围

实现权威来源为各 round spec。总览：

| Round | 主题 | 关键约束 | 依赖 | Spec |
|-------|------|---------|------|------|
| 3 | 骨架 | main/preload/renderer 分离，security defaults | 无 | `round3-skeleton.md` |
| 3.5 | 质量门禁 | `--max-warnings=0`，所有 warning = error | Round 3 | `round3.5-quality-gates.md` |
| 4 | Parser | 纯函数，通过所有 fixture 测试 | Round 3 | `round4-parser.md` |
| 5 | Runner | `spawn` 不用 `exec`，timeout+kill | Round 4 | `round5-runner.md` |
| 6 | 状态层 | atomic write，凭证不进日志 | Round 5 | `round6-state-layer.md` |
| 7 | 调度层 | 防并发、cache hit、失败保留旧 cache | Round 6 | `round7-scheduler.md` |

---

## 7. 架构约束

### 7.1 依赖方向

```
shared (types, schemas, errors, constants)
  ↑
plugin (metadata-parser, output-parser, command-builder, runner)
  ↑
config (config-store, secrets-store)
  ↑
cache (cache-store)
  ↑
scheduler (runtime-store, plugin-scheduler, refresh-service)
```

- shared 不依赖任何 core 模块
- plugin 不依赖 config / cache / scheduler
- config / cache 不依赖 scheduler
- scheduler 依赖所有下层

### 7.2 安全约束

- renderer 禁止 import `node:*` 模块
- renderer 禁止 import `src/main/*`
- secret 参数不进日志、错误消息、测试快照
- IPC 校验 sender / origin / payload schema（Round 8）
- `shell.openExternal` URL allowlist（Round 8）

### 7.3 immutability

- 所有状态更新创建新对象，不修改现有对象
- RuntimeStore 的 PluginSnapshotState 是 readonly
- ConfigStore.load() 返回新对象

---

## 8. 不确定性与风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| Electron Forge + Vite 模板兼容性 | Round 3 | 测试初始化后立即跑 `pnpm check` |
| Windows Python 路径探测 | Round 5 | command-builder 加 platform 分支，fake plugin 测试覆盖 |
| `exactOptionalPropertyTypes` 与 Zod default 冲突 | Round 4 | 注意 Zod `.default()` 输出与 TS optional 的差异 |
| 80 行限制在某些长注释插件中不够 | Round 4 | 最保守实现，记录到 unconfirmed.md |
| `child_process.spawn` 在 Windows 的 shell 行为 | Round 5 | `{ shell: true }` on Windows only，测试覆盖 |

---

## 9. 关联文档

- `docs/migration-principles.md` — 迁移原则
- `docs/ai-working-rules.md` — AI 工作规则
- `docs/plugin-contract.md` — 插件协议契约
- `docs/old-data-models.md` — 旧数据模型
- `docs/old-behavior-map.md` — 旧行为映射
- `docs/unconfirmed.md` — 不确定项
- `docs/source-inventory.md` — 源码清单
- `TASKS.md` — 任务清单
