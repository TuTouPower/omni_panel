# Round 6: Config / Cache / Path / Secret 实现

> 日期：2026-05-24
> 依赖：Round 5（runner）
> 产出：paths + config-store + cache-store + secrets-store + plugin-instance + 全部测试通过

---

## 目标

建立本地状态层：集中路径管理、配置文件读写、缓存读写、凭证存储、插件实例管理。不涉及调度、UI、IPC。

---

## 交付物

### 1. paths.ts

```typescript
export function getDataRoot(): string;
export function getConfigPath(): string;
export function getStatesDir(): string;
export function getBundledPluginsDir(): string;
export function getUserPluginsDir(): string;
export function getLogsDir(): string;
```

跨平台路径：

| 函数 | macOS | Windows | Linux |
|------|-------|---------|-------|
| getDataRoot | `~/Library/Application Support/OmniUsage` | `%APPDATA%/OmniUsage` | `~/.config/OmniUsage` |
| getConfigPath | dataRoot + `/config.json` | 同左 | 同左 |
| getStatesDir | dataRoot + `/states` | 同左 | 同左 |
| getBundledPluginsDir | app `resources/plugins`（开发）或 `process.resourcesPath/plugins`（生产） | 同左 | 同左 |
| getUserPluginsDir | dataRoot + `/plugins` | 同左 | 同左 |
| getLogsDir | dataRoot + `/logs` | 同左 | 同左 |

注意事项：
- `app.getPath("userData")` 已经是跨平台的，直接使用
- 开发环境 vs 生产环境的 bundled plugins 路径不同
- `app` 对象只在 Electron main process 可用，测试时需要 mock

### 2. config/config-store.ts

```typescript
export interface AppConfigStore {
  load(): Promise<AppConfiguration>;
  save(config: AppConfiguration): Promise<void>;
}
```

AppConfiguration 类型（从 old-data-models.md 映射）：

```typescript
export interface AppConfiguration {
  readonly schemaVersion: number;    // 默认 1
  readonly language: AppLanguage;    // 默认 "zh-Hans"
  readonly overviewDisplayMode: "grouped" | "tabs"; // 默认 "tabs"
  readonly plugins: readonly PluginConfiguration[];
  readonly launchAtLogin: boolean;   // 默认 false
}

export interface PluginConfiguration {
  readonly id: string;               // UUID, 序列化时忽略
  readonly stateId: string;          // UUID, 用于缓存文件名
  readonly name: string;             // 默认 ""
  readonly enabled: boolean;         // 默认 true
  readonly executablePath: string;   // 默认 ""
  readonly refreshIntervalSeconds: number; // 默认 300
  readonly parameterValues: Readonly<Record<string, string>>; // 默认 {}
}
```

实现逻辑：
- `load()`：
  1. 读取 `getConfigPath()`
  2. 文件不存在 → 返回默认配置
  3. `JSON.parse` → 校验 schemaVersion
  4. 解析失败 → 返回默认配置（不崩溃）
- `save()`：
  1. `JSON.stringify(config, null, 2)`
  2. atomic write：写入 `{path}.tmp` → `fs.rename` 覆盖
  3. 目录不存在时自动创建

JSON 编码规则：
- `prettyPrinted`（2 空格缩进）
- `sortedKeys`（JSON.stringify 第三个参数无控制，手动 `Object.keys().sort()` 或用 replacer）
- `id` 字段不序列化（与旧项目一致）

### 3. cache/cache-store.ts

```typescript
export interface PluginCachedState {
  readonly updatedAt: string;  // ISO8601
  readonly items: readonly UsageItem[];
  readonly badge?: string;
  readonly chart?: PluginChart;
}

export interface CacheStore {
  load(stateId: string): Promise<PluginCachedState | null>;
  save(stateId: string, state: PluginCachedState): Promise<void>;
  delete(stateId: string): Promise<void>;
}
```

实现逻辑：
- 文件路径：`getStatesDir()` + `/{stateId}.json`
- `load()`：文件不存在返回 null
- `save()`：atomic write（同 config-store）
- `delete()`：`fs.unlink`，不存在不报错
- 目录不存在时自动创建

### 4. config/secrets-store.ts

```typescript
export interface SecretsStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
```

策略分阶段：
- **Phase 1（当前）**：明文 JSON 文件存储（`secrets.json`）
- **Phase 2（后续）**：迁移到系统原生 keychain

当前实现：
- 文件路径：`getDataRoot()` + `/secrets.json`
- 格式：`{ "key": "value" }` 纯 JSON
- atomic write
- secret 不进日志/错误消息/测试快照

