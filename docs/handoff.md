# handoff

- 最后更新：2026-09-30
- branch：`main`
- head_commit：`75f3d605`（t535/t536/t537 整段 + review 归档提交；另有采纳项 A1–A19 落地改动在工作区，未提交）
- 当前状态：t535（后台优先快照）/t536（退出来源漏斗）/t537（多服务指标）全合入；四路审阅与 adoption 决策已归档 `docs/reviews/review_20260930_111051/`（采纳 19 / 不采纳 13）；采纳项正在工作区落地。

## 2026-09-30 审阅采纳项落地（进行中）

- branch：`main`
- head_commit：`75f3d605`（本节改动尚未提交）
- 内容：adoption A1–A19（CAS 基线前移、skip 先判鲜、vault cookie 单独注册脱敏、composite 往返契约测试等）+ my-adoption 白名单兼容现行 `review_<agent>_<model>.md` 命名（个人 skills_mine，非本仓）。
- 下一步：落地完成后跑针对性单测 + typecheck/lint，按语义提交工作区改动。

## 2026-09-29 花云 DOM 快照链路审查修复（工作区未提交）

> 废止注记（2026-09-30，A3）：本节以下陈述已过时，仅留档——① 第 3 条"质询超时后窗口交给用户"与第 7 条"亮窗后继续采集至 handover_wait_ms"已被 t535/决策 044 取代（永不前台化，`present_for_capture`/`handover_wait`/`reveal_after` 零残留）；② 环境注意第 5 条"`package.json` 尚未声明 `engines.node`"与现状矛盾（已声明 `"engines": {"node": ">=22"}`）；③ "工作区未提交"状态已过期（整段 16 commit + review 归档均已提交）。

