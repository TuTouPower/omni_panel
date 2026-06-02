# Demo TODO：插件 / 数据来源 / 账号 架构重构

> 状态：草案，暂不实施。等第二个多 provider connector 出现时再驱动。
>
> 本文档分两部分：第一部分给不接触代码的设计 AI 看，只说现象和方向；第二部分给能读代码的实现 AI 看，包含具体文件和技术细节。

---

# 第一部分：背景与设计方向（无代码）

## 现状是怎么来的

### 最初的设计

OmniUsage 最初是一个插件对应一张卡片：一个插件抓一个 AI 服务商的数据，主面板就显示一张卡片。简单清晰。

### CPA 打破了这个模型

CPA（Claude Provider Aggregator）是一个代理服务，一次连接就能拿到 Claude、Codex、Gemini、Antigravity、Kimi 五个服务商的配额数据。一个数据来源带来五个服务商、每个服务商还可能有多个账号。

旧的"一个插件 = 一张卡片"架构完全处理不了这种一对多的关系。

### 当时怎么解决的

做了一次大改造：

- 主面板不再按"插件"分卡片，改为按"服务商"分 tab（Claude、Codex、Gemini……）。每个服务商 tab 下面按账号展示。
- 总览页显示所有服务商的摘要卡片。
- 设置页把 CPA 的连接配置（URL、API Key）也加进去了。
- 新增了一个专门的 CPA 设置组件。

### 留下了什么问题

1. **CPA 身份混乱**：CPA 既是"怎么抓数据的插件"，又是"数据从哪来的数据源"，又是"自带多个服务商多个账号的聚合器"。三件事绑在一个设置页上，用户搞不清自己在配什么。

2. **设置页分不清职责**：CPA 的连接配置、其他服务商的认证配置、账号的展示管理全混在同一个页面。用户不知道"我在配置数据来源"还是"我在管理账号显示"。

3. **数据格式强行统一**：每个 AI 服务商返回的额度数据格式完全不同（有的是百分比、有的是 token 数、有的是金额、有的是剩余额度）。为了统一展示，强行把所有数据塞进同一个结构，导致很多字段对某些服务商是空的。

4. **没有通用的数据来源配置**：CPA 的设置组件是专用的，如果以后要接第二个类似的多服务商代理，就得重写一套。

5. **"插件"概念泄露给用户**：用户需要理解"CPA 是一个插件"、"Claude 也有一个插件"才能完成配置。但用户关心的不是插件，而是"我要添加一个数据来源"。

## 目标设计

### 核心理念：两层，不是三层

用户只需要理解两个概念：

**数据来源**：一个配置单元，代表"我从哪里拿数据"。

- "我的 CPA Manager" — 一条配置，背后自动发现五个服务商
- "我的 Claude OAuth" — 一条配置，对应一个 Claude 账号
- "我的 Kimi API Key" — 一条配置，对应一个 Kimi 账号

用户不需要先建"数据来源"再关联"账号"，配置完数据来源，账号自动出现。

**账号展示**：按服务商分组的已发现账号，控制显示方式。

- 每个 AI 服务商下面展示该服务商的所有账号（可能来自不同数据来源）
- 用户可以开关某个账号的显示、重命名、调整排序
- 不同服务商的额度数据展示由系统自动适配，不强求格式统一

**插件**是开发者的事，不进设置页。用户选的是"我要添加什么类型的数据来源"，背后对应哪个插件用户不需要知道。

### 设置页结构

两个 tab：

**数据来源 tab**：

- 列出所有已配置的连接（CPA Manager、Claude OAuth、Kimi API Key 等）
- 每条可以添加、删除、编辑
- 点击"添加"弹出类型选择：CPA Manager / Claude OAuth / Kimi API / ……

**账号展示 tab**：

- 按 AI 服务商分组（Claude、Codex、Gemini……）
- 每个服务商下列出所有已发现的账号
- 可以开关某个账号的显示、重命名

