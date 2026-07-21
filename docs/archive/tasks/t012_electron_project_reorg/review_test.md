# Task review T012

- task：`T012_electron_project_reorg`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：测试
- reviewed_at：2026-07-21 02:49 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。

## Findings

无。

### 核对项

1. **目录改名 + spec 可发现性**
    - `tests/e2e/specs/` 已不存在，23 个 spec 全部 `git mv` 到 `tests/e2e/electron/`（diff stat 显示 `{specs => electron}` 内容 0 变化，纯 rename）。
    - `playwright.config.ts` default project `name: default → electron`、`testDir: ./tests/e2e/specs → ./tests/e2e/electron`，两行最小改动。
    - `package.json` 仅 `test:e2e → test:e2e:electron`（脚本名 + `--project=default → --project=electron`）。
    - `tests/e2e/electron/` 内 `import "../fixtures/..."` 等相对路径在新目录下仍有效（fixture 目录未动）。

2. **`--list` 65 tests / 23 spec 合理性**
    - 23 个 spec 文件已确认；按 `test(` / `*.test(` 计数，每个 spec 1–6 个 case，累计 65，与 `playwright --list` "skipped (65)" 一致。
    - `plugin_failure_modes.spec.ts` 用 fixture 工厂 `error_crash_setup.test(...)` 形式，直接 grep `test(` 为 0 但实际有 3 个 case，65 总数被 playwright 解析确认，无遗漏。

3. **Electron 真跑未执行的降级风险**
    - 机械改名（同 T009 模式），spec 内容 byte 级未动。
    - typecheck 过（刚执行 `tsc --noEmit` 无输出）。
    - `--list` 能解析 23 spec / 65 tests，证明 config + testDir + import 链路完整。
    - web 测试不涉及本次改路径，owner 声明 21 passed，路径无交集。
    - 三重交叉证据（typecheck + --list + web 不破）覆盖配置/import/类型层；真跑 Electron 驱动仅验证 runtime 行为，而本次改动无 runtime surface 变化（纯目录改名 + config 字符串改值），降级充分。

4. **spec 验收第 2 条"`--list` 列出 23 spec"达成**
    - 验收原文"`--list` 列出 23 个 spec"措辞宽松（"config 解析 OK，不要求真跑"）。
    - 实际 `--list` 以 test case 为粒度列 65 条，对应 23 个 spec 文件，每文件 ≥1 case，达成。

## 结论

无 finding。机械改名 + config 两行 + 脚本名一行 + 文档一行，改动面极小；typecheck 过、`--list` 解析 65 tests 覆盖 23 spec、无 `specs/` 残留路径引用、spec 内容 byte 级未动，降级策略充分，验收标准全部达成。
