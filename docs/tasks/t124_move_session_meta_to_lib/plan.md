# Task plan

## 步骤与验证

1. 新建 `src/renderer/lib/session_meta.ts`，从 `settings-view/lib.ts:59-72` 原样剪切 `session_meta` 常量（含类型标注），导出。→ 验证：文件存在，导出类型签名与原来一致。
2. 从 `settings-view/lib.ts` 删除该常量，确认无残留。→ 验证：`grep -n "session_meta" src/renderer/views/settings-view/lib.ts` 无结果。
3. 改 `src/renderer/components/AccountDialog.tsx:8` import 为 `../../lib/session_meta`。→ 验证：编译通过。
4. 全仓 grep 确认无其他 renderer 文件从旧路径导入 `session_meta`。→ 验证：`grep -rn "session_meta" src/renderer` 只指向新路径；`opencode-reader.ts` 的同名局部 `Map` 不受影响。
5. 跑 typecheck 与 `pnpm test`。→ 验证：全部通过，无新增失败。

## 风险与回退

- 风险：漏改某个从旧路径 import 的文件，导致 typecheck 报错。
- 回退：改动仅限 3 个文件（新建 1、改 2），`git checkout -- <file>` 即可回退。

## Finalization 时更新的 blueprint

- 无（纯文件迁移，不改架构约定）。
