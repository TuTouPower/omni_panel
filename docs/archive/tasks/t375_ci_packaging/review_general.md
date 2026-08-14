# Task review t375（reviewer_focus: 通用）

- task：`t375_ci_packaging`
- spec：`docs/tasks/t375_ci_packaging/spec.md`
- diff_anchor：`dcfd08302cc45724b7127bb7bcac2cce5cdadf45`
- target：`git diff dcfd08302cc45724b7127bb7bcac2cce5cdadf45`
- round：1
- reviewed_at：2026-08-15 02:05 UTC+8

## Findings

### t375_gen_f001 - README Linux 安装说明仍宣传 `.rpm`，与生产产物不一致

- 严重度：minor
- 锚点：AC-002（release 清单与实际产物一致）+ 文档一致性
- 位置：`README.md:52`
- 问题：AC-002 已确认生产 electron-builder.yml linux target 仅 AppImage+deb（`electron-builder.yml:58-61`），release.yml 两处 `*.rpm` 上传项已删。但 `README.md:52`「Linux：`OmniPanel-x.y.z.AppImage` / `.deb` / `.rpm`」仍把 `.rpm` 列为可用安装包，属过期描述。该行不在本 diff 内（预存遗留），但本 task 使「生产不产出 rpm」成为显式事实，README 与其矛盾。
- 建议：顺手删除 README 中 `.rpm`（或改注「rpm 仅测试配置产出」）。非 blocking，可并入 follow-up。

## 结论

- 前轮 finding 复核：Round 1 无前轮。
- 本轮新发现：1 条（minor）
- 未进表的提示：
  - `scripts/package-and-run.ts:63-71` force-kill 段 `execSync` 调用被 prettier 重排换行格式，与本 task 三 AC 无关、行为无变化（疑似 lint-staged 自动格式化产物），范围外触碰，无害。
  - 实测验证：新增测试 2/2 通过（`vitest run tests/unit/main/scripts/package-and-run.test.ts`）；`eslint` 与 `tsc --noEmit` 均通过；`tsx` 下 `process.argv[1]` 解析为绝对路径、与 `import.meta.url` 经 `pathToFileURL` 比对匹配（main 守卫 CLI 直跑不失效，与 `token-stats-baseline.ts:361` 先例一致）。
- 总体判断：三 AC 均按 spec 实现。AC-001 `shell: bash` 仅加在 Verify step（矩阵含 windows-2022 与 ubuntu-latest，windows 默认 pwsh 无 `test` 语义，ubuntu 默认即 bash 不受影响，修正最小且正确）；AC-002 两处（upload-artifact 清单 + action-gh-release files 清单）均已删 `*.rpm`，全仓其它生产路径无 rpm 引用（仅 `electron-builder.test.yml:64` 测试配置保留，非生产）；AC-003 try/finally 语义正确（含首个 ensure electron 调用失败也走 finally 恢复 Node，为安全态），`--no-build` 路径不触发 ABI 切换（与原行为一致），run_packaged 使用打包内嵌副本不受 dev ABI 切换影响。测试触达可观察行为（execSync 命令序列）且能拦截回归——若去掉 finally，失败路径 `restore_calls` 断言（=1）必失败。AC-001/002 为 `[deploy]` 配置改动，spec「有意不测」已声明 CI workflow 语法不本地单测，不据此出覆盖缺口。仅 1 条 minor，PASS。
- 系统性 follow-up：建议标题「README Linux 安装项移除 rpm（AC-002 收尾一致性）」；无既有 tid。

verdict: PASS
reviewed_scope: 59931d9f56db9994
