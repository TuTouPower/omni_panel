# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

手动刷新 await 整轮采集才返回（`connector-ipc.ts:195`），最坏 3×15s 重试 + 延迟，spinner 卡到采集完成。popup 每次状态推送渲染三份树（活树 + 两个测高镜像，`PopupView.tsx:485, 681-716`），叠加 `JSON.stringify` 深比较。账号展开每个指标周期各发一次 `trend:get` IPC，N 个并行 invoke。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 手动刷新 IPC 改为立即 ack，结果走已有 EVENT_STATE_CHANGE 推送渐进填充；UI loading 态由状态推送驱动，不再等完整采集 resolve。
- 测高改为单份不可见副本着色一次或 content-size 估算 + 一次修正，去掉双镜像；保留 popup/floating 高度契约。
- `snapshot_equal`/`plugin_list_equal` 的 `JSON.stringify` 深比较改为引用比较 + 版本号或结构签名。
- 账号展开 trend 改为单 IPC 取回该账号全部指标周期数据，替代 N 个并行 invoke；主侧保持同步 SQLite。

### 非范围

- 不改采集调度、重试策略、超时阈值。
- 不改 connector 脚本、vault、config 缓存（属 t195）。
- 不改 agent/TokenStats 查询链。
- 不改图表视觉、卡片布局、托盘交互。
- 不改 popup 隐藏不销毁（属 t194），但本 task 的渲染瘦身在隐藏期间不额外触发。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：手动刷新触发后 UI 立即进入 loading，不阻塞至采集完成；采集结果经状态推送渐进更新，失败最终落 failed 态。
- [ ] AC2：同一实例重复触发刷新（手动 + 定时）仍靠 per-instance 锁短路，不会并发跑两轮采集。
- [ ] AC3：popup 单次状态推送只渲染一份主树，测高不再双镜像；高度计算结果与之前一致，不出现跳变或截断。
- [ ] AC4：快照相等性判断不再对整份快照做 `JSON.stringify`，状态无变化时不触发重渲染。
- [ ] AC5：展开账号一次 IPC 取回全部指标周期 trend 数据，不再发起 N 个并行 invoke；展示结果与之前一致。
- [ ] AC6：`[deploy]` 打包后真实启动，手动刷新与切 tab 体感顺滑，账号展开响应明显改善。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC6：真实打包启动体感需人工签收；AC1–AC5 自动化覆盖。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 不测三平台测高的亚像素差异：由 packaged smoke + 既有测高测试覆盖边界。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 刷新语义测试断言立即 ack、loading 由推送驱动、失败落 failed；保持 per-instance 锁短路。
- 测高测试断言单份副本能正确报高，与原双镜像结果一致；floating/popup 高度边界回归。
- 相等性测试断言引用相等或版本号短路，无变化时不重渲染。
- trend 测试断言单 IPC 返回多周期数据，展示与之前一致。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 立即 ack 与现有 refresh-spinner spec 的对齐：UNVERIFIED-SPIKE，执行期核实「2026-06-15-refresh-spinner」约定 spinner 绑定真实 pending 的具体语义，确认立即 ack 后由推送驱动是否破坏该约定，必要时调整 spec。
- 测高单镜像方案对 floating 动态高度的覆盖：UNVERIFIED-SPIKE，执行期比对单镜像与双镜像在多种卡片数、折叠态下的报高一致性。

### 风险与回退

- 风险：立即 ack 后 UI 假完成（spinner 提前结束但采集失败未感知）；测高单镜像在某些布局下报高偏差导致截断；相等性短路漏判导致漏更新。
- 回退：刷新语义、测高、相等性、trend 批量各独立可回退；不涉及数据迁移。

### 依赖与约束

- 与 t194、t195 并行独立。
- 刷新 spinner 语义、测高契约、IPC 形态变更使用 full review。
- renderer 响应配置广播只同步 state（t153 不变量）。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：手动刷新立即 ack + 推送驱动 loading；测高单镜像；快照相等性短路；trend 批量化数据流。
- `docs/specs/ipc-api.md`：刷新 IPC ack 语义、trend 批量契约（如有变化）。
- `docs/specs/2026-06-15-refresh-spinner.md`（若存在）：spinner 与推送驱动的对齐说明。
