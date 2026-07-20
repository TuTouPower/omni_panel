# Adoption T010

逐条处置 `review_code.md` 和 `review_test.md` 的 finding。流程见 AGENTS.md step 7。

| finding_id     | decision | rationale                                                                             | status   |
| -------------- | -------- | ------------------------------------------------------------------------------------- | -------- |
| T010_code_f001 | 采纳     | 实现黑名单脱敏实测覆盖全字段；修 spec 对齐实现 + 补 ADR                               | 已修     |
| T010_code_f002 | 采纳     | vite plugin 单进程方案优于 spec 写的双进程 proxy；修 spec 对齐                        | 已修     |
| T010_code_f003 | 采纳     | mock state/secrets 改精确查 id，不再 fallback 首条                                    | 已修     |
| T010_code_f004 | 无需修改 | gitignore 已验证生效（确认项）                                                        | 无需修改 |
| T010_code_f005 | 无需修改 | 脱敏正则覆盖本仓库实际字段（确认项）                                                  | 无需修改 |
| T010_test_f001 | 采纳     | 示范 spec 用例 2 改名澄清语义（React mounted）；数据链路留 T011                       | 已修     |
| T010_test_f002 | 遗留     | trend query 忽略；T011 迁移 trend spec 时多录组合                                     | 遗留     |
| T010_test_f003 | 遗留     | fixture gitignore 致 CI 无法真跑 web e2e；task_report 记 CI 策略                      | 遗留     |
| T010_test_f004 | 遗留     | webServer 顶层污染其他 project；Playwright 无 project 级 webServer，拆 config 超 T010 | 遗留     |
| T010_test_f005 | 采纳     | global_setup 删 out/web 冗余检查行（web project webServer 自带 build）                | 已修     |

## 处置说明

- **T010_code_f001（已修，仅文档）**：spec 原写"读 secrets.json 白名单（仅 instanceId）"，实现走"local-api 响应黑名单正则递归脱敏"。实现更贴近 SPA 真实视图结构 + 实测覆盖全字段（`cpa_mgmt_key/apiKey/sessionKey` 均含 `key`）。修订 `spec.md` 范围段对齐实现 + `decisions.md` ADR 007 记决策。
- **T010_code_f002（已修，仅文档）**：spec 原写 `preview.proxy` 双进程，实现改 `mock_api_plugin` middleware 单进程（省一个 webServer、端口管理更简）。修订 `spec.md` + ADR 007。
- **T010_code_f003（已修，触代码）**：`mock_server.mjs` state/secrets handler 改精确查 id（`responses[GET /v1/connectors/${id}/state]`），找不到返回 `empty_ipc()`，不再 find_by 首条 fallback。避免缺录时数据张冠李戴。重跑 `pnpm test:e2e:web` → 2 passed。
- **T010_test_f001（已修，触测试）**：示范 spec 用例 2 改名 "app title renders (React mounted; 数据链路由 T011 批量 spec 覆盖)" + 注释说明 app-title 硬编码、本用例只证 React 挂载。数据链路（provider card 渲染）由 T011 批量迁移时覆盖。
- **T010_test_f005（已修，触代码）**：`global_setup.ts` 删 `out/web` 检查行（web project `webServer.command` 含 `pnpm build:web`，产物必然在）。保留 out/main 检查（default/packaged 用）。
- **T010_test_f002（遗留）**：trend 录制仅 first_item 一条，mock 前缀匹配。T011 迁移 trend 相关 spec 时评估多录 provider×account×metric 组合。
- **T010_test_f003（遗留）**：fixture 含本机真实账号不入库（隐私正确），致 CI 无 responses.json、web e2e 跨机器不可复现。CI 策略留 T013 文档收尾定（synthetic seed fixture 入库 供 CI smoke，或 `--grep-invert @local` 跳过）。
- **T010_test_f004（遗留）**：Playwright `webServer` 是顶层 config，无 project 级字段；跑 default/packaged 时也启 vite preview（浪费但不阻塞，5174 空闲时 OK）。拆独立 playwright config 可解但超 T010 范围，留 T013 评估。
