# 覆盖率基线

> 初始基线日期：2026-05-30
> 工具：vitest + @vitest/coverage-v8
> 命令：`pnpm test:coverage`

---

## 总体覆盖率

| 指标       | 覆盖率 |
| ---------- | ------ |
| Statements | 6.13%  |
| Branches   | 27.47% |
| Functions  | 25.58% |
| Lines      | 6.13%  |

**说明**：集成测试通过子进程运行插件（`ELECTRON_RUN_AS_NODE=1`），不计入 v8 覆盖率。覆盖率仅反映 vitest 进程内直接 import 的代码。

---

## 分目录覆盖率

| 目录               | Lines  | Statements | Functions | Branches | 备注       |
| ------------------ | ------ | ---------- | --------- | -------- | ---------- |
| `src/main/`        | 3.21%  | 3.21%      | 10.34%    | 12.24%   | 补测试候选 |
| `src/renderer/`    | 0%     | 0%         | 0%        | 0%       | 补测试候选 |
| `src/plugins/sdk/` | 0.47%  | 0.47%      | 46.15%    | 42.85%   | 补测试候选 |
| `src/shared/`      | 38.54% | 38.54%     | 25%       | 62.5%    | 补测试候选 |

所有目录均低于 80%，均为补测试候选。

---

## 主要覆盖来源

覆盖主要来自单元测试直接 import 的模块：

- `src/shared/schemas/plugin-metadata.ts` — 100%
- `src/shared/constants.ts` — 100%
- `src/main/core/plugin/runner.ts` — 62.16% lines
- `src/main/core/plugin/command-builder.ts` — 77.77% lines
- `src/shared/lib/logger.ts` — 37.66% lines

---

## 阈值设定

基于基线 -5%，防止 CI 阻塞同时阻止退化：

| 指标       | 基线   | 阈值 |
| ---------- | ------ | ---- |
| Statements | 6.13%  | 1%   |
| Branches   | 27.47% | 22%  |
| Functions  | 25.58% | 20%  |
| Lines      | 6.13%  | 1%   |
