# p142 designmd drift 门禁测试存量失败

- 来源：t305 遗留
- 内容：`tests/unit/main/scripts/designmd.test.ts`「真实 globals.css 导出区与 DESIGN.md 一致（AC5 drift 门禁）」存量失败（主仓与 worktree 均复现）：`check_drift()` 返回 false，说明 `src/renderer/styles/globals.css` 导出区与 `DESIGN.md` 已漂移。t305 未触碰该两文件（diff 0 行），属既有漂移；需定位漂移来源（样式 token 变更未同步 DESIGN.md），修复 `DESIGN.md` 或导出区后恢复门禁。
- 处理：未开
