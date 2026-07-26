# Task spec

## 背景

t122 code_f002。`session_meta` 当前定义在 `src/renderer/views/settings-view/lib.ts:59`，被 `src/renderer/components/AccountDialog.tsx:8` 导入，形成 `components → views` 反向依赖，破坏分层（components 不应依赖具体 view 的 lib）。

注意：`src/main/core/token-stats/opencode-reader.ts:216` 存在同名局部变量 `session_meta`（main 进程内独立的 `Map`），与本 task 的 renderer 常量无关，不动。

## 范围

- 将 `session_meta` 常量从 `src/renderer/views/settings-view/lib.ts` 迁到 `src/renderer/lib/session_meta.ts`（新文件，snake_case 命名遵循该目录现有惯例，与 `auth-flow-registry.ts` 同属登录/凭证域）。
- 更新引用点 `src/renderer/components/AccountDialog.tsx` 的 import 路径。
- 从原 `settings-view/lib.ts` 移除该常量。

## 非范围

- 不动 `opencode-reader.ts` 里的同名局部 `Map`。
- 不调整 `session_meta` 的内容、键、类型结构。
- 不迁移 `settings-view/lib.ts` 中其他常量/函数。

## 验收标准

- [ ] `session_meta` 定义位于 `src/renderer/lib/session_meta.ts`，类型签名不变（`Record<string, { login_url: string; cookie_names: string[] }>`）。
- [ ] `src/renderer/components/AccountDialog.tsx` 从新路径导入；全仓 grep 不再存在 `components` 对 `views/settings-view/lib` 中 `session_meta` 的 import。
- [ ] `src/renderer/views/settings-view/lib.ts` 不再导出 `session_meta`。
- [ ] typecheck 通过。
- [ ] `pnpm test` 全绿。
- [ ] 行为零变化（login_url / cookie_names 取值不变）。

## 依赖与约束

- 无前置 task 依赖。
- 迁移纯搬运，不改逻辑。