- branch：`main`
- head_commit：`8b15016d`（本节改动尚未提交）
- 内容：
    1. **模块拆分**：新增 `src/main/core/session/flowercloud_dom.ts`（页面判定、轮询、cookie 合并、vault 读写）与 `session-types.ts`（会话窗口/控制器契约），session-manager 只保留去重、窗口生命周期与登录流程钩子，消除 `import` 环。
    2. **provider 策略集中**：`src/shared/constants.ts` 新增 `PAGE_BOUND_CREDENTIAL_PROVIDERS` 与 `DOM_SNAPSHOT_PROVIDERS`，session-manager / auth-ipc / refresh-service / index.ts 的实名特判改为查表（原 10 处 `provider === "kimi_web" | "flowercloud"` 字面量）。
    3. **行为修复**：cookie 按名合并而非整体替换（不再丢掉 `D0S_Header` 等）；质询超时后窗口交给用户、不再强制关闭；新增 `skip_if_fresh`（定时刷新命中新鲜期不开窗）与 `force` 透传（手动刷新强制重抓）；刷新先把状态置 `loading` 再抓取，抓取返回后校验 generation。
    4. **语义修复**：连接器 `stale` 在载荷缺少 `captured_at` 时也为 `true`；花云快照不再被 `is_login_in_progress` 当成「登录中」。
    5. **安全与质量**：脱敏正则分组构建（单组失败不再整段失效）并告警；超长值跳过脱敏时告警一次，上限 1024→8192 以覆盖 JWT/OAuth token；muse 失败日志耗时不再打印 epoch 值；macOS 不再调用 no-op 的 `setSkipTaskbar`。
    6. **审查复核补强**（同日二轮）：快照窗 `closed` → `cancelled` 接线（取消不再被误报成「页面没渲染出用量」）；新增「用户关窗取消」「交互登录抢占快照」两条 Desktop 测试；connector 新鲜期常量与宿主 `FLOWERCLOUD_SNAPSHOT_FRESH_MS` 加一致性契约测试；花云页面出现多服务时连接器记 `warn`（p267 最小可感知措施）；`.gitignore` 忽略 `.pnpm-store/`。
    7. **P1/P2 缺陷修复**（同日三轮）：脱敏改为「原始文本收集匹配区间 + 组内长值优先 + 重叠合并」，修掉短凭据先命中长凭据内部导致的片段泄露（`prefix***suffix`）；快照写入点二次校验取消状态并加 CAS（vault 值并发变更则放弃写入），旧任务不再覆盖新登录凭据；亮窗后继续采集至 `handover_wait_ms`（缺省 30 分钟）上限，交接窗口在用户完成或关窗后才释放登记，不再堆积同分区窗口。新增 `tests/unit/session/flowercloud_dom.test.ts` 覆盖写入取消与 CAS。
    8. **环境对齐（ENVIRONMENT.md §5）**：`package.json` 的 `packageManager` 由 `pnpm@10.34.5` 改为 `pnpm@11.26.0`（与 mise 全局一致），新增项目级 `mise.toml` 锁定 `pnpm = "11.26.0"`；以 pnpm 11 `pnpm install` 重建 node_modules，`pnpm-lock.yaml` 无 diff。pnpm 11 把 `pnpm-workspace.yaml` 的 `onlyBuiltDependencies` 迁移为 `allowBuilds`（占位值会让构建脚本被忽略），已用 `pnpm approve-builds --all` 批准并复跑 install（esbuild ×3 / unrs-resolver / electron-winstaller postinstall 已执行）。electron 44 起无 postinstall 且 `index.js` 在缺 `dist` 时会同步下载（写 `~/Library/Caches/electron`），重建后 29 个测试文件因此收集失败，已用 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ pnpm exec install-electron` 从本机已有缓存恢复。`.gitignore` 忽略 pnpm 11 的项目内 `.pnpm-store/`（该目录名义 616MB，prettier 也依赖这行做 ignore）。
    9. **pnpm 11 迁移收口（同日四轮，方案 B：项目正式升级到 pnpm 11）**：查证 pnpm 官方文档后修正了先前的错误判断——(a) pnpm 11 起 `.npmrc` **只承载 registry/auth**，pnpm 专属设置必须放 `pnpm-workspace.yaml` 或各人本机的全局 `~/.config/pnpm/config.yaml`，所以原 `.npmrc` 的 `node-linker = hoisted` 失效、node_modules 曾退化为 isolated；该设置已迁移为 `pnpm-workspace.yaml` 的 `nodeLinker: hoisted`，`.npmrc` 只留迁移说明注释。(b) store 默认在各机器 home 下，**只有执行环境连 home 都不可写时**（agent 沙箱、仅 bind-mount 项目的容器）pnpm 才降级把 store 建在项目内——仓库里那个 `.pnpm-store` 是执行环境产物，不是项目需要，**store 位置不写入仓库**（先前误写机器绝对路径已清除，未提交、未进历史）。清理：仓库内 `.pnpm-store` 已删；pnpm 10 遗留的全局 store `~/Library/pnpm/store/v10`（1.5G）已删，只剩 v11 在用。
- 验证：`pnpm lint`、`pnpm typecheck`、`pnpm arch`、`pnpm format:check`、`pnpm deadcode`、`pnpm test`（4224 passed / 1 skipped，pnpm 11.26.0 + hoisted）全绿；未运行需要许可的 `test:e2e:electron` / `test:packaged`。
- 遗留：p267（花云多服务账号只取首个产品）、p268（macOS 快照窗口隐藏需真机验证）、p269（另一会话新建，未处理）；本次行为已补记 `docs/specs/flowercloud_usage.md`。
- 环境注意：
    1. pnpm 11 的 `runDepsStatusCheck` 会在 `pnpm run` 前自动 install，非交互环境下若判定需清空 node_modules 会失败，可临时加 `--config.confirm-modules-purge=false`。
    2. 写全局 store 需要**工作区外**写权限：本 agent 的沙箱默认只允许写仓库，`pnpm install` 会以 `[ERR_SQLITE_ERROR] unable to open database file` 失败，需一次性放宽权限；用户自己的终端无此限制。
    3. `mise.toml` 触发的 tracked-configs 软链因沙箱失败并打印一行警告，不影响版本解析。
    4. electron 44 无 postinstall，重建依赖后需 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ pnpm exec install-electron` 恢复二进制（否则 `index.js` 会尝试下载并写 `~/Library/Caches/electron`，沙箱下失败并连带测试收集报错）。
    5. pnpm 11 要求 Node 22+（CI 已是 Node 22）；`package.json` 尚未声明 `engines.node`，如需对贡献者强制可后续补。
- 下一步：按 backlog 执行既有任务；本批改动提交前建议按语义拆分 commit（环境迁移单独一个），并在 commit message 中说明 pnpm 11 升级对贡献者的影响（`.npmrc` 语义、`allowBuilds`、Node 22+）。
