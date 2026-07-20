# Task spec

## 背景

T010-T012 把 e2e 改造为 web（chromium + mock）/ electron（专属手动）/ packaged（smoke）三路。testing.md 分层表 + 命令清单已部分更新（T012 顺带改），但 T010 遗留两个待决项需收尾：(1) CI fixture 策略（fixture gitignore 致 CI 无法跑 web e2e）；(2) webServer 顶层污染其他 project。AGENTS.md `{test_cmd}` 引用 testing.md，需核对一致。

## 范围

- **CI web e2e 策略**：web e2e 依赖本机录制 fixture（gitignore），CI 跑不了。定策略——CI 跳过 web project（`--grep-invert` 或 project filter），仅本地跑；web e2e 不作 CI 门禁。
- **webServer 顶层污染**：评估是否拆 web project 独立 config，或保留顶层（接受 default/packaged 跑时也启 vite preview 的浪费）。优先低改动方案。
- **testing.md**：补 web e2e 章节说明（fixture 录制流程 + CI 策略 + 三路 project 对照）。
- **AGENTS.md**：`{test_cmd}` 引用 testing.md 不需改，核对 `docs/guides/testing.md` 路径引用一致。
- **handoff.md**：追加本次 e2e 改造的项目级交接（三路 e2e + fixture 录制 + Electron 专属手动跑）。

## 非范围

- 不改 src/ 运行时代码
- 不改 mock 基建（T010 已就位）
- 不补 web spec（T011 已迁，settings_view 拆拆迁留）
- 不重打包（图标 T014）

## 验收标准

- [ ] CI web e2e 策略明确（ci.yml 注释或 testing.md 说明 CI 跳过 web project）
- [ ] webServer 顶层决策记录（testing.md 或 ADR 说明保留理由，或拆 config）
- [ ] testing.md 补 web e2e 章节（录制 + CI + 三路对照）
- [ ] handoff.md 追加 e2e 改造交接段

## 依赖与约束

- 纯文档 task（除非 webServer 拆 config）
