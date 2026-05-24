# Round 4: Parser 实现

> 日期：2026-05-24
> 依赖：Round 3（骨架）+ Round 3.5（质量门禁）
> 产出：metadata-parser + output-parser + Zod schemas + 全部 fixture 测试通过

---

## 目标

实现两个纯函数 parser 和 Zod schema 定义。通过 Phase 1 产出的所有 fixture 测试。不涉及子进程、文件系统、UI。

---

## 交付物

### 1. shared/schemas/plugin-output.ts

Zod schema，source of truth。所有类型从 schema 推断。

```typescript
// 核心 schema（见架构 spec 3.1 节完整定义）
export const usageItemSchema = z.object({ ... });
export const pluginChartSchema = z.object({ ... });
export const pluginOutputSchema = z.object({ ... });
export const pluginErrorOutputSchema = z.object({ ... });

// 导出类型
export type UsageItem = z.infer<typeof usageItemSchema>;
export type PluginOutput = z.infer<typeof pluginOutputSchema>;
export type PluginChart = z.infer<typeof pluginChartSchema>;
export type PluginErrorOutput = z.infer<typeof pluginErrorOutputSchema>;
```

关键细节：
- `status` 字段 `.default("unknown")` 匹配旧项目默认值
- `displayStyle` 枚举：`"percent" | "ratio"`
- `color` 枚举：`"blue" | "green" | "yellow" | "orange" | "red"`（optional）
- `bucketUnit` 枚举：`"hour" | "day"`
- `updatedAt` 用 `z.string()` 而非 `z.string().datetime()`，因为旧插件输出格式可能不完全符合 ISO8601
- `schemaVersion` 用 `z.number()`，不要求为整数

### 2. shared/schemas/plugin-metadata.ts

处理 `@lang` 动态 key 的挑战。使用 `.catchall(z.string())` 允许额外翻译 key。

```typescript
export const pluginParameterMetadataSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: pluginParameterTypeSchema,
  required: z.boolean(),
  placeholder: z.string().optional(),
  defaultValue: z.string().optional(),
  options: z.array(pluginParameterOptionWithTranslationsSchema).optional(),
}).catchall(z.string());

export const pluginMetadataSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  parameters: z.array(pluginParameterMetadataSchema).optional(),
}).catchall(z.string());
```

关键细节：
- `catchall(z.string())` 允许 `name@zh-Hans`、`description@en` 等动态 key
- 解析后需要从动态 key 提取翻译到 `translations` 字典（由 parser 处理）
- `PluginParameterType` 枚举：`"string" | "secret" | "integer" | "boolean" | "choice" | "directory" | "file"`

### 3. shared/types/plugin.ts

从 Zod 推断的核心类型 + 补充类型：

```typescript
export type AppLanguage = "zh-Hans" | "en";
export type PluginSnapshotState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; ... }
  | { readonly status: "failed"; ... };
```

### 4. shared/errors/plugin-errors.ts

错误类层次（见架构 spec 3.3 节）。

### 5. plugin/metadata-parser.ts

```typescript
import type { PluginMetadata } from "../../shared/schemas/plugin-metadata";

export function parsePluginMetadata(content: string): PluginMetadata | null;
```

实现逻辑：
1. 取 content 按 `\n` 分割，取前 80 行
2. 遍历找 `UsageBoardPlugin:` 开始标记
   - 去除行首空白
   - 去除 `#` 前缀和紧随空格
   - 检查是否以 `UsageBoardPlugin:` 开头
3. 开始标记同行如有额外内容，也收集
4. 继续收集直到 `/UsageBoardPlugin` 结束标记
5. 每行 `stripCommentPrefix`：去除 `#` 和紧随空格
6. 拼接收集内容 → `JSON.parse`
7. `pluginMetadataSchema.safeParse` 校验
8. 提取动态翻译 key（`name@zh-Hans` 等）到结构化数据

返回值：
- `null`：无 marker / JSON 解析失败 / schema 校验失败（静默）
- `PluginMetadata`：成功

### 6. plugin/output-parser.ts

```typescript
import type { PluginOutput } from "../../shared/schemas/plugin-output";
import type { PluginErrorOutput } from "../../shared/schemas/plugin-output";

export function parsePluginOutput(stdout: string): PluginOutput;
export function parsePluginOutputOrError(stdout: string): PluginOutput | PluginErrorOutput;
```

实现逻辑：
1. `stdout.trim()`
2. `JSON.parse()` — 失败抛 `PluginOutputParseError`
3. `pluginErrorOutputSchema.safeParse()` — 匹配返回 `PluginErrorOutput`
4. `pluginOutputSchema.safeParse()` — 匹配返回 `PluginOutput`
5. 都不匹配抛 `PluginSchemaError`

### 7. schema:export 脚本

`scripts/export-schemas.ts`：