### 5. plugin/instance.ts

```typescript
export interface PluginInstanceManager {
  createInstance(definition: PluginDefinition): PluginConfiguration;
  removeInstance(instanceId: string): void;
  duplicateInstance(instanceId: string): PluginConfiguration;
}

export interface PluginDefinition {
  readonly executablePath: string;
  readonly metadata: PluginMetadata | null;
}
```

实现逻辑：
- `createInstance`：生成 UUID stateId，创建默认 PluginConfiguration
- `removeInstance`：从配置中移除，删除缓存文件
- `duplicateInstance`：复制配置（新 UUID），不复制 secret 值

---

## 测试计划

### tests/integration/config/config-store.test.ts

| 测试用例 | 预期 |
|---------|------|
| 加载默认配置（文件不存在） | 返回 schemaVersion=1, language="zh-Hans", plugins=[] |
| 保存后加载 | 数据一致 |
| atomic write（模拟写入中断） | 旧文件不损坏 |
| 损坏的 JSON 文件 | 返回默认配置，不崩溃 |
| 保存后 id 不序列化 | JSON 文件中无 id 字段 |
| stateId 序列化 | JSON 文件中有 stateId 字段 |

### tests/integration/cache/cache-store.test.ts

| 测试用例 | 预期 |
|---------|------|
| load 不存在的 stateId | 返回 null |
| save 后 load | 数据一致 |
| delete 已存在的 | 成功，再次 load 返回 null |
| delete 不存在的 | 不报错 |
| 覆盖写入 | 新数据替换旧数据 |

### tests/integration/config/secrets-store.test.ts

| 测试用例 | 预期 |
|---------|------|
| get 不存在的 key | 返回 null |
| set 后 get | 值一致 |
| delete 后 get | 返回 null |
| secret 不出现在错误消息中 | 模拟错误时消息不含 secret 值 |

### tests/unit/paths.test.ts

| 测试用例 | 预期 |
|---------|------|
| getConfigPath 返回 .json 结尾 | 以 config.json 结尾 |
| getStatesDir 返回目录路径 | 以 states 结尾 |
| 各路径不含硬编码用户目录 | 使用 app.getPath |

---

## 精确行为约束

| 场景 | 行为 |
|------|------|
| config.json 不存在 | 返回默认配置（不报错） |
| config.json 损坏 | 返回默认配置（不崩溃） |
| states/ 目录不存在 | save 时自动创建 |
| secret 参数值 | 存入 secrets-store，不进 config.json |
| config 写入 | atomic write（tmp + rename） |
| id 字段 | 不序列化到 JSON（与旧项目一致） |

---

## 不实现

- 调度器 / 运行时状态
- UI / IPC
- 插件发现
- 旧配置迁移（标记为后续任务）

---

## 验收标准

- [ ] `pnpm test` 全部通过
- [ ] `pnpm check` 全绿
- [ ] 路径集中管理（paths.ts），无硬编码
- [ ] config 写入是 atomic（tmp + rename）
- [ ] secret 不进日志/错误消息/测试快照
- [ ] config.json 不存在时不崩溃
- [ ] config.json 损坏时不崩溃（返回默认配置）
- [ ] states/ 目录不存在时 save 自动创建
- [ ] CI 环境使用 mock secrets-store（不依赖 native keychain）

## 文件清单

### 新增文件

```
tests/unit/paths.test.ts
tests/integration/config/config-store.test.ts
tests/integration/cache/cache-store.test.ts
tests/integration/config/secrets-store.test.ts
```

### 修改文件

```
src/main/core/paths.ts（实现）
src/main/core/config/config-store.ts（实现）
src/main/core/config/secrets-store.ts（实现）
src/main/core/config/types.ts（AppConfiguration 等类型）
src/main/core/cache/cache-store.ts（实现）
src/main/core/cache/types.ts（PluginCachedState 类型）
src/main/core/plugin/instance.ts（实现）
```

### 不允许修改

```
src/shared/schemas/*（Round 4 已冻结）
src/main/core/plugin/metadata-parser.ts（Round 4 已完成）
src/main/core/plugin/output-parser.ts（Round 4 已完成）
src/main/core/plugin/command-builder.ts（Round 5 已完成）
src/main/core/plugin/runner.ts（Round 5 已完成）
src/main/core/scheduler/*（Round 7）
fixtures/*
docs/*
```

---

## 下一轮建议

Round 7：实现 scheduler / runtime store（调度层）
