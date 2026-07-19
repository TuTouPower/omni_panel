# CPA 聚合数据源

唯一聚合型连接器。运行时契约见 `connector-runtime.md`；术语（直连 vs 聚合）见 `domain.md`。

## 定位

一份 `cpa_mgmt_key` 拉回横跨多 provider 的多账号（Claude×N + Codex×N + Antigravity + Kimi）。普通连接器是"一实例=一账号=一 provider"，CPA 把三者解耦：**它是采集渠道，不是服务商**。

## 三层 ID 解耦

每条 CPA 观测独立回答三问：

- `provider` — 谁家额度（落哪个 UI 卡片）
- `accountId` — 哪个账号（是否"同一个东西"）
- `sourceInstanceId` — 怎么采进来（出错去哪修）

**不变量**：`accountId` 必须由聚合源返回的稳定标识（邮箱/UUID）生成，**绝不用"实例+序号"**。CPA 那侧账号顺序一变，本地隐藏/标签/历史全错位。

## 跨源去重

同一真实账号可能被多渠道采到（直连配了 Claude `a@x`，CPA 也带 `a@x`）。`(provider, accountId, metricId)` 相同时，`observation-store.md` 的"observedAt 最新胜出"自动去重，卡片标"另有 N 个来源"。去重发生在统一观测层，不在连接器内部。

## 错误归属（account 级，非 source 级）

CPA 脚本逐账号 try，产出观测各自带状态。失败归属决定显示：

| 失败层级   | 触发                                     | 表现                                                  |
| ---------- | ---------------------------------------- | ----------------------------------------------------- |
| source 级  | `cpa_mgmt_key` 失效 / CPA-Manager 连不上 | 该渠道所有账号 stale，提示"CPA 数据源连接失败"        |
| account 级 | 单账号采集失败（最常见）                 | 仅该账号红点 + 自己的 stale；同 provider 其他账号照常 |
| 来源移除   | 采集成功但账号已从 CPA 列表消失          | 标"来源已移除"，保留有限历史后清理                    |

**核心约束**：Kimi 拉失败不能让整个 CPA 挂掉、连累 Claude。

## 聚合计算

多账号 provider 卡片在概览粒度聚合当前可显示账号（隐藏的排除）：

- **整体使用率 = `sum(used) / sum(limit)`**，绝不取各账号百分比平均。
- 聚合时间（刷新/重置）同样不取均值：同周期有效账号时间差 ≤10 分钟显示最新，>10 分钟不显示。
- 无有效 used/limit 不伪造数值。

## 所有权（CPA 隐藏，直连删除）

- **CPA 账号**：菜单"编辑 + 隐藏"。隐藏只写本地 `accountOverrides.hidden`，存在性由远端 CPA-Manager 决定，本地"删"了下次又回来。隐藏后用量面板消失、聚合排除、设置页可恢复。
- **直连账号**：菜单"编辑 + 删除"。删除连本地配置带 secret 一起清。

## 展示边界

- **用量面板**：无"CPA" tab，CPA 账号并入对应 provider 卡片。
- **设置页**：单一"已添加"列表不分区。CPA 行（N>1）带展开箭头，展开露账号子行；普通行（N=1）与一般直连无异。
- 操作按行层级：数据源主行含删除/改名/刷新；CPA 账号子行仅隐藏/改名。

## 配置

- `connectors/cpa/manifest.json` + `connector.ts`（script 型，走 `connector-runtime.md` 脚本分支）。
- `provider = "cpa"`，`capabilities = ["poll"]`（多步 poll 经 script 实现）。
- 参数 `cpa_mgmt_key`（secret）。
- 保存副作用按实际变化分类：管理密钥、CPA-Manager URL、任一 monitor 变化时，仅 fire-and-forget 刷新当前 CPA；备注、刷新间隔不立即采集。
- 无变化保存不写 config、不写 secret、不刷新；保存成功返回账号列表，保存失败保留详情页。
- 当前 CPA 定向刷新不等待网络结果，也不解除 scheduler 的 user/system 暂停状态。
