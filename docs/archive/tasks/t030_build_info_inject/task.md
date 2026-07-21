---
tid: t030
slug: build_info_inject
diff_anchor: "0167f66"
branch: t030_build_info_inject
---

# Task t030_build_info_inject

过程总账。

## 过程记录

- 需求：开发期无版本号，识别打包来源（branch+commit）。
- diff_anchor = 0167f66（t034 commit）。

## Review 处置

### Round 1 (2026-07-21 14:30 UTC+8)

| finding_id     | severity | status | rationale                                                                                                          | fix_ref                                 |
| -------------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| t030_code_f001 | critical | 已修   | .gitignore 加 src/generated/；start/build 前插 gen；占位不入库                                                     | .gitignore, package.json                |
| t030_code_f002 | minor    | 已修   | 静态 import electron，register 同步                                                                                | src/main/ipc/build-info-ipc.ts          |
| t030_code_f003 | minor    | 已修   | catch 改 log.warn                                                                                                  | src/renderer/views/SettingsView.tsx:721 |
| t030_code_f004 | minor    | 已修   | gen execSync 失败写 stderr                                                                                         | scripts/gen-build-info.ts               |
| t030_code_f005 | minor    | 已修   | gen 用 resolve(\_\_dirname,..) 不依赖 CWD（Round 2 注：execSync 未传 cwd，pnpm 默认 CWD 为 repo root，风险低接受） | scripts/gen-build-info.ts               |
| t030_test_f001 | minor    | 已修   | IPC 单测 vi.mock BUILD_INFO 固定 test_branch/test_commit，对调可测                                                 | tests/unit/ipc/build-info-ipc.test.ts   |

Round 2 code 复核 verdict PASS（f005 修不彻底但风险低不阻塞）。test Round 1 PASS。overall=PASS。

## 收尾报告

SHA 由 `git log --grep t030` 查。

### 验收标准勾选

- [x] `pnpm build` 生成 src/generated/build-info.ts（gen 脚本 `tsx scripts/gen-build-info.ts` 前置）
- [x] IPC `app:buildInfo` 返回 version + branch + commit（handleBuildInfo 单测覆盖）
- [x] 设置页版本号下方显示 `branch@commit`（settings_view 组件测断言 `t030_test@abc1234`）
- [x] src/generated/ 在 .gitignore，不入库（`git ls-files src/generated/` 空）
- [x] IPC handler 单测 + renderer 单测通过
- [x] pnpm test 1432 绿；typecheck 绿；check 仅余 pre-existing knip 警告（@resvg/resvg-js/png-to-ico，t014 图标脚本动态用，非本 task 引入）

### Reviewer verdict

- Round 1 code：FAIL（5 finding）→ Round 2 code：PASS
- Round 1 test：PASS

### 遗留

- `pnpm check` 报 `@resvg/resvg-js`/`png-to-ico` unused（knip），t014 render_icon.mjs 动态用，pre-existing，非本 task 引入。

### 结果摘要

打包产物嵌入 git branch@commit：gen 脚本构建期写 src/generated/build-info.ts（gitignore 不入库），main 进程 IPC 暴露，设置页关于段版本号下方显示 `branch@commit`。dev 期 `pnpm start` 也跑 gen 显示当前分支。双审 Round 2 PASS。
