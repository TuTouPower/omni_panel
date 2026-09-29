# Task spec

## 背景

花云（FlowerCloud）用量只能从登录后的页面 DOM 快照读取，宿主用隐藏会话窗口周期性重抓。当前实现把「页面需要人操作」直接等同于「亮出窗口」：`src/main/core/session/flowercloud_dom.ts` 的 `flower_needs_user` 覆盖 `cloudflare` / `login` / `blocked` 三类页面，累计阻塞达到 `FLOWER_REVEAL_AFTER_MS`（8s）即调用宿主 `reveal()`（`src/main/index.ts`：`setOpacity(1)` + `window.show()`）。于是定时刷新、自动重抓与普通「刷新」都可能把后台取数失败升级为前台打断，用户未点「处理验证」也会被要求前台操作。

亮窗后的等待预算（`FLOWER_REVEAL_BUDGET_MS` 120s + `FLOWER_HANDOVER_WAIT_MS` 30min）耗尽时返回 `handed_over: true`：窗口保留，但 `flower_snapshots` 与 `in_progress` 登记被释放，本轮轮询结束；下一轮刷新会再建同分区窗口，旧窗口仍存活，形成失管窗口与叠加风险。

另外透明采集窗口在 macOS 依赖 `setSkipTaskbar`（该 API 在 macOS 不生效），是否进入 Dock / 窗口切换器尚未真机验证（p268）。

## 契约区

### 范围

- 交互边界：定时刷新、自动重抓、普通「刷新」遇阻塞页不得自动显示窗口或抢焦点；只有明确的用户处理动作（处理验证 / 重新登录）才允许前台化。
- 自动恢复：复用现有 Electron 会话分区能力，在后台尝试合理可行的恢复；过程有界，不承诺绕过服务端验证。
- 失败语义：有界退出，保留最后一次成功值与其采集时间，`stale` 如实标注并给出失败原因（区分需验证、需登录、访问受限、网络失败）；无历史数据时明确显示无数据。
- 窗口与登记一致：同实例任意时刻窗口、采集任务、登记一一对应；成功、失败、超时、关闭、取消、重入，以及交接预算耗尽后的下一轮刷新，都不遗留失管窗口、不叠加同分区窗口。
- 采集窗口可见性：macOS 上采集窗口不出现在 Dock / 窗口切换器 / Mission Control，且不抢焦点。

### 非范围

- 不新增无头浏览器或浏览器自动化依赖；自动恢复只能基于现有 Electron 会话窗口能力。
- 不扩展到其它 provider 的隐藏窗 / reveal 行为（本次只处理花云）。
- 不改应用退出与生命周期（见 t536），不改多服务用量采集（见 t537）。
- 不承诺「必然通过 Cloudflare 质询」。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：定时刷新与自动重抓遇 `cloudflare` / `login` / `blocked` 页面时，宿主 reveal 不被调用（窗口保持不可见、不抢焦点）；仅用户主动处理动作才前台化。
- [ ] AC-002：用户手动「刷新」与定时刷新在阻塞页上的前台化行为一致（均不自动前台化），刷新意图与打开交互窗口意图分离。
- [ ] AC-003：自动恢复在有界预算内结束并返回可解释状态（需验证 / 需登录 / 访问受限 / 网络失败之一）；不出现无限等待或长期停留在 loading。
- [ ] AC-004：失败路径保留最后一次成功观测及其采集时间，观测标 `stale` 并携带失败原因；无历史数据时输出无数据，不用旧值伪装成新数据。
- [ ] AC-005：交接预算耗尽后，下一轮刷新不创建第二个同分区窗口；旧窗口与登记状态一致，无失管窗口残留。
- [ ] AC-006：窗口关闭、取消、并发刷新、同实例重入四种情况下，登记与窗口一一对应，无泄漏、无重复采集。
- [ ] AC-007：`[deploy]` macOS 真机上采集窗口不出现在 Dock / 窗口切换器 / Mission Control，且不抢焦点。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-007：不可自动测试——`is_e2e_headless()` 下 `present_for_capture` / `reveal` 直接返回，Playwright 观察不到真实窗口层级。替代验证：macOS 真机手动核验窗口列表与焦点，条件允许时用 `test:e2e:electron` headed 观察。
- AC-001 至 AC-006：全部可自动测试（会话单元测试 + 调度集成测试）。

## 上下文区

- 来源：p269、p268（核实：2026-09-29，两处描述与当前代码一致；`flower_needs_user` 三类页面、8s 阈值、主动 `show`、交接后释放登记均在位；`setSkipTaskbar` 已有非 darwin 守卫。已更正「亮窗后 120 秒即停止采集」的旧说法，当前为 120s + 30min。引用行号以创建时工作区为准。）

### 有意不测

- 真实 Cloudflare 质询的自动通过率：依赖外部服务与真实站点行为，无法在自动化测试中稳定复现；只测「有界尝试 + 结果判定」，不测服务端结果。
- 操作系统级焦点抢夺表现：headless 与 CI 不可观察，交由 AC-007 真机核验。

### 测试策略

- 会话单元测试（`tests/unit/session`）：伪时钟推进，断言阻塞页不触发 reveal、预算耗尽返回有界状态、登记与窗口在关闭 / 取消 / 重入下一致、交接后下一轮不叠加窗口。
- 调度集成测试（`tests/integration/scheduler`）：阻塞页刷新有界退出、旧值保留并标 stale、loading 不长期驻留。
- 宿主守卫回归：headless 下 `present_for_capture` / `reveal` 不产生窗口操作。
- 真机：AC-007 手动核验，记录窗口列表与焦点表现。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 真实花云 Cloudflare 控件能否被定位、交互并通过：UNVERIFIED-SPIKE，需在真实会话窗口内做 spike 验证可行性，再决定是否实现自动交互与重试上限。
- macOS 透明窗口（`setOpacity(0)` + `showInactive`）在 Dock / Mission Control / 窗口切换器中的实际表现：UNVERIFIED-SPIKE，真机观察确认。

### 风险与回退

- 风险：自动恢复能力可能被高估（无法通过服务端验证）；取消自动 reveal 后，用户可能在无提示的情况下长期拿到 stale 数据，需要 UI 明确原因与入口。
- 回退：改动集中在 `flowercloud_dom.ts` / `session-manager.ts` / `index.ts` 的窗口方法，可按 commit 粒度 revert；保留真机验证记录以便复现。

### 依赖与约束

- 依赖本轮已入库的会话拆分（`flowercloud_dom` 模块、`handover_wait_ms` 语义、`nodeLinker`/pnpm 11 环境）已在位。
- 会弹窗或抢焦点的 Electron / 打包测试必须取得用户明确许可（`docs/blueprint/testing.md` 用户干扰分级）。
- 不改变 `is_login_in_progress` 与凭据保护的既有语义。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：花云快照的交互边界（后台优先、用户主动才前台化）与窗口 / 登记不变量。
- `docs/blueprint/testing.md`：真机验证条目（AC-007）与需要许可的测试范围。
- `docs/blueprint/decisions.md`：后台优先 vs 自动弹窗的取舍记录。
