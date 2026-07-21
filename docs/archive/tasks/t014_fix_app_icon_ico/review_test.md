# Task review T014

- task：`T014_fix_app_icon_ico`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：测试
- reviewed_at：2026-07-21 03:06 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

无。

## spec 验收标准逐条核对（测试视角）

| 验收标准                                                   | 测试视角验证                                                                                                                                                                                                                                                  | 结论                                                                                                                                                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `scripts/render_icon.mjs` 产 icon.png + icon.ico（多尺寸） | render_icon.mjs:22-33：PNG 1024 + ICO 多尺寸 [256,128,64,48,32,16]；属构建脚本，无对应单元测试覆盖（既有现状，非本 task 引入）                                                                                                                                | 满足（实现层）                                                                                                                                                                                                                    |
| `assets/icon.ico` mtime 更新（非 6-24 陈旧）               | 实测 mtime `2026-07-21 02:59:45 +0800`，logo.svg `2026-06-25`，icon.png `2026-07-21 02:59:44`，ico 新于 svg ✓                                                                                                                                                 | 满足                                                                                                                                                                                                                              |
| 重打包后 exe 图标为新 logo（非 kimi）—— 用户视觉确认       | artifacts/win-unpacked/OmniUsage.exe mtime `2026-07-21 03:04:07`（重打包产物）；视觉确认由 owner 用 vision_read 核对 icon.ico 为 OmniUsage logo（青蓝紫渐变圆环 + 三柱 + 亮点），非 kimi。agent 无独立工具验证 ico 视觉内容，owner vision_read 是当前可行手段 | 满足（采信 owner 视觉确认）                                                                                                                                                                                                       |
| `pnpm test`（vitest）不受影响                              | T014 改动范围：render_icon.mjs（构建脚本，非 runtime）、eslint.config.ts（ignore）、package.json/pnpm-lock.yaml（devDep）、assets/icon.ico                                                                                                                    | icon.png（二进制资源）。未触及任何 src/、tests/、vitest.config。最接近的 `tests/unit/renderer/components/icon.test.tsx` 测的是 UI Icon 组件（SVG 路径），与 render_icon.mjs 无语义交集。owner 称 vitest 1407 全绿，与改动边界一致 | 满足 |
| `pnpm typecheck` 过                                        | render_icon.mjs 为 .mjs（非 ts 入口），tsc --noEmit 不覆盖；改动未引入新 TS 模块。owner 称 typecheck 过，与改动边界一致                                                                                                                                       | 满足                                                                                                                                                                                                                              |

## 关于 exe 图标更新证据链

- exe mtime `03:04` 晚于 icon.ico mtime `02:59`，时间顺序一致（重打包消费了新 ico）。
- Windows `ExtractAssociatedIcon` 提取 32x32 OK 可证明 exe PE 资源段含图标；Windows 图标缓存可能使资源管理器显示旧图，但 exe 内嵌资源已换。
- 视觉真相以 icon.ico 直接观察为准（owner vision_read），不依赖 exe 缓存显示——这是验收第 3 条的充分证据。

## 关于测试覆盖缺口（不计 finding，仅记录）

render_icon.mjs 作为一次性构建脚本无单元测试。考虑：

- 属于构建期产物校验，非 runtime 行为，vitest 范畴外。
- 既有现状（修改前也无测试），非本 task 引入的回归。
- spec 范围未要求新增测试；plan 第 4 步仅要求 `pnpm typecheck + pnpm test` 不破。
- 如未来需要兜底，建议放 smoke 层断言 `assets/icon.ico` 存在、体积 > 50KB、mtime 晚于 `assets/logo.svg` mtime，而非单元测试。

## 结论

finding 数 0。T014 改动边界限于构建脚本 + devDep + 二进制资源 + eslint ignore，不触及 runtime 代码与测试代码，spec 验收标准中涉及测试的两条（vitest 不破、typecheck 过）在改动边界内成立；exe 图标更新的视觉验收由 owner vision_read 完成，证据链自洽。