```typescript
import { zodToJsonSchema } from "zod-to-json-schema";
import { pluginOutputSchema } from "../src/shared/schemas/plugin-output";
import { pluginMetadataSchema } from "../src/shared/schemas/plugin-metadata";
import fs from "node:fs";

fs.writeFileSync(
  "schemas/plugin-output.schema.json",
  JSON.stringify(zodToJsonSchema(pluginOutputSchema), null, 2),
);
fs.writeFileSync(
  "schemas/plugin-metadata.schema.json",
  JSON.stringify(zodToJsonSchema(pluginMetadataSchema), null, 2),
);
```

---

## 测试计划

### tests/unit/plugin/output-parser.test.ts

| 测试用例 | 输入 fixture | 预期 |
|---------|-------------|------|
| 成功解析基础输出 | `success-basic.json` | PluginOutput, items.length > 0 |
| 解析带 badge | `success-with-badge.json` | badge 字段存在 |
| 解析带 chart | `success-with-chart.json` | chart.buckets.length > 0 |
| 解析空 items | `success-empty-items.json` | items.length === 0 |
| 解析 error JSON | `error-json-field.json` | PluginErrorOutput, error 非空 |
| 非 JSON 输入 | `invalid-json.txt` | 抛 PluginOutputParseError |
| 缺少必填字段 | `invalid-missing-required-field.json` | 抛 PluginSchemaError |
| 类型错误 | `invalid-wrong-type.json` | 抛 PluginSchemaError |

### tests/unit/plugin/metadata-parser.test.ts

| 测试用例 | 输入 fixture | 预期 |
|---------|-------------|------|
| 基础 metadata | `metadata-basic.py` | PluginMetadata, parameters.length > 0 |
| secret 参数 | `metadata-with-secret.py` | 参数 type === "secret" |
| choice 参数 | `metadata-with-choice.py` | 参数 options.length > 0 |
| 缺少结束标记 | `metadata-missing-end-marker.py` | null |
| JSON 解析失败 | `metadata-invalid-json.py` | null |
| 超过 80 行 | `metadata-after-line-80.py` | null（80 行限制） |

### tests/unit/shared/schemas.test.ts

验证 Zod schema 与 JSON Schema fixture 的一致性。

---

## 精确行为约束（来自 unconfirmed.md 全保守策略）

| 场景 | 行为 |
|------|------|
| stdout 有非 JSON 文本 | trim 后整体解析，失败报错（不做行级容错） |
| schemaVersion 字段 | Zod 接受任何 number，不强制为 1 |
| 80 行限制 | 严格执行，超 80 行的 metadata 返回 null |
| JSON 解析失败 | 返回 null（静默），不抛异常 |
| marker 存在但 JSON 错误 | 返回 null（静默） |

---

## 不实现

- child_process / plugin runner
- 文件系统读写
- UI
- IPC

---

## 验收标准

- [ ] `pnpm test` 全部通过（14 个测试用例）
- [ ] `pnpm check` 全绿
- [ ] 所有 fixture 文件被测试引用
- [ ] parser 是纯函数（无副作用、无 fs、无 child_process）
- [ ] `schema:export` 生成的 JSON Schema 与 Phase 1 的 schema 文件结构一致
- [ ] Zod 为 source of truth，JSON Schema 由 Zod 导出（单源维护）

## 文件清单

### 新增文件

```
scripts/export-schemas.ts
tests/unit/plugin/metadata-parser.test.ts
tests/unit/plugin/output-parser.test.ts
tests/unit/shared/schemas.test.ts
```

### 修改文件

```
src/shared/schemas/plugin-output.ts（Zod schema 实现）
src/shared/schemas/plugin-metadata.ts（Zod schema 实现）
src/shared/schemas/index.ts（导出聚合）
src/shared/types/plugin.ts（从 Zod 推断类型）
src/shared/types/config.ts（AppLanguage 等）
src/shared/errors/plugin-errors.ts（错误类实现）
src/shared/errors/index.ts（导出聚合）
src/main/core/plugin/metadata-parser.ts（实现）
src/main/core/plugin/output-parser.ts（实现）
src/main/core/plugin/types.ts（PluginCommand 等类型）
schemas/plugin-output.schema.json（从 Zod 导出覆盖）
schemas/plugin-metadata.schema.json（从 Zod 导出覆盖）
package.json（添加 schema:export 脚本、zod-to-json-schema 依赖）
```

### 不允许修改

```
src/main/core/plugin/runner.ts（Round 5）
src/main/core/plugin/command-builder.ts（Round 5）
src/main/core/config/*（Round 6）
src/main/core/cache/*（Round 6）
src/main/core/scheduler/*（Round 7）
src/main/core/paths.ts（Round 6）
fixtures/*
docs/migration-principles.md
docs/plugin-contract.md
```

---

## 下一轮建议

Round 5：实现 plugin runner（command-builder + runner + fake plugins）
