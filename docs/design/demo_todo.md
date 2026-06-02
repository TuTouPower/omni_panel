# Demo TODO：插件 / 数据来源 / 账号 架构重构

> 状态：草案，暂不实施。等第二个多 provider connector 出现时再驱动。

## 当前问题

1. CPA 既是"插件"又是"数据源"又"自带多个 provider 的账号"，三件事绑在一个配置页。
2. 单 provider 插件（claude、codex）的数据源配置、账号管理、插件设置混在同一个设置页。
3. 不同 provider 的额度数据格式差异大，被塞进同一个 `UsageItem` schema，half-empty 字段多。

## 目标结构

两层，不是三层：

### 1. 数据来源（用户配置）

用户视角的一个配置单元："我的 Claude Pro 号"、"我的 CPA Manager"。

| 配置项       | 示例                                                                   |
| ------------ | ---------------------------------------------------------------------- |
| CPA Manager  | URL + API Key → 自动发现 Claude/Codex/Gemini/Antigravity/Kimi 多个账号 |
| Claude OAuth | OAuth token → 单个 Claude 账号                                         |
| Kimi API Key | API key → 单个 Kimi 账号                                               |
| Codex Token  | token → 单个 Codex 账号                                                |

"数据来源"同时承载认证信息和 provider 归属，用户不需要先建数据源再关联账号。

### 2. 账号展示（用户管理）

按 provider 分组的已发现账号，控制显示方式。

- 每个 provider 下展示该 provider 的所有账号（可能来自不同数据来源）
- 用户可开关、重命名、调整排序
- 不同 provider 的额度数据展示由对应插件适配，不强求统一 schema

### 插件（开发者的事，不进设置页）

纯代码，定义"怎么从某类 API 抓数据"。用户选的是数据来源类型，背后对应哪个插件用户不需要知道。

```
数据来源类型 → 对应插件（自动映射）
CPA Manager  → cpa-usage-plugin
Claude OAuth → claude-usage-plugin
Kimi API     → kimi-usage-plugin（待开发）
```

## 设置页结构

两个 tab：

| Tab      | 内容                                     | 操作                   |
| -------- | ---------------------------------------- | ---------------------- |
| 数据来源 | 已配置的连接列表（CPA、Claude OAuth 等） | 添加/删除/编辑连接配置 |
| 账号展示 | 按 provider 分组的已发现账号             | 开关、重命名、排序     |

## 数据流

```
数据来源配置
    ↓
插件按配置抓取
    ↓
产出 items（多 provider 多账号）
    ↓
按 provider 聚合到账号展示层
    ↓
主面板按 provider tab → 账号行展示
```

## 不做的事

- 不提前抽象通用的多 provider connector 接口
- 不把插件选择暴露给用户
- 不强制所有 provider 的额度数据走同一个 schema
- 不在只有一个多 provider connector（CPA）的时候重构

## 触发条件

出现第二个多 provider connector 时启动重构。届时会有真实的重复模式驱动抽象。
