# Round 3: Electron 项目骨架 + 测试框架

> 日期：2026-05-24
> 依赖：Phase 1 完成（docs/schemas/fixtures 已就绪）
> 产出：可运行的 Electron 空壳 + 所有空模块 + failing tests

---

## 目标

创建 Electron + TypeScript 项目骨架，建立目录结构和测试框架。创建所有后续 round 的空模块和对应的 failing tests。不实现业务逻辑。

---

## 技术栈

| 工具                        | 版本/配置           |
| --------------------------- | ------------------- |
| Electron                    | latest stable       |
| Electron Forge              | 脚手架 + 打包       |
| @electron-forge/plugin-vite | Vite 集成           |
| TypeScript                  | latest, strict 超集 |
| Vite                        | latest              |
| React                       | 18+                 |
| Vitest                      | 单元/集成测试       |
| Zod                         | schema 校验         |

---

## 目录结构创建

```
src/
├── main/
│   ├── index.ts                    # Electron 入口（最小化：创建 BrowserWindow）
│   └── core/
│       ├── plugin/
│       │   ├── metadata-parser.ts  # 空导出
│       │   ├── output-parser.ts    # 空导出
│       │   ├── command-builder.ts  # 空导出
│       │   ├── runner.ts           # 空导出
│       │   ├── instance.ts         # 空导出
│       │   ├── discovery.ts        # 空导出
│       │   └── types.ts            # 空类型定义
│       ├── config/
│       │   ├── config-store.ts     # 空导出
│       │   ├── secrets-store.ts    # 空导出
│       │   └── types.ts            # 空类型定义
│       ├── cache/
│       │   ├── cache-store.ts      # 空导出
│       │   └── types.ts            # 空类型定义
│       ├── scheduler/
│       │   ├── plugin-scheduler.ts # 空导出
│       │   ├── runtime-store.ts    # 空导出
│       │   ├── refresh-service.ts  # 空导出
│       │   └── types.ts            # 空类型定义
│       └── paths.ts                # 空导出
├── preload/                        # 空目录，Round 8 填充
├── renderer/                       # 空目录，Round 9 填充
└── shared/
    ├── schemas/
    │   ├── plugin-output.ts        # 空导出
    │   ├── plugin-metadata.ts      # 空导出
    │   └── index.ts
    ├── types/
    │   ├── plugin.ts               # 空类型
    │   ├── config.ts               # 空类型
    │   └── ipc.ts                  # 空类型
    ├── errors/
    │   ├── plugin-errors.ts        # 空错误类
    │   └── index.ts
    └── constants.ts
```

---

## 空模块格式

每个空模块导出占位函数/类型，使 import 不报错但测试会失败：

```typescript
// src/main/core/plugin/output-parser.ts
export function parsePluginOutput(_stdout: string): never {
    throw new Error("Not implemented");
}
```

```typescript
// src/main/core/plugin/types.ts
export interface PluginCommand {
    command: string;
    args: string[];
}
// 其他类型留空，Round 4 填充
```

---

## Electron 安全默认值

`src/main/index.ts` 的 BrowserWindow 配置：

```typescript
const mainWindow = new BrowserWindow({
    webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
    },
});
```

---

## 配置文件

### tsconfig.json

完整严格配置（见架构 spec 第 4.2 节）。关键标志：

- `strict: true`
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`
- `verbatimModuleSyntax: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`

### vitest.config.ts

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["tests/**/*.test.ts"],
        globals: true,
    },
});
```

---

## Failing Tests

Round 3 只验证空模块能正确 import 和抛出 "Not implemented"：

```typescript
// tests/unit/smoke.test.ts
import { describe, it, expect } from "vitest";
import { parsePluginOutput } from "../../src/main/core/plugin/output-parser";
import { parsePluginMetadata } from "../../src/main/core/plugin/metadata-parser";
import { buildPluginCommand, executePlugin } from "../../src/main/core/plugin/runner";
// ... 所有核心模块

describe("smoke: modules are importable", () => {
    it("parsePluginOutput throws Not implemented", () => {
        expect(() => parsePluginOutput("{}")).toThrow("Not implemented");
    });
    it("parsePluginMetadata throws Not implemented", () => {
        expect(() => parsePluginMetadata("")).toThrow("Not implemented");
    });
    // ... 每个核心模块一个 smoke test
});
```

---

## 复制 Phase 1 产物

以下文件从项目根目录复制到 Electron 项目对应位置（如果 Electron 项目在子目录）或保持原位：

- `docs/*` — 所有文档
- `schemas/*` — JSON Schema 文件
- `fixtures/**/*` — 所有 fixture

---

## 输出

（无额外产出。实现计划见 `docs/superpowers/plans/2026-05-24-phase2-core-implementation.md`）

---

## 验收标准

- [ ] `pnpm install` 成功
- [ ] `pnpm typecheck` exit 0
- [ ] `pnpm test` exit 0（smoke tests 通过）
- [ ] `pnpm start` 能启动 Electron 窗口
- [ ] BrowserWindow: `contextIsolation: true`、`nodeIntegration: false`
- [ ] 所有核心模块有空导出文件
- [ ] docs / schemas / fixtures 可访问

## 文件清单

### 新增文件

```
src/main/index.ts
src/main/core/plugin/metadata-parser.ts
src/main/core/plugin/output-parser.ts
src/main/core/plugin/command-builder.ts
src/main/core/plugin/runner.ts
src/main/core/plugin/instance.ts
src/main/core/plugin/discovery.ts
src/main/core/plugin/types.ts
src/main/core/config/config-store.ts
src/main/core/config/secrets-store.ts
src/main/core/config/types.ts
src/main/core/cache/cache-store.ts
src/main/core/cache/types.ts
src/main/core/scheduler/plugin-scheduler.ts
src/main/core/scheduler/runtime-store.ts
src/main/core/scheduler/refresh-service.ts
src/main/core/scheduler/types.ts
src/main/core/paths.ts
src/shared/schemas/plugin-output.ts
src/shared/schemas/plugin-metadata.ts
src/shared/schemas/index.ts
src/shared/types/plugin.ts
src/shared/types/config.ts
src/shared/types/ipc.ts
src/shared/errors/plugin-errors.ts
src/shared/errors/index.ts
src/shared/constants.ts
tests/unit/smoke.test.ts
vitest.config.ts
```

### 不允许修改

```
docs/*
schemas/*
fixtures/*
TASKS.md
CLAUDE.md
```

---

## 下一轮建议

Round 3.5：配置严格代码质量门禁（ESLint + Prettier + Knip + dependency-cruiser + Husky）
