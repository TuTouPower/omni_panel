# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

来源：p074（用户提出，2026-08-07 确认独立立项）。网页版（`src/web`，与桌面共用 `App`，经 `usageboard-web` 走 local-api HTTP 桥）与桌面版差距：没有会话面板（hash 路由支持 `#/history`，但会话历史所需 API 是否全部有 HTTP 桥未核实）；各面板之间没有相互跳转按钮。用户要求：除最大化/最小化/关闭三个按钮外，网页版其余与桌面版一致。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 网页版提供会话面板（`#/history`）：会话库/工作台可读可用，数据走 local-api HTTP 桥，展示与桌面版一致。
- 网页版各面板提供与桌面版一致的面板互跳入口（用量/代理/会话/设置），位置与图标一致。
- 网页版与桌面版的差异收敛为仅窗口控制按钮（最小化/最大化/关闭）：网页版不渲染这三个控件，其余 UI 与桌面版一致。

### 非范围

- 不在网页版提供窗口控制按钮（浏览器窗口由浏览器管理）。
- 不改桌面版任何现有行为。
- 不做网页版的账号编辑/设置写操作的额外扩展（设置面板在 web 端现有能力维持现状，仅补齐跳转与会话面板）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：网页版打开 `#/history` 呈现会话面板，会话库列表与桌面版同源数据一致，可翻页/筛选/打开会话。
- [ ] AC2：网页版用量、代理、会话、设置各面板均有一致的面板互跳入口，点击后在浏览器内切换到对应 hash 路由；当前面板对应入口按桌面版同一规则隐藏。
- [ ] AC3：网页版不渲染最小化/最大化/关闭控件，其余控制区与面板内容同桌面版一致。
- [ ] AC4：现有 web 与 electron e2e 全部通过，无回归。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试（web e2e 走 mock local-api + synthetic fixture，断言 history 路由渲染与互跳；会话面板 web 版所需的 HTTP 桥缺口补测同步添加）。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- web e2e（mock local-api + synthetic fixture，t015/t010 基建）：history 路由渲染、会话库列表、互跳入口。
- 若需补 local-api 会话历史 endpoint：服务端单测/集成测试覆盖新 endpoint 的参数与响应契约。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- local-api HTTP 桥对会话历史 API 的覆盖面：`UNVERIFIED-SPIKE`，执行期 Step 1 对照 SessionShell 用到的 `window.usageboard` 会话历史方法清单与 `usageboard-web` / local-api server 已暴露的 endpoint，列出缺口；缺口决定本 task 是否含服务端 endpoint 新增（若有缺口，review 范围含新 endpoint 契约）。

### 风险与回退

- 风险：会话历史 HTTP 桥缺口大时会话面板 web 化工作量显著上升；web 端无窗口单例概念，多面板「互跳」语义在浏览器内为路由切换而非窗口切换（按用户描述即如此）。
- 回退：单 commit revert；新增 endpoint 为纯增量，不下线即无影响。

### 依赖与约束

- 与 backlog task「四面板统一自绘控制区并移除会话代理原生菜单栏」（t252）同改面板互跳控件，属 conflicts 关系，不得同批实施；若 t252 先完成，本 task 复用其互跳组件接 web 路由。
- 与 t249（bundle 代码分割）叠加时，history 路由懒加载 chunk 与 web 会话面板自然兼容，无额外约束。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：web 端面板集合与 local-api 会话历史 endpoint 覆盖面。
