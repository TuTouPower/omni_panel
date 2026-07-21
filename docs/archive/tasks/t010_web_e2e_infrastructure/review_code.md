# Task review T010

- task：`T010_web_e2e_infrastructure`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：文档+代码
- reviewed_at：2026-07-21 02:14 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

### T010_code_f001 — gen_fixture 脱敏路径与 spec 约定不一致（实现黑名单 vs spec 白名单）

- 严重度：medium
- 位置：`scripts/e2e/gen_fixture.mjs:31-46`；对照 `spec.md:33`
- 问题：spec 第 33 行约定 `gen_fixture 读 secrets.json 仅取 instanceId 列表，value 用占位 ***`（白名单：只导 instanceId）。实现走的是另一条路：通过 local-api `/v1/secrets` 拉响应，再用正则 `/(secret|password|token|cookie|key|bearer|credential)/i` 递归替换字符串字段（黑名单）。
    - 正则不覆盖 `passwd` / `pwd` / `auth` / `authorization` / `cert` / `privKey` / `accessKey`（其中 `accessKey`、`privKey` 含 `key` 实际命中）等非标准命名。项目目前实际字段（`cpa_mgmt_key`、`apiKey` 等）均含 `key`，被覆盖；owner 也实测 `cpa_mgmt_key → ***`。
    - 实质达成 spec 的"不导出明文 secret"目标，但实现方式与 spec 文字偏离，且严格度低于白名单。
- 建议：二选一。
    1. 把实现改为与 spec 一致的白名单：`/v1/secrets` 响应只保留 `instanceId`，secrets map 整体替换为各 key 对应的 `***`（保持 key 列表，便于 mock 真实结构）。
    2. 或修订 spec（及若有的 `docs/specs/web-e2e-infrastructure.md`）反映当前黑名单实现，并在 `docs/blueprint/decisions.md` 记一条决策（理由：local-api 响应结构比 `secrets.json` 磁盘结构更贴近 SPA 真实视图）。
    - owner adoption 决定方向；测试侧重结构正确即可。

### T010_code_f002 — vite preview 改为内嵌 middleware 而非 spec 所写的 preview.proxy

- 严重度：low
- 位置：`tests/e2e/fixtures/vite_mock_plugin.mjs:1-26`；`vite.web.config.ts:23`；对照 `spec.md:11`
- 问题：spec 第 11 行约定 `vite.web.config.ts 加 preview.proxy 把 /v1 转发到 mock server`（双进程：vite preview + mock_server）。实现改为 `mock_api_plugin` 内嵌 middleware（单进程），mock_server.mjs 仍保留独立 main 作备选。
    - 实现方案更优：省一个 webServer 进程、playwright config 只需起一个 vite preview、启动/端口管理更简单。
    - 但与 spec 文字不一致，且 spec 未提及 `vite_mock_plugin.mjs` 这个新文件。
- 建议：修订 spec 描述（preview.proxy → vite plugin middleware），并在 spec/plan 里补一行说明单进程方案的动机。代码不改。

### T010_code_f003 — mock_server 多实例 state/secrets 的 fallback 返回首条记录

- 严重度：low
- 位置：`tests/e2e/fixtures/mock_server.mjs:13-15, 33-44`
- 问题：`find_by(prefix)` 在精确 key 未命中时返回首条以 prefix 开头的记录。若某个 instance 的 state/secrets 未录全（例如 gen_fixture 录制时该实例 offline），所有未命中 instance 的请求都会拿到 instances[0] 的 state，结构对但数据张冠李戴。
    - 精确匹配（第 26 行 `responses[exact]`）正常情况下都能命中，fallback 只在缺录时触发；示范 spec 不依赖具体数据，当前 2 passed 不受影响。
- 建议：fallback 改为返回 404 或 `empty_ipc()`，让缺失更易被发现。或保持现状但在 `adoption.md` 记一条已知行为。非阻塞。

### T010_code_f004 — `gitignore` 覆盖验证、real-account 邮箱保护充分

- 严重度：suggestion（非问题，确认项）
- 位置：`.gitignore:19`；`git check-ignore` 验证
- 问题：无问题。`.gitignore:19` 写 `tests/e2e/fixtures/data/`，`git check-ignore -v` 对目录、`responses.json`、`anything.json` 三种路径全部命中，`git status` 未出现 responses.json。
- 建议：无需修改。此项记为已验证。

### T010_code_f005 — gen_fixture 脱敏正则覆盖本仓库实际字段，安全余量足够

- 严重度：suggestion（确认项）
- 位置：`scripts/e2e/gen_fixture.mjs:33`
- 问题：核对 `src/main/ipc/config-ipc.ts:230` `ok(secrets)` 返回结构为 `{ instanceId, secrets: { <paramName>: <plaintext> } }`。本仓库 secret 字段实际命名为 `cpa_mgmt_key`、`apiKey`、`sessionKey` 等，全部含 `key`，被正则覆盖。`secrets` 外层 key 也被 `secret` 命中触发递归，内层 value 会被逐字段替换。
    - 邮箱字段（`email` / `account_email`）按 spec 第 32 行允许保留（本地 fixture，不入库）。
- 建议：无。仅记为已验证；若未来新增非常规命名 secret 字段（不含 secret/password/token/cookie/key/bearer/credential 任一子串），f001 的白名单方案可一并兜底。

## 结论

5 项 finding，0 critical / 0 high / 1 medium / 2 low / 2 确认项。

实现整体满足 spec 验收标准（gen-data 产出、gitignore 生效、SPA 全端点覆盖、test:e2e:web 2 passed、vitest 不受影响）。主要偏差是 f001 / f002 两处实现路径与 spec 文字描述不一致——实质目标达成，但需要 owner 在 adoption 阶段二选一：要么改实现对齐 spec（白名单脱敏），要么修订 spec 对齐实现（并补 blueprint 决策记录）。f003 是 mock_server 的潜在数据混淆，示范 spec 不触发，可作遗留或小修。f004 / f005 为已验证项，无需改动。