### 数据流向

```
用户在"数据来源"tab 配置连接
        ↓
系统自动发现账号
        ↓
账号出现在"账号展示"tab
        ↓
主面板按服务商 tab 展示对应账号的用量
```

### 不做的事

- 不提前设计通用的多服务商连接器接口
- 不把"选插件"暴露给用户
- 不在只有一个多服务商连接器（CPA）的时候就重构

### 什么时候做

出现第二个多服务商连接器时启动。届时会有真实的重复模式驱动设计。

---

# 第二部分：技术细节与具体文件（有代码）

## 改造历程

### Phase 1：初始架构

每个插件 = 一张卡片。`PluginCard` 组件直接渲染单个插件的 `items[]`。

### Phase 2：CPA 插件

新增 `resources/plugins/cpa-usage-plugin.py`，Python 插件，通过 CPA-Manager 代理抓取 5 个 provider 的配额。旧架构无法处理多 provider 产出。

### Phase 3：大改造（`c879af3`）

80 个文件，核心变更：

**schema 重写**（`schemas/plugin-output.schema.json`）：

- 旧：扁平 `items[]`，每个 item 只有 `id`/`name`/`used`/`limit`
- 新：discriminated union，每个 item 新增 `provider`/`accountId`/`accountLabel`
- 问题：`accounts[]`/`windows[]` 为 CPA 量身定做，单 provider 插件被迫产出半填充对象

**聚合层**（`src/renderer/lib/provider-usage.ts`）：

- 新增 `ProviderUsageGroup`，按 provider 聚合多插件数据
- 问题：混合了数据来源识别和展示逻辑，职责不清

**UI 组件替换**：

| 删除                      | 新增                                                           |
| ------------------------- | -------------------------------------------------------------- |
| `PluginCard`              | `ProviderCard` / `ProviderOverview`                            |
| `AreaChart` / `TokenGrid` | `ProviderAccountList` / `ProviderAccountRow`                   |
| —                         | `ProviderNav` / `ConnectorStatusCard` / `CpaConnectorSettings` |

问题：`CpaConnectorSettings` 是 CPA 专用，无通用数据来源配置组件。

**设置页**（`src/renderer/views/SettingsView.tsx`）：

- CPA URL/API Key、其他插件配置、账号展示全混一页

### Phase 4：修补

- `047e6eb`：设置页账号按 provider 分组，但没区分"数据来源"和"账号展示"
- `edbd51f`：ProviderCard 加状态处理，`accountCount`/`windowCount` 暴露给用户（已修正：单账号不显示，去掉窗口数）

## 问题汇总

| #   | 问题               | 具体表现                          |
| --- | ------------------ | --------------------------------- |
| 1   | CPA 三合一         | 插件/数据源/账号配置绑在一起      |
| 2   | 设置页混乱         | 配置、管理、展示无分区            |
| 3   | Schema 过度统一    | 单 provider 插件产出半填充对象    |
| 4   | 聚合层职责不清     | 数据来源识别和展示逻辑混合        |
| 5   | 无通用数据来源组件 | CPA 专用，第二个 connector 要重写 |
| 6   | 插件概念泄露       | 用户被迫理解插件机制              |

## 重构涉及的文件

当重构启动时，重点关注：

- `schemas/plugin-output.schema.json` — 数据格式
- `src/renderer/lib/provider-usage.ts` — 聚合逻辑
- `src/renderer/views/SettingsView.tsx` — 设置页
- `src/renderer/components/CpaConnectorSettings.tsx` — 改为通用数据来源配置
- `src/renderer/components/ProviderCard.tsx` — 卡片展示
- `src/renderer/components/ProviderAccountRow.tsx` — 账号行
- `src/renderer/views/PopupView.tsx` — 主面板
- `src/main/ipc/plugin-ipc.ts` — IPC 层
- `src/main/core/config/config-store.ts` — 配置存储
