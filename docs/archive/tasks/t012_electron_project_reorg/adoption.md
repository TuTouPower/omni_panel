# Adoption T012

逐条处置 `review_code.md` 和 `review_test.md` 的 finding。流程见 AGENTS.md step 7。

| finding_id     | decision | rationale                                                        | status   |
| -------------- | -------- | ---------------------------------------------------------------- | -------- |
| T012_code_f001 | 采纳     | CI/testing.md/README 4 处引用已删的 `pnpm test:e2e`，CI 必红；改 | 已修     |
| T012_test_f001 | 无       | review_test 0 finding                                            | 无需修改 |

## 处置说明

- **T012_code_f001（已修，触 CI + 文档）**：owner 之前 grep 漏 `test:e2e` 字面量（只搜 `project=default`/`e2e/specs`）。reviewer 捕获 4 处活跃引用：
    - `.github/workflows/ci.yml:68` `pnpm test:e2e` → `pnpm test:packaged`（CI 在 `pnpm package` 后，package 产物已就绪，smoke 验证 exe，跨平台不需 Xvfb/Electron ABI）
    - `.github/workflows/nightly.yml:32` `pnpm test:e2e` → `pnpm test:e2e:electron`（nightly 带 Xvfb 跑 Electron 驱动专属能力）
    - `docs/guides/testing.md:10` 单行 `test:e2e` → 拆三路（web/electron/packaged）
    - `README.md:78` 同上拆三路
    - archive 内历史引用不动。改后 `grep pnpm test:e2e\b`（活跃）0 残留。
- **T012_test（无需修改）**：0 finding。
