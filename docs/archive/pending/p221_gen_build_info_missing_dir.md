# p221 gen-build-info 在无 src/generated 目录时崩溃

- 来源：t451 顺手发现（新鲜 worktree 必现；`src/generated/` 被 gitignore，`pnpm install` 后不存在）
- 内容：`npx tsx scripts/gen-build-info.ts` 直接 `writeFileSync('src/generated/build-info.ts')`，目录不存在时 ENOENT 崩溃（t451 worktree 实测两次）。修法：脚本内 `mkdirSync(..., {recursive:true})`。影响：每个新 worktree 需手工 `mkdir -p`，否则 typecheck/build-info 相关测试整批挂。
- 处理：main
