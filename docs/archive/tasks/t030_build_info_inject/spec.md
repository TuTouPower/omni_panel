# Task spec

## 背景

开发期无版本号，需识别电脑上运行的软件具体是哪次打包（branch + commit）。打包产物嵌入 build-info，设置页版本号下方显示 `branch@commit`。

## 范围

- `scripts/gen-build-info.ts`：读 git branch + short SHA，写 `src/generated/build-info.ts`（`export const buildInfo = { branch, commit }`）
- `package.json`：`build` 脚本前插入 gen 步骤
- `src/generated/build-info.ts`：构建产物（gitignore，不入库）；开发期兜底（无 git 时占位）
- main 进程 IPC handler `app:buildInfo`：返回 `{ version: app.getVersion(), ...buildInfo }`
- preload：暴露 `getBuildInfo()` 到 `window.usageboard.app`
- renderer 设置页 about 段：版本号下方加一行 `branch@commit`
- `.gitignore`：加 `src/generated/`
- 测试：IPC handler 单测 + renderer 展示单测

## 非范围

- 不加 build time（只 branch + commit）
- 不改打包产物结构（asar 内联即可）

## 验收标准

- [ ] `pnpm build` 生成 src/generated/build-info.ts
- [ ] IPC `app:buildInfo` 返回 version + branch + commit
- [ ] 设置页版本号下方显示 `branch@commit`
- [ ] src/generated/ 在 .gitignore，不入库
- [ ] IPC handler 单测 + renderer 单测通过
- [ ] pnpm test / pnpm check 绿

## 依赖与约束

- 测试用 vitest（单测层）
- generated 文件 dev 兜底：gen 脚本失败时写占位让 dev 能跑
