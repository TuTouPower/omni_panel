# 插件运行时方案分析

## 背景

OmniUsage 采用 **子进程插件架构**：宿主（Electron）通过 CLI 参数传入配置，插件执行后在 stdout 输出 JSON 结果。当前所有插件用 Python 编写。

### 当前插件清单

| 插件文件                   | 功能                 | 依赖                | 复杂度 |
| -------------------------- | -------------------- | ------------------- | ------ |
| `claude-usage-plugin.py`   | Claude 订阅用量      | stdlib only         | 中     |
| `codex-usage-plugin.py`    | Codex API 用量       | stdlib only         | 中     |
| `deepseek-usage-plugin.py` | DeepSeek 余额        | stdlib only         | 低     |
| `glm-usage-plugin.py`      | 智谱 GLM 用量        | stdlib only         | 中     |
| `minimax-usage-plugin.py`  | MiniMax 用量         | stdlib only         | 中     |
| `tavily-usage-plugin.py`   | Tavily 用量          | stdlib only         | 低     |
| `cpa-usage-plugin.py`      | 多 provider 额度代理 | **httpx**（第三方） | 高     |

### 当前协议（不变）

```
输入：CLI 参数 --usageboard-param KEY=VALUE
输出：stdout 一个 JSON 对象（成功或错误）
隔离：子进程执行，15 秒超时
```

这个协议设计是好的，与语言无关，任何能读 CLI 参数、发 HTTP 请求、输出 JSON 的运行时都能作为插件。

---

## 问题分析

### Python 的痛点

1. **运行时不可用**
    - Windows 用户普遍没有预装 Python
    - macOS 近年版本不自带 Python 3
    - Linux 有 Python 但版本不一（需要 3.8+）

2. **包管理负担**
    - 6 个插件只用 stdlib，体验尚可
    - CPA 插件需要 `httpx`，用户要手动 `pip install httpx`
    - 未来插件可能需要更多包（`httpx`, `aiohttp`, `requests`...）
    - pip 全局安装可能与系统 Python 冲突

3. **版本碎片化**
    - `python3` / `python` / `py` 命名不统一
    - 不同 Python 版本行为差异（3.8 vs 3.13）
    - 编码问题（已通过 `PYTHONIOENCODING=utf-8` 缓解但不可靠）

4. **分发困难**
    - 打包成独立 exe 体积大（PyInstaller ~30MB+/插件）
    - 更新插件 = 重新打包
    - 跨平台要分别打包

### 插件实际做了什么

所有插件的核心逻辑：

```
1. 解析参数（API key、配置项）
2. 发 HTTP 请求到第三方 API
3. 解析 JSON 响应
4. 转换为统一的 items/badge/chart 格式
5. 输出 JSON
```

这是一个非常轻量的任务，不需要重运行时。

---

## 方案对比

### 方案 A：TypeScript / JavaScript（Node.js 子进程）

**原理**：Electron 自带 Node.js，插件改为 `.js` 文件，用 `node script.js` 执行。

| 维度             | 评价                                     |
| ---------------- | ---------------------------------------- |
| **用户安装成本** | 零。Node.js 由 Electron 自带             |
| **HTTP 能力**    | Node 18+ 内置 `fetch()`，零依赖          |
| **并发**         | `Promise.all()` 原生支持                 |
| **生态**         | npm 生态庞大，但插件本身不需要           |
| **安全性**       | 子进程隔离不变，与 Python 同等           |
| **插件体积**     | 单文件 `.js`，几 KB                      |
| **开发体验**     | TS 类型定义可复用宿主代码                |
| **分发**         | 无需额外打包                             |
| **CPA 替代**     | `fetch()` + `Promise.all()` 替代 `httpx` |

**改造范围**：

- `command-builder.ts`：`.js` → `node script.js`
- `python-detect.ts`：移除或改为可选（保留兼容旧插件）
- `metadata-parser.ts`：注释块格式 `//` vs `#`，需支持双格式或统一
- 新增 `_common.js`：参数解析 + 成功/失败输出工具函数
- 7 个插件翻译为 JS

**潜在问题**：

- 注释块格式需调整（`#` → `//`），或者 metadata parser 同时支持两种
- `require('./_common.js')` 路径解析需要约定

### 方案 B：保留 Python，捆绑运行时

**原理**：用 `python-build-standalone` 或类似方案把 Python 打进应用。

| 维度             | 评价                                 |
| ---------------- | ------------------------------------ |
| **用户安装成本** | 零（捆绑在应用内）                   |
| **HTTP 能力**    | stdlib `urllib`，或预装 `httpx`      |
| **分发**         | 打包体积 +30-50MB                    |
| **更新**         | 插件更新需要重新打包或单独分发运行时 |
| **兼容性**       | 现有插件无需改动                     |
| **跨平台**       | 每个平台要单独打包 Python            |

