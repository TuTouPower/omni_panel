# session_meta 迁至 renderer/lib 消除反向依赖

## 背景

`session_meta` 原定义在 `src/renderer/views/settings-view/lib.ts`，被 `src/renderer/components/AccountDialog.tsx` 导入，形成 `components → views` 反向依赖，破坏分层（components 不应依赖具体 view 的 lib）。

## 范围

- `session_meta` 常量从 `src/renderer/views/settings-view/lib.ts` 迁移到 `src/renderer/lib/session_meta.ts`（新文件，snake_case 命名遵循该目录现有惯例）。
- 更新 `src/renderer/components/AccountDialog.tsx` 的 import 路径。
- 从原 `settings-view/lib.ts` 移除该常量。

## 非范围

- 不动 `src/main/core/token-stats/opencode-reader.ts` 里的同名局部 `Map`。
- 不调整 `session_meta` 的内容、键、类型结构。
- 不迁移 `settings-view/lib.ts` 中其他常量/函数。

## 验收标准

- `session_meta` 定义位于 `src/renderer/lib/session_meta.ts`，类型签名不变（`Record<string, { login_url: string; cookie_names: string[] }>`）。
- `src/renderer/components/AccountDialog.tsx` 从新路径导入；全仓 grep 不再存在 `components` 对 `views/settings-view/lib` 中 `session_meta` 的 import。
- `src/renderer/views/settings-view/lib.ts` 不再导出 `session_meta`。
- typecheck 通过。
- `pnpm test` 全绿。
- 行为零变化（`login_url` / `cookie_names` 取值不变）。

## 实现摘要

- 新建 `src/renderer/lib/session_meta.ts`，原样导出常量。
- 从 `src/renderer/views/settings-view/lib.ts` 删除 `session_meta`。
- `AccountDialog.tsx` 改为 `import { session_meta } from "../lib/session_meta";`。
- 新增 `tests/unit/renderer/lib/session_meta.test.ts` 验证结构与已知值。

## 关联 task

- t124
