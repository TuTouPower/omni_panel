# p088 typecheck TS4111：local-api/server.ts 索引签名属性需 bracket 访问（2026-08-08）

- 来源：技术债自查（t261 实施期发现）
- 内容：`src/main/core/local-api/server.ts:323-325` 三处对索引签名类型属性用点号访问 `source` / `env` / `session_id`，TS4111 要求 `['source']` 等 bracket 形式。主仓与 worktree 均复现，`pnpm typecheck` 失败；文件不在 t261 diff 内，锚点 commit 已存在。
- 处理：已验证不存在（commit 23060e3f 修复 TS4111 bracket access）
