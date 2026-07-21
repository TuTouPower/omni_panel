# Task plan

## 步骤与验证

1. 红：写 IPC handler 单测（app:buildInfo 返回 version+branch+commit）+ renderer 展示单测 → 验证：失败
2. scripts/gen-build-info.ts（读 git branch+SHA 写 src/generated/build-info.ts，dev 兜底）→ 验证：手动跑生成文件
3. src/generated/build-info.ts 占位兜底（gitignore）
4. main 进程注册 app:buildInfo handler（import buildInfo）
5. preload 暴露 usageboard.app.getBuildInfo()
6. renderer 设置页 about 段加 branch@commit 显示
7. package.json build 脚本前插 gen
8. .gitignore 加 src/generated/
9. 绿：测试通过 → 验证：pnpm test
10. 黑盒：pnpm test + pnpm check
11. 双审：render_review_prompts + 2 sub agent
12. finish + mv + commit

## 风险与回退

- generated 不存在导致 import 失败 → 仓库内保留一份占位 build-info.ts（commit 进库作 dev 兜底，.gitignore 改为只忽略构建期覆写？或占位入库 + 构建覆写不入库冲突）
- 折中：占位文件入库（让 import 总能解析），构建时 gen 脚本覆写，.gitignore 不忽略（每次 build 覆写占位）。或 gen 脚本始终写、占位入库、gitignore 忽略变化——但会导致 build 后 git 脏。
- 选定方案：占位 build-info.ts 入库（`{branch:"dev",commit:"dev"}`），构建期 gen 脚本覆写为真实值，打包用覆写值；dev 跑用占位。.gitignore 不忽略（让占位入库，覆写后若 git 脏可接受或 gen 脚本在 clean 状态跑）。
- 回退：分支可丢弃

## Finalization 时更新的 blueprint

- 无重大架构变更；decisions.md 可记一条 build-info 决策（可选）
