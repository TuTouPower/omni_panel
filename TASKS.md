# OmniUsage 任务清单

> 已完成的 Phase 1–35 移入 `docs/archive/tasks_history.md`。
>
> **已修**：Provider 菜单编辑跳转 (`e546c88`) · use_config 跨窗口同步 (`897c4c9`) · Codex 拖动闪烁 (`13f4954`+`ebfd9c3`) · 用量标签映射 · 设置窗口任务栏归组 (`531295e`) · 账号 toggle 右对齐 (`1836f1c`)

---

## 待修

### MiMo Cookie 401

用户粘贴完整 Cookie 后仍返回 HTTP 401，需排查 Cookie 格式或过期逻辑。

- [ ] 排查 MiMo Cookie 401 根因
- [ ] 通过 9222 端口 CDP 连接浏览器自动刷新 Cookie

### 托盘重启按钮

- [ ] 托盘菜单加「重启」按钮

### 启动自动打开主面板

- [ ] 软件启动时自动弹出主面板

### Provider 菜单操作反馈无效

点击主面板 provider 卡片的「编辑/关闭/删除」后 UI 无反应。
根因：popup 前端没监听 config 变更事件，配置保存后不刷新插件列表。

- [ ] 关闭/删除后 popup 立即同步状态
- [ ] 「编辑」传入 instanceId/provider/accountId 定位到对应账号
- [ ] 新建 settings 窗口时 navigate 事件不丢失
- [ ] 补单元测试 + E2E

### 拖动按钮无法拖动

`.card-grip` 按钮的 `onMouseDown` 与父级 `draggable` 分离，从 grip 开始拖拽不可靠。

- [ ] provider/account 拖动从 grip 按钮开始也能可靠触发
- [ ] 补单元测试 + E2E

### 失败/无数据 provider 缺少折叠按钮

MiniMax 等失败卡片右侧无折叠按钮，与正常卡片不一致。

- [ ] 失败/无数据卡片统一走 CollapsibleCard shell

### 托盘右键菜单滚动条

- [ ] 菜单宽高跟随内容，不设固定高度
- [ ] 正常内容下无滚动条

### 用量周期数量

- [ ] 不显示"N个周期"元素，用量条数量只由真实数据决定

### 设置窗口最大化图标

- [ ] 最大化后按钮图标更新为最小化图标

### 开关账号折叠状态重置

- [ ] 开关账号后保持原有折叠/展开状态

### Tavily 开关联动刷新

- [ ] 开关 Tavily 不应触发 MiniMax/DeepSeek/MiMo 刷新

### 打包验收

- [ ] Phase 31.6：打包产物点击隐藏/删除确认生效
- [ ] Phase 34：逐项复核 Phase 22/24 真实验收状态

---

## Phase 36: Demo Handoff chat30-39 对齐

详细变更记录见 `docs/archive/changelog_design.md`。

### 36.1 用量条五列行结构（P0）

- [x] 5 列 `4ic minmax(0,1fr) 5ch 5ch 5ch`，gap 6px
- [x] 时间列拆分为 date + clock
- [x] value/date/clock 右对齐，tabular-nums

### 36.2 用量条颜色方案（P0）

- [x] risk-current / risk-projected / nine-cycle 三套方案
- [x] 9 色循环

### 36.3 粗胶囊型用量条（P1）

- [x] 4 列，22px 高，999px 圆角，行距 7px

### 36.4 面板宽度与 resize（P1）

- [x] 默认 482px，最小 472px，最大 780px

### 36.5 长标签映射（P2）

- [x] LABEL_MAP + 用户自定义

### 36.6 设置页更新（P1）

- [x] 窗口分组、去密钥列

### 36.7-36.9

- [x] 骨架屏优化、死代码清理、测试

### 验收标准

1. 用量条 5 列行结构全局对齐，gap 6px
2. 三套颜色方案可选，默认 risk-current
3. 胶囊型可选，默认细线型
4. 时间列 date + clock 独立对齐
5. 面板宽度 472-780px 可调
6. 设置页窗口分组、无密钥列
7. `pnpm test` 通过

---

1. 不实现本轮范围外的功能
2. 不重构无关文件
3. 不修改插件协议来适配实现
4. 每个新模块必须有测试
5. 运行测试并报告结果
6. secret 不进日志/错误消息/测试快照
7. renderer 不直接访问 Node API

## 每轮完成验证

1. 本轮改了哪些文件？
2. 哪些测试证明它工作？