**适用场景**：如果插件生态已经很大且重 Python（科学计算类），值得。但当前 7 个插件都是简单 HTTP 请求，性价比低。

### 方案 C：Deno 子进程

**原理**：类似方案 A，但用 Deno 而非 Node。

| 维度             | 评价                             |
| ---------------- | -------------------------------- |
| **用户安装成本** | 需要安装 Deno（不内置）          |
| **HTTP 能力**    | 内置 `fetch()`                   |
| **安全性**       | 默认无权限，比 Node 更安全       |
| **分发**         | 可用 `deno compile` 打包为单文件 |
| **生态**         | 较小                             |

**问题**：引入新的外部依赖，违背"零安装"目标。Deno compile 打包又回到"每个插件一个可执行文件"的老路。

### 方案 D：WASM 插件

**原理**：插件编译为 WASM，宿主用 Node 的 `wasm` 模块执行。

| 维度             | 评价                             |
| ---------------- | -------------------------------- |
| **用户安装成本** | 零                               |
| **安全性**       | 最强沙箱，无文件系统/网络访问    |
| **HTTP 能力**    | 需要宿主提供 host function，复杂 |
| **开发体验**     | 差，需要 Rust/Go/AS 编译链       |
| **灵活性**       | 受限于 WASM 能力                 |

**问题**：过度设计。插件的核心需求就是发 HTTP 请求，WASM 的沙箱反而成为障碍。

### 方案 E：JS + 预编译 bundle（esbuild 单文件）

**原理**：方案 A 的增强版，插件写 TypeScript，esbuild 编译为单个 `.js` 文件。

| 维度             | 评价                              |
| ---------------- | --------------------------------- |
| **用户安装成本** | 零                                |
| **开发体验**     | 最好，TypeScript 类型安全         |
| **分发**         | 单个 `.js` 文件，几 KB            |
| **构建**         | 需要 esbuild 步骤（可 CI 自动化） |

**问题**：增加构建步骤复杂度，对当前 7 个简单插件来说收益不大。可以作为未来方向。

---

## 推荐方案

**方案 A：JS 子进程**。理由：

1. **零依赖**：Node.js 由 Electron 自带，用户什么都不用装
2. **改动最小**：协议不变，只换运行时和脚本语言
3. **fetch 原生**：Node 18+ 内置，CPA 的 httpx 问题彻底解决
4. **并发简单**：`Promise.all()` 替代 httpx 的异步逻辑
5. **保留子进程隔离**：安全性不变
6. **未来可升级到 TS**：方案 E 在需要时可以无缝迁移

### 改造计划概要

```
[1] 新建 resources/plugins/_common.js（参数解析 + 输出工具）
    验证：单元测试 _common.js 函数

[2] 改造 metadata-parser.ts 支持 // 注释格式
    验证：现有 .py 插件 + 新 .js 插件都能解析

[3] 改造 command-builder.ts 支持 .js 扩展名 → node 执行
    验证：单元测试通过

[4] 逐个翻译插件：.py → .js
    验证：每个插件的输出与 Python 版本一致

[5] python-detect.ts 改为可选（仅 .py 插件需要）
    验证：纯 JS 插件场景下不报错

[6] 更新 plugin-contract.md 文档
```

### 元数据格式兼容

`.js` 文件的注释块格式：

```js
// UsageBoardPlugin:
// {
//   "name": "DeepSeek",
//   ...
// }
// /UsageBoardPlugin
```

metadata parser 需要根据文件扩展名选择 `#` 或 `//` 作为注释前缀。

---

## 不推荐的方案及原因

| 方案                           | 不推荐原因                             |
| ------------------------------ | -------------------------------------- |
| 保留 Python（裸）              | 用户需装 Python + pip，体验差          |
| 捆绑 Python 运行时             | 体积膨胀 30-50MB，7 个 HTTP 插件不值得 |
| Deno                           | 需要额外安装，无优势                   |
| WASM                           | 过度设计，HTTP 请求需要 host function  |
| 正在运行的 Electron 进程内执行 | 失去子进程隔离，插件崩溃影响宿主       |

---

## 附录：当前插件的 HTTP 调用模式

| 插件     | 请求方式                                   | 并发                       |
| -------- | ------------------------------------------ | -------------------------- |
| claude   | urllib（多步：登录 → 获取 session → 查询） | 否                         |
| codex    | urllib（单请求）                           | 否                         |
| deepseek | urllib（单请求）                           | 否                         |
| glm      | urllib（单请求）                           | 否                         |
| minimax  | urllib（单请求）                           | 否                         |
| tavily   | urllib（单请求）                           | 否                         |
| cpa      | httpx（多 provider 并发请求）              | 是（httpx.Client + async） |

JS 的 `fetch()` + `Promise.all()` 可以覆盖以上全部场景。
